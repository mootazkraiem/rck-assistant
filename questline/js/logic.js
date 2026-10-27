/* Pure logic for Questline: no DOM access, so it runs in the browser and in Node tests. */
(function (root) {
  "use strict";

  const STATUSES = ["todo", "in_progress", "blocked", "done"];
  const STATUS_LABEL = {
    todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done",
    ready: "Ready", locked: "Waiting on deps", external: "Waiting external"
  };
  const ADR_STATUSES = ["proposed", "accepted", "superseded", "rejected"];
  const ASSUMPTION_STATES = ["unverified", "confirmed", "refuted"];
  const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
  // "report" is the one big box (Claude's completion report); the others are kept for older records.
  const EDIT_FIELDS = ["report", "notes", "testResults", "actual", "filesChanged", "limitations", "decisions", "blockers", "followUps"];
  const SCHEMA = 1;

  function emptyState() {
    return { schema: SCHEMA, quests: {}, adrs: {}, assumptions: {}, updatedAt: null };
  }

  /* Accepts anything parsed from JSON; returns {ok, errors, state} with unknown keys dropped. */
  function validateState(obj) {
    const errors = [];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, errors: ["Not an object"], state: null };
    if (obj.schema !== SCHEMA) errors.push("Unsupported schema: " + obj.schema);
    const out = emptyState();
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (obj.quests !== undefined && !isObj(obj.quests)) errors.push("quests must be an object");
    if (obj.adrs !== undefined && !isObj(obj.adrs)) errors.push("adrs must be an object");
    if (obj.assumptions !== undefined && !isObj(obj.assumptions)) errors.push("assumptions must be an object");
    if (errors.length) return { ok: false, errors, state: null };
    // _t: per-field change time (ISO), _b: per-field author. Used by mergeStates.
    const stamps = (src, clean) => {
      for (const k of ["_t", "_b"]) if (isObj(src[k])) {
        clean[k] = {};
        for (const [f, v] of Object.entries(src[k])) if (typeof v === "string") clean[k][f] = v;
      }
    };
    for (const [id, q] of Object.entries(obj.quests || {})) {
      if (!isObj(q)) continue;
      const clean = { fields: {}, ack: {}, history: [] };
      if (q.status !== undefined) {
        if (!STATUSES.includes(q.status)) { errors.push(`${id}: invalid status ${q.status}`); continue; }
        clean.status = q.status;
      }
      if (isObj(q.fields)) for (const f of EDIT_FIELDS) if (typeof q.fields[f] === "string") clean.fields[f] = q.fields[f];
      if (isObj(q.ack)) for (const [k, v] of Object.entries(q.ack)) clean.ack[k] = !!v;
      if (Array.isArray(q.history)) clean.history = q.history.filter(isObj).slice(-200);
      if (q.externalCleared !== undefined) clean.externalCleared = !!q.externalCleared;
      if (typeof q.assignee === "string" || q.assignee === null) clean.assignee = q.assignee;
      stamps(q, clean);
      out.quests[id] = clean;
    }
    for (const [id, a] of Object.entries(obj.adrs || {})) {
      if (!isObj(a)) continue;
      const clean = { history: Array.isArray(a.history) ? a.history.filter(isObj) : [] };
      if (a.status !== undefined) {
        if (!ADR_STATUSES.includes(a.status)) { errors.push(`${id}: invalid ADR status ${a.status}`); continue; }
        clean.status = a.status;
      }
      if (typeof a.notes === "string") clean.notes = a.notes;
      stamps(a, clean);
      out.adrs[id] = clean;
    }
    for (const [id, a] of Object.entries(obj.assumptions || {})) {
      if (!isObj(a)) continue;
      if (a.state !== undefined && !ASSUMPTION_STATES.includes(a.state)) { errors.push(`${id}: invalid assumption state`); continue; }
      const clean = { state: a.state || "unverified", note: typeof a.note === "string" ? a.note : "" };
      stamps(a, clean);
      out.assumptions[id] = clean;
    }
    out.updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : null;
    return { ok: errors.length === 0, errors, state: out };
  }

  const qState = (state, id) => (state.quests && state.quests[id]) || {};
  const questStatus = (q, state) => qState(state, q.id).status || q.status || "todo";
  const adrStatus = (a, state) => (state.adrs && state.adrs[a.id] && state.adrs[a.id].status) || a.status;
  const assumptionState = (a, state) => (state.assumptions && state.assumptions[a.id] && state.assumptions[a.id].state) || "unverified";
  const indexById = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

  /* done | in_progress | blocked are manual; todo resolves to locked | external | ready. */
  function derivedStatus(q, data, state) {
    const s = questStatus(q, state);
    if (s !== "todo") return s;
    const byId = data._byId || indexById(data.quests);
    if ((q.deps || []).some((d) => !byId[d] || questStatus(byId[d], state) !== "done")) return "locked";
    if (q.external && !qState(state, q.id).externalCleared) return "external";
    return "ready";
  }

  function unmetDeps(q, data, state) {
    const byId = data._byId || indexById(data.quests);
    return (q.deps || []).filter((d) => !byId[d] || questStatus(byId[d], state) !== "done");
  }

  function dependents(id, data) {
    return data.quests.filter((q) => (q.deps || []).includes(id)).map((q) => q.id);
  }

  /* Topological order; throws on a cycle (message names one cycle). */
  function topoOrder(quests) {
    const byId = indexById(quests);
    const mark = {}; const order = []; const stack = [];
    function visit(id) {
      if (mark[id] === 2) return;
      if (mark[id] === 1) {
        const i = stack.indexOf(id);
        throw new Error("Dependency cycle: " + stack.slice(i).concat(id).join(" → "));
      }
      mark[id] = 1; stack.push(id);
      for (const d of (byId[id].deps || [])) if (byId[d]) visit(d);
      stack.pop(); mark[id] = 2; order.push(id);
    }
    quests.forEach((q) => visit(q.id));
    return order;
  }

  /* Wave = longest dependency depth; quests in the same wave can run in parallel. */
  function waves(quests) {
    const byId = indexById(quests); const level = {};
    for (const id of topoOrder(quests)) {
      const deps = (byId[id].deps || []).filter((d) => byId[d]);
      level[id] = deps.length ? 1 + Math.max(...deps.map((d) => level[d])) : 0;
    }
    return level;
  }

  /* Longest chain of remaining effort (done quests weigh 0). Returns remaining quest IDs in order. */
  function criticalPath(data, state) {
    const quests = data.quests; const byId = indexById(quests);
    const dist = {}; const prev = {};
    for (const id of topoOrder(quests)) {
      const q = byId[id];
      const w = questStatus(q, state) === "done" ? 0 : (q.hours || 0);
      let best = 0, bestDep = null;
      for (const d of (q.deps || [])) if (byId[d] && dist[d] > best) { best = dist[d]; bestDep = d; }
      dist[id] = best + w; prev[id] = bestDep;
    }
    let end = null;
    for (const id of Object.keys(dist)) if (end === null || dist[id] > dist[end]) end = id;
    const path = [];
    for (let cur = end; cur; cur = prev[cur]) path.unshift(cur);
    return { path: path.filter((id) => questStatus(byId[id], state) !== "done"), hours: end ? dist[end] : 0 };
  }

  function nextAvailable(data, state) {
    const crit = new Set(criticalPath(data, state).path);
    const phaseIdx = Object.fromEntries(data.phases.map((p, i) => [p.id, i]));
    const order = Object.fromEntries(data.quests.map((q, i) => [q.id, i]));
    return data.quests
      .filter((q) => derivedStatus(q, data, state) === "ready")
      .sort((a, b) =>
        (crit.has(b.id) - crit.has(a.id)) ||
        (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) ||
        (phaseIdx[a.phase] - phaseIdx[b.phase]) ||
        (order[a.id] - order[b.id]));
  }

  function progress(data, state) {
    const tally = (qs) => {
      const r = { total: qs.length, done: 0, hours: 0, hoursDone: 0, by: { done: 0, in_progress: 0, blocked: 0, ready: 0, locked: 0, external: 0 } };
      for (const q of qs) {
        const d = derivedStatus(q, data, state);
        r.by[d] = (r.by[d] || 0) + 1;
        r.hours += q.hours || 0;
        if (d === "done") { r.done++; r.hoursDone += q.hours || 0; }
      }
      r.pct = r.hours ? Math.round((100 * r.hoursDone) / r.hours) : 0;
      return r;
    };
    return {
      overall: tally(data.quests),
      phases: data.phases.map((p) => ({ phase: p, ...tally(data.quests.filter((q) => q.phase === p.id)) }))
    };
  }

  function currentPhase(data, state) {
    for (const p of data.phases) {
      const qs = data.quests.filter((q) => q.phase === p.id);
      if (qs.some((q) => questStatus(q, state) !== "done")) return p;
    }
    return data.phases[data.phases.length - 1];
  }

  function milestoneStatus(m, data, state) {
    const byId = data._byId || indexById(data.quests);
    const qs = m.quests.map((id) => byId[id]).filter(Boolean);
    const done = qs.filter((q) => questStatus(q, state) === "done").length;
    return { done, total: qs.length, complete: qs.length > 0 && done === qs.length };
  }

  function filterQuests(data, state, f) {
    const text = (f.text || "").trim().toLowerCase();
    return data.quests.filter((q) => {
      const d = derivedStatus(q, data, state);
      if (f.phase && q.phase !== f.phase) return false;
      if (f.priority && q.priority !== f.priority) return false;
      if (f.role && q.role !== f.role) return false;
      if (f.assignee) {
        const a = assigneeOf(q, state);
        if (f.assignee === "__none" ? a : a !== f.assignee) return false;
      }
      if (f.status) {
        if (f.status === "todo") { if (!["ready", "locked", "external"].includes(d)) return false; }
        else if (d !== f.status) return false;
      }
      if (text) {
        const hay = [q.id, q.title, q.desc, q.objective, (q.adrs || []).join(" "), (q.steps || []).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });
  }

  function search(data, text) {
    const t = (text || "").trim().toLowerCase();
    if (t.length < 2) return [];
    const hits = [];
    const score = (id, title, body) => {
      const tl = title.toLowerCase();
      if (id.toLowerCase() === t) return 100;
      if (id.toLowerCase().includes(t)) return 80;
      if (tl.includes(t)) return 60;
      if (body.toLowerCase().includes(t)) return 20;
      return 0;
    };
    for (const q of data.quests) {
      const s = score(q.id, q.title, [q.desc, q.objective, q.why, (q.steps || []).join(" ")].join(" "));
      if (s) hits.push({ kind: "quest", id: q.id, title: q.title, score: s });
    }
    for (const a of data.adrs) {
      const s = score(a.id, a.title, [a.context, a.decision, (a.openQuestions || []).join(" ")].join(" "));
      if (s) hits.push({ kind: "adr", id: a.id, title: a.title, score: s });
    }
    for (const d of data.docs) {
      const s = score(d.id, d.title, d.html.replace(/<[^>]+>/g, " "));
      if (s) hits.push({ kind: "doc", id: d.id, title: d.title, score: s });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 25);
  }

  const bullets = (arr, prefix = "- ") => (arr && arr.length ? arr.map((x) => prefix + x).join("\n") : prefix + "None");
  const numbered = (arr) => (arr && arr.length ? arr.map((x, i) => `${i + 1}. ${x}`).join("\n") : "1. None");

  function standardDoD(q) {
    return [
      "All acceptance criteria are met and ticked in Questline",
      "Required tests pass; exact commands and results recorded",
      "Evidence saved: " + ((q.evidence || []).join(", ") || "n/a"),
      "Completion report recorded (actual results, files changed, limitations, decisions, follow-ups)",
      "No files outside the quest scope were changed"
    ];
  }

  /* Ready-to-paste Claude Code instruction for one quest. */
  function buildPrompt(q, data, state) {
    const P = data.project; const byId = data._byId || indexById(data.quests);
    const adrById = indexById(data.adrs);
    const phase = data.phases.find((p) => p.id === q.phase);
    const adrLines = (q.adrs || []).map((id) => {
      const a = adrById[id];
      if (!a) return `- ${id}`;
      // Whole decision on one line (decisions are multi-line lists); full text lives in questline/data/adrs.js.
      const flat = a.decision.replace(/\s*\n+\s*/g, " ").trim();
      const dec = flat.length > 500 ? flat.slice(0, 497) + "…" : flat;
      return `- ${a.id} ${a.title} [${adrStatus(a, state)}]: ${dec}`;
    });
    const depLines = (q.deps || []).map((d) => `- ${d} ${byId[d] ? byId[d].title : "(unknown)"}: ${byId[d] ? STATUS_LABEL[questStatus(byId[d], state)] : "?"}`);
    const unmet = unmetDeps(q, data, state);
    const st = qState(state, q.id).fields || {};
    const tests = q.tests || {};
    const sections = [
      `# RCK AI Assistant: Quest ${q.id}: ${q.title}`,
      `## 1. Project context\n${P.agentContext}\nWorking directory: ${P.workingDir}\nPhase: ${phase ? phase.id + " " + phase.name : q.phase}. Responsible role: ${data.roles[q.role] || q.role}.`,
      `## 2. Quest objective\n${q.objective}\n\nWhy it matters: ${q.why}`,
      `## 3. Relevant ADRs (read them; do not contradict accepted ones; flag conflicts)\n${adrLines.join("\n") || "- None"}`,
      `## 4. Prerequisites\nCompleted quests this depends on:\n${depLines.join("\n") || "- None"}\n` +
        (unmet.length ? `WARNING: these dependencies are not marked done: ${unmet.join(", ")}. Verify their outputs exist before starting; if missing, stop and report.\n` : "") +
        `Other prerequisites:\n${bullets(q.prereqs)}` +
        (q.external ? `\nExternal dependency: ${q.external}. Do not proceed unless I have confirmed it is resolved.` : ""),
      `## 5. Implementation scope\nFirst inspect the existing files relevant to this quest and summarise what already exists.\nSteps:\n${numbered(q.steps)}\n\nFiles expected to change (do not modify any other file):\n${bullets(q.files)}\n\nCommands:\n${bullets(q.commands)}\n\nExpected outputs:\n${bullets(q.outputs)}`,
      `## 6. Validation requirements\nUnit tests:\n${bullets(tests.unit)}\nIntegration tests:\n${bullets(tests.integration)}\nManual verification:\n${bullets(tests.manual)}\nExpected result: ${q.expected || "see acceptance criteria"}\nKnown failure cases and fixes:\n${bullets((q.failures || []).map((f) => `${f[0]} → ${f[1]}`))}`,
      `## 7. Acceptance criteria (all must be met)\n${bullets(q.acceptance)}\n\nDefinition of done:\n${bullets(standardDoD(q))}`,
      `## 8. Restrictions\n${bullets(P.restrictions)}`,
      (st.notes || st.blockers ? `## Notes from earlier work on this quest\n${st.notes || ""}${st.blockers ? "\nRecorded blockers: " + st.blockers : ""}` : null),
      `## 9. Required completion report\nWhen finished, reply with exactly these sections:\n1. Summary: one paragraph.\n2. Files changed: path, created/modified, one line each.\n3. Commands run: each exact command with its result (pass/fail counts, key numbers).\n4. Acceptance criteria: each one marked MET or NOT MET with evidence.\n5. Actual results and measurements.\n6. Known limitations.\n7. Decisions made, and any decision that needs my approval.\n8. Follow-up tasks.\n9. Cost incurred (expected: none).\n\nThen STOP. Do not start another quest. Wait for my next instruction.`
    ].filter(Boolean);
    return sections.join("\n\n");
  }

  function toMarkdown(data, state) {
    const L = [];
    const P = data.project; const prog = progress(data, state); const crit = criticalPath(data, state);
    const lv = waves(data.quests);
    L.push(`# ${P.name}: Roadmap`, "", `_Generated from Questline on ${new Date().toISOString().slice(0, 10)}. Source of truth: questline/data/*.js plus your saved progress._`, "");
    L.push("## Mission", P.mission, "", "## Final objective", P.finalObjective, "", "## Immediate priority", P.immediatePriority, "");
    L.push(`## Progress`, `${prog.overall.done}/${prog.overall.total} quests done, ${prog.overall.pct}% of estimated effort (${prog.overall.hoursDone}/${prog.overall.hours} h).`, "");
    L.push("| Phase | Done | Effort % |", "|---|---|---|");
    for (const p of prog.phases) L.push(`| ${p.phase.id} ${p.phase.name} | ${p.done}/${p.total} | ${p.pct}% |`);
    L.push("", "## Critical path (remaining)", crit.path.join(" → ") + ` (${crit.hours} h)`, "");
    L.push("## Next available quests");
    for (const q of nextAvailable(data, state).slice(0, 8)) L.push(`- ${q.id} ${q.title} (${q.priority}, ${q.hours} h)`);
    L.push("", "## Milestones");
    for (const m of data.milestones) { const s = milestoneStatus(m, data, state); L.push(`- ${m.id} ${m.title}: ${s.done}/${s.total}${m.external ? " (external dependency)" : ""}`); }
    L.push("", "## External dependencies");
    for (const e of data.externalDeps) L.push(`- ${e.id} ${e.title}: blocks ${e.blocks.join(", ") || "nothing yet"}; owner: ${e.owner}`);
    L.push("", "## Risks");
    for (const r of data.risks) L.push(`- ${r.id} [${r.level}] ${r.title}: ${r.mitigation}`);
    L.push("", "## Confirmed facts");
    for (const f of data.facts) L.push(`- ${f.id}${f.reported ? " (reported)" : ""}: ${f.text} (source: ${f.source})`);
    L.push("", "## Assumptions to verify");
    for (const a of data.assumptions) L.push(`- ${a.id} [${assumptionState(a, state)}] ${a.text} (verify in ${a.verifyIn})`);
    L.push("", "## Unresolved decisions");
    for (const a of data.adrs.filter((a) => adrStatus(a, state) === "proposed")) L.push(`- ${a.id} ${a.title}: ${(a.openQuestions || ["needs acceptance"]).join("; ")}`);
    L.push("", "## ADR registry", "| ID | Title | Status |", "|---|---|---|");
    for (const a of data.adrs) L.push(`| ${a.id} | ${a.title} | ${adrStatus(a, state)} |`);
    for (const p of data.phases) {
      L.push("", `## ${p.id}: ${p.name}`, p.goal, "");
      for (const q of data.quests.filter((q) => q.phase === p.id)) {
        L.push(`### ${q.id} ${q.title}`, `Status: ${STATUS_LABEL[derivedStatus(q, data, state)]} · Priority ${q.priority} · ${q.hours} h · ${data.roles[q.role]} · Wave ${lv[q.id]}`);
        L.push(`Depends on: ${(q.deps || []).join(", ") || "none"} · ADRs: ${(q.adrs || []).join(", ")}${q.external ? " · External: " + q.external : ""}`, "");
        L.push(`**Objective:** ${q.objective}`, "", "**Acceptance:**", bullets(q.acceptance), "");
      }
    }
    return L.join("\n");
  }

  /* Data integrity problems (empty list = healthy). Used by tests and shown in the UI. */
  function integrityErrors(data) {
    const errs = [];
    const dup = (list, kind) => { const seen = new Set(); for (const x of list) { if (seen.has(x.id)) errs.push(`Duplicate ${kind} id ${x.id}`); seen.add(x.id); } };
    dup(data.quests, "quest"); dup(data.adrs, "ADR"); dup(data.docs, "doc");
    const qIds = new Set(data.quests.map((q) => q.id)); const aIds = new Set(data.adrs.map((a) => a.id));
    const phaseIds = new Set(data.phases.map((p) => p.id));
    for (const q of data.quests) {
      if (!phaseIds.has(q.phase)) errs.push(`${q.id}: unknown phase ${q.phase}`);
      if (!data.roles[q.role]) errs.push(`${q.id}: unknown role ${q.role}`);
      if (!(q.priority in PRIORITY_ORDER)) errs.push(`${q.id}: unknown priority ${q.priority}`);
      if (!STATUSES.includes(q.status)) errs.push(`${q.id}: invalid status ${q.status}`);
      for (const f of ["title", "desc", "objective", "why"]) if (!q[f]) errs.push(`${q.id}: missing ${f}`);
      for (const f of ["steps", "acceptance", "evidence", "files"]) if (!Array.isArray(q[f]) || !q[f].length) errs.push(`${q.id}: ${f} must be a non-empty list`);
      if (!(q.hours > 0)) errs.push(`${q.id}: hours must be > 0`);
      for (const d of q.deps || []) if (!qIds.has(d)) errs.push(`${q.id}: unknown dependency ${d}`);
      for (const a of q.adrs || []) if (!aIds.has(a)) errs.push(`${q.id}: unknown ADR ${a}`);
    }
    for (const a of data.adrs) {
      if (!ADR_STATUSES.includes(a.status)) errs.push(`${a.id}: invalid status`);
      for (const f of ["context", "decision", "security", "performance"]) if (!a[f]) errs.push(`${a.id}: missing ${f}`);
      for (const f of ["alternatives", "reasons", "consequences", "acceptance", "history"]) if (!Array.isArray(a[f]) || !a[f].length) errs.push(`${a.id}: ${f} must be a non-empty list`);
      if (a.status === "proposed" && !(a.openQuestions && a.openQuestions.length)) errs.push(`${a.id}: proposed ADR needs openQuestions`);
      for (const r of a.related || []) if (!aIds.has(r)) errs.push(`${a.id}: unknown related ADR ${r}`);
      for (const q of a.quests || []) if (!qIds.has(q)) errs.push(`${a.id}: unknown quest ${q}`);
    }
    for (const m of data.milestones) for (const q of m.quests) if (!qIds.has(q)) errs.push(`${m.id}: unknown quest ${q}`);
    for (const e of data.externalDeps) for (const q of e.blocks) if (!qIds.has(q)) errs.push(`${e.id}: unknown quest ${q}`);
    for (const a of data.assumptions) if (!qIds.has(a.verifyIn)) errs.push(`${a.id}: unknown verifyIn ${a.verifyIn}`);
    for (const d of data.docs) if (!["implemented", "partial", "planned"].includes(d.status)) errs.push(`${d.id}: invalid doc status`);
    try { topoOrder(data.quests); } catch (e) { errs.push(e.message); }
    return errs;
  }

  /* ───────── team sync: field stamps, merge, permissions ───────── */

  /* Field keys: quests use status | assignee | externalCleared | f.<field> | ack.<i>;
     ADRs use status | notes; assumptions use state | note. */
  function getKey(rec, key) {
    if (key.startsWith("f.")) return (rec.fields || {})[key.slice(2)];
    if (key.startsWith("ack.")) return (rec.ack || {})[key.slice(4)];
    return rec[key];
  }
  function setKey(rec, key, val) {
    if (key.startsWith("f.")) { (rec.fields = rec.fields || {})[key.slice(2)] = val; return; }
    if (key.startsWith("ack.")) { (rec.ack = rec.ack || {})[key.slice(4)] = val; return; }
    if (val === undefined) delete rec[key]; else rec[key] = val;
  }
  function keysOf(rec, kind) {
    const keys = new Set(Object.keys(rec._t || {}));
    const base = kind === "quest" ? ["status", "assignee", "externalCleared"] : kind === "adr" ? ["status", "notes"] : ["state", "note"];
    for (const k of base) if (rec[k] !== undefined) keys.add(k);
    if (kind === "quest") {
      for (const f of Object.keys(rec.fields || {})) keys.add("f." + f);
      for (const i of Object.keys(rec.ack || {})) keys.add("ack." + i);
    }
    return [...keys];
  }
  /* Record that `key` of `rec` changed now, by `user`. */
  function stamp(rec, key, user, at) {
    rec._t = rec._t || {}; rec._b = rec._b || {};
    rec._t[key] = at || new Date().toISOString();
    if (user) rec._b[key] = user; else delete rec._b[key];
  }
  /* Mark every value in the state as changed now (used after import/restore so it wins the merge). */
  function restamp(state, user) {
    const at = new Date().toISOString();
    for (const r of Object.values(state.quests)) for (const k of keysOf(r, "quest")) stamp(r, k, user, at);
    for (const r of Object.values(state.adrs)) for (const k of keysOf(r, "adr")) stamp(r, k, user, at);
    for (const r of Object.values(state.assumptions)) for (const k of keysOf(r, "assumption")) stamp(r, k, user, at);
    return state;
  }
  function memberRoles(team) {
    return Object.fromEntries(((team && team.members) || []).map((m) => [m.id, m.role]));
  }
  /* Merge every member's state file. Per field, the latest stamp wins.
     Permissions are enforced here, so a hand-edited file cannot bypass them:
       owner       → everything
       contributor → only quests assigned to them (never the assignee itself)
       viewer / unknown members → ignored */
  function mergeStates(entries, team) {
    const roles = memberRoles(team);
    const out = emptyState();
    const clone = (v) => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);
    const take = (target, src, key) => {
      const t = (src._t || {})[key] || "";
      const cur = target._t && target._t[key];
      if (cur !== undefined && !(t > cur)) return;
      setKey(target, key, clone(getKey(src, key)));
      target._t = target._t || {}; target._b = target._b || {};
      target._t[key] = t;
      const b = (src._b || {})[key];
      if (b) target._b[key] = b; else delete target._b[key];
    };
    const mergeHistory = (target, src) => {
      if (!(src.history || []).length) return;
      const seen = new Set((target.history || []).map((h) => `${h.at}|${h.to}|${h.by || ""}`));
      target.history = (target.history || []).concat(src.history.filter((h) => !seen.has(`${h.at}|${h.to}|${h.by || ""}`)));
      target.history.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      target.history = target.history.slice(-200);
    };
    const blank = (kind) => (kind === "quest" ? { fields: {}, ack: {}, history: [] } : kind === "adr" ? { history: [] } : { state: "unverified", note: "" });
    const apply = (section, kind, src, allowKey) => {
      for (const [id, rec] of Object.entries(src[section] || {})) {
        const keys = keysOf(rec, kind).filter((k) => allowKey(id, k));
        if (!keys.length) continue;
        const target = (out[section][id] = out[section][id] || blank(kind));
        for (const k of keys) take(target, rec, k);
        if (kind !== "assumption") mergeHistory(target, rec);
      }
    };
    const owners = entries.filter((e) => roles[e.user] === "owner");
    const contributors = entries.filter((e) => roles[e.user] === "contributor");
    for (const e of owners) {
      apply("quests", "quest", e.state, () => true);
      apply("adrs", "adr", e.state, () => true);
      apply("assumptions", "assumption", e.state, () => true);
    }
    // Assignments are final after the owners' pass: contributors can never change them.
    for (const e of contributors) {
      apply("quests", "quest", e.state, (id, k) => k !== "assignee" && out.quests[id] && out.quests[id].assignee === e.user);
    }
    const times = entries.map((e) => e.state.updatedAt).filter(Boolean).sort();
    out.updatedAt = times.length ? times[times.length - 1] : null;
    return out;
  }
  /* session: {mode: 'local'|'desktop'|'viewer', user, role} */
  function canEditQuest(session, q, state) {
    if (!session || session.mode === "local") return true;
    if (session.mode === "viewer") return false;
    if (session.role === "owner") return true;
    if (session.role === "contributor") return !!(state.quests[q.id] && state.quests[q.id].assignee === session.user);
    return false;
  }
  function canEditProject(session) {
    return !session || session.mode === "local" || (session.mode === "desktop" && session.role === "owner");
  }
  const assigneeOf = (q, state) => (state.quests[q.id] && state.quests[q.id].assignee) || null;
  /* Latest status changes across quests and ADRs, newest first. */
  function recentActivity(data, state, n) {
    const out = [];
    for (const [id, r] of Object.entries(state.quests)) for (const h of r.history || []) out.push({ kind: "quest", id, ...h });
    for (const [id, r] of Object.entries(state.adrs)) for (const h of r.history || []) out.push({ kind: "adr", id, ...h });
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n || 12);
  }

  /* Adds the id index used by the helpers. */
  function prepare(data) {
    data._byId = indexById(data.quests);
    return data;
  }

  const api = {
    STATUSES, STATUS_LABEL, ADR_STATUSES, ASSUMPTION_STATES, PRIORITY_ORDER, EDIT_FIELDS, SCHEMA,
    emptyState, validateState, questStatus, adrStatus, assumptionState, derivedStatus, unmetDeps, dependents,
    topoOrder, waves, criticalPath, nextAvailable, progress, currentPhase, milestoneStatus, filterQuests,
    search, buildPrompt, standardDoD, toMarkdown, integrityErrors, prepare, indexById,
    stamp, restamp, mergeStates, canEditQuest, canEditProject, assigneeOf, recentActivity, keysOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QuestlineLogic = api;
})(typeof window !== "undefined" ? window : globalThis);

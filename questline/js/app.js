/* Questline UI: hash routing and rendering. Logic lives in logic.js; persistence in the
   store chosen by sync.js (browser, desktop sync folder, or read-only manager view). */
window.QuestlineStart = function (store, initialState) {
  "use strict";
  const L = window.QuestlineLogic;
  const R = window.RCK;
  const D = L.prepare({
    project: R.project, phases: R.phases, roles: R.roles, priorities: R.priorities, milestones: R.milestones,
    externalDeps: R.externalDeps, risks: R.risks, facts: R.facts, assumptions: R.assumptions,
    adrs: R.adrs, quests: R.quests, docs: R.docs
  });
  const UI_KEY = "questline-ui-v1";
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");
  const integrity = L.integrityErrors(D);
  const qById = D._byId, adrById = L.indexById(D.adrs), docById = L.indexById(D.docs);
  const phaseById = L.indexById(D.phases);

  /* ───────── session and permissions ───────── */
  const session = store.session;
  const me = session.user || null;
  const readOnly = session.mode === "viewer";
  const canP = () => L.canEditProject(session);
  const canQ = (q) => L.canEditQuest(session, q, state);
  const members = () => ((session.team && session.team.members) || []);
  const memberName = (id) => { const m = members().find((x) => x.id === id); return m ? m.name : id; };
  const ROLE_LABEL = { owner: "Owner", contributor: "Contributor", agent: "Agent (Claude Code)", viewer: "Viewer" };
  const ROLES = ["owner", "contributor", "agent", "viewer"];
  const agentIds = () => members().filter((m) => m.role === "agent").map((m) => m.id);
  // Quests assigned to an Agent get the CLI-submission prompt (tools/ql.js).
  const promptFor = (q) => L.buildPrompt(q, D, state, { agent: agentIds().includes(L.assigneeOf(q, state)) });

  /* ───────── persistence (through the store) ───────── */
  let saveTimer = null; // pending debounced save, flushed on unload
  let saveError = null;
  let state = initialState;
  let ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}"); } catch (e) { return {}; } })();
  ui = Object.assign({ theme: null, filters: {}, hideDone: false, workingDir: "" }, ui);
  if (ui.workingDir) D.project.workingDir = ui.workingDir; // project folder on this PC (Team page)

  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* prefs are optional */ } }
  const touch = (rec, key) => L.stamp(rec, key, me);
  const addSnapshot = (reason) => store.addSnapshot(reason, JSON.parse(JSON.stringify(state)));
  function save() {
    clearTimeout(saveTimer); saveTimer = null;
    if (readOnly) return;
    state.updatedAt = new Date().toISOString();
    store.save(state).then((r) => { saveError = r.ok ? null : r.error; updateSaveIndicator(); });
  }
  function updateSaveIndicator() {
    const el = $("#saveState");
    if (saveError) { el.textContent = saveError; el.className = "save-state warn"; return; }
    el.className = "save-state";
    const t = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    if (readOnly) el.textContent = t ? `Read-only · last change ${t}` : "Read-only";
    else if (store.kind === "desktop") el.textContent = t ? `Synced ${t}` : "Sync folder connected";
    else el.textContent = t ? `Saved ${t}` : "Saved locally";
  }

  function qs(id) {
    if (!state.quests[id]) state.quests[id] = { fields: {}, ack: {}, history: [] };
    const s = state.quests[id];
    s.fields = s.fields || {}; s.ack = s.ack || {}; s.history = s.history || [];
    return s;
  }

  /* ───────── helpers ───────── */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  /* Emphasis: data text may mark key words with **bold**; list items written as
     "Lead phrase: detail" get the lead phrase in bold, the detail in normal weight. */
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  /* Steps: bold the action (up to the first , ; ( or sentence end) unless a "Lead:" exists. */
  function stepLead(s) {
    s = String(s == null ? "" : s);
    if (s.includes("**") || /^[^:\n]{2,60}?:\s/.test(s)) return lead(s);
    const m = s.match(/^(.{6,70}?)([,;(]|\.\s|\.$|:)([\s\S]*)$/);
    if (m) return `<strong>${rich(m[1])}</strong>${esc(m[2])}${rich(m[3])}`;
    const words = s.split(" ");
    return words.length <= 7 ? `<strong>${rich(s)}</strong>` : `<strong>${rich(words.slice(0, 5).join(" "))}</strong> ${rich(words.slice(5).join(" "))}`;
  }
  function lead(s) {
    s = String(s == null ? "" : s);
    if (s.includes("**")) return rich(s);
    const m = s.match(/^([^:\n]{2,60}?):\s+([\s\S]+)$/);
    return m ? `<strong>${esc(m[1])}:</strong> ${rich(m[2])}` : rich(s);
  }
  /* Plain text with "- " bullets, "1. " lists and blank-line paragraphs → HTML. */
  function fmt(text) {
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^\s*-\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${lead(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${lead(m[1])}</li>`); }
      else if (!line.trim()) close();
      else { close(); out.push(`<p>${lead(line)}</p>`); }
    }
    close();
    return `<div class="fmt">${out.join("")}</div>`;
  }
  const list = (arr, cls = "") => (arr && arr.length ? `<ul class="${cls}">${arr.map((x) => `<li>${lead(x)}</li>`).join("")}</ul>` : `<p class="muted">None.</p>`);
  const olist = (arr, cls = "") => (arr && arr.length ? `<ol class="${cls}">${arr.map((x) => `<li>${lead(x)}</li>`).join("")}</ol>` : `<p class="muted">None.</p>`);
  const pill = (status, label) => `<span class="pill s-${esc(status)}">${esc(label || L.STATUS_LABEL[status] || status)}</span>`;
  const qLink = (id) => { const q = qById[id]; return q ? `<a class="chip" href="#quest/${esc(id)}" title="${esc(q.title)}">${esc(id)}</a>` : esc(id); };
  const adrLink = (id) => { const a = adrById[id]; return a ? `<a class="chip" href="#adr/${esc(id)}" title="${esc(a.title)}">${esc(id)}</a>` : esc(id); };
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch (e) { return iso; } };
  const derived = (q) => L.derivedStatus(q, D, state);

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }
  function modal(title, bodyHtml, actions) {
    const m = $("#modal");
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    const box = $("#modalActions"); box.innerHTML = "";
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn " + (a.cls || ""); b.textContent = a.label;
      b.addEventListener("click", () => { if (a.run && a.run() === false) return; closeModal(); });
      box.appendChild(b);
    }
    m.hidden = false;
    const first = box.querySelector("button:last-child"); if (first) first.focus();
  }
  function closeModal() { $("#modal").hidden = true; }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }
  const download = (filename, text, type) => store.download(filename, text, type).catch((e) => toast(e.message));
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

  /* ───────── routing ───────── */
  function route() {
    const h = decodeURIComponent(location.hash.slice(1) || "overview");
    const [pathPart, query] = h.split("?");
    const [view, id] = pathPart.split("/");
    const params = Object.fromEntries(new URLSearchParams(query || ""));
    return { view: view || "overview", id, params };
  }
  const VIEWS = { overview: viewOverview, quests: viewQuests, quest: viewQuest, graph: viewGraph, adrs: viewAdrs, adr: viewAdr, docs: viewDocs, facts: viewFacts, backup: viewBackup, team: viewTeam };
  const NAV_FOR = { quest: "quests", adr: "adrs" };
  let currentTab = "execution";
  function render(keepScroll) {
    const r = route();
    const fn = VIEWS[r.view] || viewNotFound;
    const y = window.scrollY;
    app.innerHTML = fn(r);
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (NAV_FOR[r.view] || r.view)));
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    updateSaveIndicator();
    if (r.view === "backup") fillSnapshots();
  }
  window.addEventListener("hashchange", () => { if (route().view !== "quest") currentTab = "execution"; render(false); });

  function viewNotFound() {
    return `<div class="card"><h2>Not found</h2><p>This page does not exist. <a href="#overview">Back to the overview</a>.</p></div>`;
  }

  /* ───────── overview ───────── */
  function viewOverview() {
    const P = D.project; const prog = L.progress(D, state); const o = prog.overall;
    const stage = L.currentPhase(D, state); const next = L.nextAvailable(D, state);
    const crit = L.criticalPath(D, state);
    const inProg = D.quests.filter((q) => derived(q) === "in_progress");
    const blocked = D.quests.filter((q) => derived(q) === "blocked");
    const mine = me ? D.quests.filter((q) => L.assigneeOf(q, state) === me && L.questStatus(q, state) !== "done") : [];
    const contributor = session.role === "contributor";
    const nextQ = contributor
      ? (mine.find((q) => derived(q) === "in_progress") || mine.find((q) => derived(q) === "ready") || mine[0])
      : (inProg[0] || next[0]);
    const canStart = nextQ && !readOnly && canQ(nextQ);
    const tile = (n, label, cls) => `<div class="kpi"><b class="${cls || ""}">${n}</b><span>${label}</span></div>`;
    const reported = D.facts.filter((f) => f.reported).length;
    const asum = D.assumptions.map((a) => L.assumptionState(a, state));
    return `
    <div class="page-head"><div><div class="crumbs">Revised ${esc(P.revised)}</div><h1>${esc(P.name)}</h1><p class="secondary">${rich(P.mission)}</p></div>
      <div class="btn-row"><a class="btn" href="#graph">Execution order</a><a class="btn primary" href="#quests?status=ready">Ready quests</a></div></div>
    ${integrity.length ? `<div class="callout bad"><b>Data integrity problems (${integrity.length}):</b> ${esc(integrity.slice(0, 4).join("; "))}</div>` : ""}
    ${readOnly ? `<div class="callout ext"><strong>Read-only team view.</strong> This page shows the latest progress files from the shared folder${session.savedAt ? `, last change ${esc(fmtDate(session.savedAt))}` : ""}. <button class="btn sm" data-action="reload">Refresh</button></div>` : ""}
    ${(session.errors || []).length ? `<div class="callout bad"><strong>Unreadable progress files:</strong> ${esc(session.errors.join("; "))}</div>` : ""}
    ${(session.ignored || []).length ? `<div class="callout"><strong>Ignored files in the sync folder</strong> (probably sync conflict copies; safe to delete): ${esc(session.ignored.join(", "))}</div>` : ""}
    <div class="card hero">
      <div>
        <div class="label">Immediate priority</div><p class="lead-text">${rich(P.immediatePriority)}</p>
        <div class="label">Current stage</div><p><strong>${esc(stage.id)}: ${esc(stage.name)}</strong> <span class="secondary">· ${esc(stage.goal)}</span></p>
        <div class="label">Final objective</div><p class="secondary">${rich(P.finalObjective)}</p>
        <div class="label">Overall progress (by estimated effort)</div>
        <div class="big-progress"><b>${o.pct}%</b>${progressBar(o)}<span class="muted small">${o.done}/${o.total} quests · ${o.hoursDone}/${o.hours} h</span></div>
      </div>
      <div class="next-box">
        <div class="label">${contributor ? "Your next task" : readOnly ? "Team is working on" : "Next recommended action"}</div>
        ${nextQ ? `<h3><a href="#quest/${esc(nextQ.id)}">${esc(nextQ.id)}: ${esc(nextQ.title)}</a></h3>
          <p class="small secondary">${rich(nextQ.desc)}</p>
          <div class="chips" style="margin-bottom:10px">${pill(derived(nextQ))}<span class="chip">${esc(nextQ.priority)}</span><span class="chip">${nextQ.hours} h</span>${assigneeChip(nextQ)}${crit.path.includes(nextQ.id) ? `<span class="chip crit">critical path</span>` : ""}</div>
          <div class="btn-row">${canStart ? `<button class="btn primary" data-action="start-vscode" data-id="${esc(nextQ.id)}">▶ Start in VS Code</button>` : ""}<a class="btn${canStart ? "" : " primary"}" href="#quest/${esc(nextQ.id)}">Open quest</a>${readOnly ? "" : `<button class="btn" data-action="copy-prompt" data-id="${esc(nextQ.id)}">Copy prompt</button>`}</div>
          ${!contributor && next.length > 1 ? `<p class="small muted" style="margin-top:10px">Also ready (parallel): ${next.slice(1, 6).map((q) => qLink(q.id)).join(" ")}</p>` : ""}`
        : `<p>${contributor ? "<strong>No task is assigned to you yet.</strong> The owner assigns quests on each quest page." : "No quest is ready. Check blocked and external items."}</p>`}
      </div>
    </div>
    <div class="kpis">
      ${tile(o.by.done, "Completed", "")}${tile(o.by.in_progress, "In progress")}${tile(o.by.blocked, "Blocked")}
      ${tile(o.by.ready, "Ready to start")}${tile(o.by.locked, "Waiting on dependencies")}${tile(o.by.external, "Waiting external")}
    </div>
    ${members().length ? teamOverview(mine) : ""}
    <div class="grid g2">
      <div class="card"><h2>Progress by phase</h2>
        ${prog.phases.map((p) => `<a class="phase-row" href="#quests?phase=${p.phase.id}"><span><b>${p.phase.id}</b> ${esc(p.phase.name)}<br><small>${p.done}/${p.total} quests</small></span>${progressBar(p)}<span class="small">${p.pct}%</span></a>`).join("")}
      </div>
      <div class="card"><h2>Milestones</h2>
        <table><tr><th>Milestone</th><th>Quests</th><th>State</th></tr>
        ${D.milestones.map((m) => { const s = L.milestoneStatus(m, D, state); return `<tr><td><b>${esc(m.id)}</b> ${esc(m.title)}${m.external ? ` ${pill("external", "external")}` : ""}</td><td><div class="chips">${m.quests.map(qLink).join("")}</div></td><td>${s.complete ? pill("done", "Reached") : `${s.done}/${s.total}`}</td></tr>`; }).join("")}
        </table>
      </div>
    </div>
    <div class="card"><h2>Critical path <span class="muted small">(longest chain of remaining effort: ${crit.hours} h)</span></h2>
      <div class="chips">${crit.path.map((id, i) => `${i ? '<span class="muted">→</span>' : ""}${qLink(id)}`).join(" ")}</div>
      <p class="small muted" style="margin-top:8px">The GPU deployment (P8) is not on the path to the local demo. External items delay only P7–P9.</p>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Critical external dependencies</h2>
        <table><tr><th>Dependency</th><th>Blocks</th><th>Owner</th></tr>
        ${D.externalDeps.map((e) => `<tr><td><b>${esc(e.id)}</b> ${esc(e.title)}</td><td><div class="chips">${e.blocks.map(qLink).join("") || '<span class="muted">—</span>'}</div></td><td class="small">${esc(e.owner)}</td></tr>`).join("")}
        </table>
      </div>
      <div class="card"><h2>Risks and blockers</h2>
        ${blocked.length ? `<div class="callout bad"><b>Blocked quests:</b> ${blocked.map((q) => { const f = qs(q.id).fields; const why = f.blockers || (f.report || "").trim().split("\n")[0]; return `${qLink(q.id)} ${esc(why ? why.slice(0, 160) : "(no reason recorded)")}`; }).join("<br>")}</div>` : ""}
        <table><tr><th>Risk</th><th>Mitigation</th></tr>
        ${D.risks.map((r) => `<tr><td>${pill(r.level, r.level)} <strong>${esc(r.title)}</strong><div class="small secondary">${rich(r.impact)}</div></td><td class="small">${rich(r.mitigation)}</td></tr>`).join("")}
        </table>
      </div>
    </div>
    <div class="card"><h2>Facts vs assumptions</h2>
      <p>${D.facts.length - reported} facts verified on this machine, ${reported} reported but not verified here, and ${D.assumptions.length} assumptions: ${asum.filter((s) => s === "confirmed").length} confirmed, ${asum.filter((s) => s === "refuted").length} refuted, ${asum.filter((s) => s === "unverified").length} still unverified.
      ${D.adrs.filter((a) => L.adrStatus(a, state) === "proposed").length} ADRs remain proposed (unresolved).</p>
      <a class="btn" href="#facts">Review facts and assumptions</a>
    </div>`;
  }
  function assigneeChip(q) {
    const a = L.assigneeOf(q, state);
    return a ? `<span class="chip assignee${a === me ? " me" : ""}" title="Assigned to ${esc(memberName(a))}">👤 ${esc(a === me ? "You" : memberName(a))}</span>` : "";
  }
  /* Team block on the overview: who is doing what, my tasks, latest activity. */
  function teamOverview(mine) {
    const act = L.recentActivity(D, state, 10);
    const working = members().filter((m) => m.role !== "viewer").map((m) => {
      const qsOf = D.quests.filter((q) => L.assigneeOf(q, state) === m.id);
      const open = qsOf.filter((q) => L.questStatus(q, state) !== "done");
      const now = open.filter((q) => derived(q) === "in_progress");
      return `<tr><td><strong>${esc(m.name)}</strong><div class="small secondary">${esc(ROLE_LABEL[m.role])}</div></td>
        <td>${now.length ? now.map((q) => `${qLink(q.id)} <span class="small">${esc(q.title)}</span>`).join("<br>") : '<span class="muted small">Nothing in progress</span>'}</td>
        <td class="small">${open.length} open · ${qsOf.length - open.length} done</td></tr>`;
    }).join("");
    return `<div class="grid g2">
      <div class="card"><h2>Team</h2><table><tr><th>Member</th><th>Working on</th><th>Assigned</th></tr>${working}</table>
        ${me && mine.length ? `<h3>Your open tasks</h3><div class="chips">${mine.map((q) => `${qLink(q.id)}${pill(derived(q))}`).join(" ")}</div>` : ""}</div>
      <div class="card"><h2>Recent activity</h2>${act.length ? `<ul class="history">${act.map((h) => `<li><strong>${h.kind === "quest" ? qLink(h.id) : adrLink(h.id)} ${esc(L.STATUS_LABEL[h.to] || h.to)}</strong> <span class="secondary small">· ${esc(h.by ? memberName(h.by) : "—")} · ${esc(fmtDate(h.at))}</span></li>`).join("")}</ul>` : '<p class="muted">No activity yet.</p>'}</div>
    </div>`;
  }
  function progressBar(t) {
    const w = (n) => (t.total ? (100 * n) / t.total : 0);
    return `<div class="bar" role="img" aria-label="${t.done} of ${t.total} done"><i class="b-done" style="width:${w(t.by.done)}%"></i><i class="b-prog" style="width:${w(t.by.in_progress)}%"></i><i class="b-block" style="width:${w(t.by.blocked)}%"></i></div>`;
  }

  /* ───────── quests ───────── */
  function viewQuests(r) {
    const f = Object.assign({}, ui.filters, r.params);
    const sel = (name, opts, label) => `<select data-filter="${name}" aria-label="${label}"><option value="">${label}: all</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${f[name] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const items = L.filterQuests(D, state, f);
    const crit = new Set(L.criticalPath(D, state).path);
    const groups = D.phases.map((p) => ({ p, qs: items.filter((q) => q.phase === p.id) })).filter((g) => g.qs.length);
    return `
    <div class="page-head"><div><h1>Quests</h1><p>${D.quests.length} quests in ${D.phases.length} phases. Open a quest for its steps, validation and Claude Code prompt.</p></div></div>
    <div class="filters">
      <input type="search" data-filter="text" placeholder="Filter quests…" value="${esc(f.text || "")}" aria-label="Filter quests">
      ${sel("phase", D.phases.map((p) => [p.id, `${p.id} ${p.name}`]), "Phase")}
      ${sel("status", [["ready", "Ready"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["done", "Done"], ["todo", "Not started"], ["locked", "Waiting on deps"], ["external", "Waiting external"]], "Status")}
      ${sel("priority", Object.entries(D.priorities).map(([k, v]) => [k, `${k} ${v}`]), "Priority")}
      ${sel("role", Object.entries(D.roles), "Role")}
      ${members().length ? sel("assignee", [...(me ? [[me, "Me"]] : []), ...members().filter((m) => m.role !== "viewer" && m.id !== me).map((m) => [m.id, m.name]), ["__none", "Unassigned"]], "Assignee") : ""}
      <button class="btn sm" data-action="clear-filters">Clear</button>
      <span class="muted small">${items.length} shown</span>
    </div>
    <div class="card" style="padding:0">
      ${groups.length ? groups.map((g) => `<div class="phase-head"><h3>${esc(g.p.id)}: ${esc(g.p.name)}</h3><span class="muted small">${esc(g.p.goal)}</span></div>
        <div class="quest-list">${g.qs.map((q) => questRow(q, crit)).join("")}</div>`).join("")
        : `<p style="padding:16px" class="muted">No quests match these filters.</p>`}
    </div>`;
  }
  function questRow(q, crit) {
    const d = derived(q); const unmet = L.unmetDeps(q, D, state);
    return `<a class="qrow" href="#quest/${esc(q.id)}">
      <span class="qid">${esc(q.id)}</span>
      <span style="min-width:0"><div class="qt">${esc(q.title)}</div><div class="qd">${esc(q.desc)}</div></span>
      <span class="qm">${assigneeChip(q)}${crit.has(q.id) ? `<span class="chip crit" title="On the critical path">critical</span>` : ""}<span class="chip">${esc(q.priority)}</span><span class="chip">${q.hours} h</span><span class="chip">${esc(D.roles[q.role])}</span>
        ${d === "locked" ? `<span class="chip" title="Unmet: ${esc(unmet.join(", "))}">needs ${esc(unmet.slice(0, 2).join(", "))}${unmet.length > 2 ? "…" : ""}</span>` : ""}${pill(d)}</span>
    </a>`;
  }

  function viewQuest(r) {
    const q = qById[r.id]; if (!q) return viewNotFound();
    const s = qs(q.id); const d = derived(q); const manual = L.questStatus(q, state);
    const crit = L.criticalPath(D, state).path.includes(q.id);
    const lv = L.waves(D.quests)[q.id];
    const deps = q.deps || []; const dependents = L.dependents(q.id, D);
    const idx = D.quests.indexOf(q); const prev = D.quests[idx - 1], nextQ = D.quests[idx + 1];
    const tabs = [["execution", "Execution"], ["validation", "Validation"], ["completion", "Completion"], ["history", "History"]];
    const editable = canQ(q);
    const dis = editable ? "" : " disabled";
    const statusBtns = L.STATUSES.map((st) => `<button type="button" class="st-${st}" data-action="set-status" data-id="${esc(q.id)}" data-status="${st}" aria-pressed="${manual === st}"${dis}>${esc(L.STATUS_LABEL[st])}</button>`).join("");
    const assignee = L.assigneeOf(q, state);
    const assignCell = canP() && members().length
      ? `<select data-action="assign" data-id="${esc(q.id)}" aria-label="Assign quest"><option value="">Unassigned</option>${members().filter((m) => m.role !== "viewer").map((m) => `<option value="${esc(m.id)}" ${assignee === m.id ? "selected" : ""}>${esc(m.name)}${m.id === me ? " (you)" : ""}</option>`).join("")}</select>`
      : (assignee ? esc(memberName(assignee)) : '<span class="muted">Unassigned</span>');
    return `
    <div class="crumbs"><a href="#quests">Quests</a> / <a href="#quests?phase=${esc(q.phase)}">${esc(q.phase)} ${esc(phaseById[q.phase].name)}</a> / ${esc(q.id)}</div>
    <div class="page-head"><div><h1>${esc(q.id)}: ${esc(q.title)}</h1><p class="secondary">${rich(q.desc)}</p></div>
      <div class="btn-row">${readOnly ? "" : `<button class="btn" data-action="open-project" title="Open ${esc(D.project.workingDir)} in VS Code">Open project in VS Code</button><button class="btn" data-action="preview-prompt" data-id="${esc(q.id)}">Preview prompt</button><button class="btn" data-action="copy-prompt" data-id="${esc(q.id)}">Copy prompt</button>`}${editable && !readOnly ? `<button class="btn primary" data-action="start-vscode" data-id="${esc(q.id)}" title="Marks the quest In progress and opens Claude Code in VS Code with this quest's prompt">▶ Start in VS Code</button>` : ""}</div></div>
    ${!editable && !readOnly ? `<div class="callout">You can view this quest but not change it: it is ${assignee ? `assigned to <strong>${esc(memberName(assignee))}</strong>` : "not assigned to you"}.</div>` : ""}
    ${q.external ? `<div class="callout ext"><b>External dependency:</b> ${esc(q.external)}
      <label style="display:inline-flex;gap:6px;margin-left:10px"><input type="checkbox" data-action="external-cleared" data-id="${esc(q.id)}" ${s.externalCleared ? "checked" : ""}${dis}> Resolved</label></div>` : ""}
    ${d === "locked" ? `<div class="callout">Waiting on: ${L.unmetDeps(q, D, state).map(qLink).join(" ")}. You can still prepare it, but finish its dependencies first.</div>` : ""}
    ${s._rejected ? `<div class="callout bad"><strong>A "Done" was refused</strong>${s._rejected.by ? ` (set by ${esc(memberName(s._rejected.by))}${s._rejected.at ? " on " + esc(fmtDate(s._rejected.at)) : ""})` : ""}. The quest stays In progress until these are fixed:${list(s._rejected.reasons)}</div>` : ""}
    ${agentPanel(q, s)}
    <div class="card">
      <div class="btn-row" style="justify-content:space-between;margin-bottom:14px">
        <div class="seg" role="group" aria-label="Quest status">${statusBtns}</div>
        <span>Derived: ${pill(d)} ${crit ? `<span class="chip crit">critical path</span>` : ""}</span>
      </div>
      <div class="meta">
        <div><span>Phase</span>${esc(q.phase)}: ${esc(phaseById[q.phase].name)}</div>
        <div><span>Priority</span>${esc(q.priority)} ${esc(D.priorities[q.priority])}</div>
        <div><span>Estimated effort</span>${q.hours} h</div>
        ${members().length ? `<div><span>Assigned to</span>${assignCell}</div>` : ""}
        <div><span>Responsible role</span>${esc(D.roles[q.role])}</div>
        <div><span>Execution wave</span>${lv} <span class="muted small">(same wave = can run in parallel)</span></div>
        <div><span>Related ADRs</span><div class="chips">${(q.adrs || []).map(adrLink).join("")}</div></div>
        <div class="meta-wide"><span>Dependencies</span><div class="chips">${deps.length ? deps.map((id) => `${qLink(id)}${pill(derived(qById[id]))}`).join(" ") : '<span class="muted">None</span>'}</div></div>
        <div class="meta-wide"><span>Prerequisites</span>${(q.prereqs || []).length ? rich(q.prereqs.join(" · ")) : '<span class="muted">None</span>'}</div>
        <div class="meta-wide"><span>Unlocks</span><div class="chips">${dependents.length ? dependents.map(qLink).join("") : '<span class="muted">Nothing</span>'}</div></div>
      </div>
    </div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-action="tab" data-tab="${k}" aria-selected="${currentTab === k}">${t}</button>`).join("")}</div>
    <div class="card">${({ execution: questExecution, validation: questValidation, completion: questCompletion, history: questHistory })[currentTab](q, s)}</div>
    <div class="pager">${prev ? `<a class="btn" href="#quest/${esc(prev.id)}">← ${esc(prev.id)}</a>` : "<span></span>"}${nextQ ? `<a class="btn" href="#quest/${esc(nextQ.id)}">${esc(nextQ.id)} →</a>` : ""}</div>`;
  }
  function questExecution(q) {
    return `<h3>Objective</h3><div class="lead-box">${fmt(q.objective)}</div>
      <p class="secondary"><strong>Why:</strong> ${rich(q.why)}</p>
      <h3>Exact steps</h3>${q.steps.length ? `<ol class="steps">${q.steps.map((x) => `<li>${stepLead(x)}</li>`).join("")}</ol>` : '<p class="muted">None.</p>'}
      <div class="grid g2 secondary"><div><h3>Files or components expected to change</h3>${list(q.files, "files")}</div><div><h3>Expected outputs</h3>${list(q.outputs)}</div></div>
      <h3>Commands</h3>${(q.commands || []).length ? q.commands.map((c, i) => `<div class="cmd"><pre>${esc(c)}</pre><button class="btn sm" data-action="copy-cmd" data-id="${esc(q.id)}" data-i="${i}">Copy</button></div>`).join("") : '<p class="muted">No commands.</p>'}
      <h3>Potential failures and troubleshooting</h3>
      ${(q.failures || []).length ? `<table><tr><th>If this happens</th><th>Do this</th></tr>${q.failures.map((f) => `<tr><td><strong>${rich(f[0])}</strong></td><td class="secondary">${rich(f[1])}</td></tr>`).join("")}</table>` : '<p class="muted">None identified.</p>'}`;
  }
  /* Claude's report (written by tools/ql.js into the agent's own file) and the owner's review.
     Everything is shown as text: nothing in a report is ever executed. */
  function agentPanel(q, s) {
    const { report: r, review, accepted } = L.agentReportOf(s);
    if (!r) return "";
    const state_ = accepted ? ["done", "Accepted"] : review ? ["blocked", "Rejected"] : ["proposed", "Awaiting review"];
    const acc = q.acceptance || [];
    const t = r.tests || {};
    const rows = (arr, fn) => (Array.isArray(arr) && arr.length ? arr.map(fn).join("") : "");
    const owner = canP() && !readOnly;
    return `<div class="card agent-report">
      <div class="btn-row" style="justify-content:space-between">
        <h2 style="margin:0">Claude's report: ${pill(state_[0], state_[1])}</h2>
        <span class="small secondary">Submitted ${esc(fmtDate(r.submittedAt))}${r.agent ? " by " + esc(memberName(r.agent)) : ""} · reported status: <strong>${esc(r.status)}</strong></span>
      </div>
      ${review && !accepted ? `<div class="callout bad"><strong>Rejected</strong> by ${esc(memberName(review.by))} on ${esc(fmtDate(review.at))}${review.note ? `: ${esc(review.note)}` : ""}. Claude can resubmit.</div>` : ""}
      ${accepted ? `<div class="callout ok"><strong>Accepted</strong> by ${esc(memberName(review.by))} on ${esc(fmtDate(review.at))}. Check the ticks on the Validation tab, then click <strong>Done</strong>.</div>` : ""}
      <p>${esc(r.summary || "")}</p>
      <div class="grid g2">
        <div><h3>Acceptance criteria</h3><table><tr><th>Criterion</th><th>Claude says</th><th>Evidence</th></tr>
          ${rows(r.acceptance, (a) => `<tr><td>${esc(acc[a.index] || `#${a.index + 1}`)}</td><td>${a.met ? pill("done", "met") : pill("blocked", "not met")}</td><td class="small">${esc(a.evidence || "")}</td></tr>`)}</table></div>
        <div><h3>Tests</h3><p><strong>${Number(t.passed) || 0} passed</strong>, <strong>${Number(t.failed) || 0} failed</strong></p>${t.summary ? `<pre class="small">${esc(t.summary)}</pre>` : ""}
          <h3>Files</h3>${Array.isArray(r.filesChanged) && r.filesChanged.length ? `<ul class="files">${r.filesChanged.map((f) => `<li>${esc(f.change)}: ${esc(f.path)}</li>`).join("")}</ul>` : '<p class="muted">None.</p>'}</div>
      </div>
      <h3>Commands Claude reports it ran <span class="muted small">(text only, never executed here)</span></h3>
      ${rows(r.commands, (c) => `<div class="cmd"><pre>${esc(c.command)}${c.exitCode !== undefined ? `   → exit ${esc(c.exitCode)}` : ""}\n${esc(c.result || "")}</pre></div>`) || '<p class="muted">None.</p>'}
      <div class="grid g3">
        <div><h3>Limitations</h3>${list(r.limitations)}</div>
        <div><h3>Decisions</h3>${list(r.decisions)}</div>
        <div><h3>Blockers</h3>${list(r.blockers)}</div>
      </div>
      ${r.nextQuest ? `<p><strong>Recommended next quest:</strong> ${qLink(r.nextQuest)}</p>` : ""}
      ${owner && !accepted ? `<div class="btn-row"><button class="btn primary" data-action="accept-report" data-id="${esc(q.id)}">Accept report</button><button class="btn danger" data-action="reject-report" data-id="${esc(q.id)}">Reject report</button>
        <span class="small muted">Accepting ticks the criteria Claude marked as met and records the report. It does not mark the quest Done.</span></div>` : ""}
    </div>`;
  }
  function reviewReport(id, decision, note) {
    const q = qById[id]; const s = qs(id);
    const { report } = L.agentReportOf(s);
    if (!report || !canP()) return;
    const ticked = [];
    if (decision === "accepted") {
      for (const a of report.acceptance || []) {
        if (a.met && Number.isInteger(a.index) && a.index >= 0 && a.index < (q.acceptance || []).length) {
          s.ack[a.index] = true; touch(s, "ack." + a.index); ticked.push(a.index);
        }
      }
    }
    s.fields.reportReview = JSON.stringify({ submittedAt: report.submittedAt, decision, by: me || "owner", at: new Date().toISOString(), ...(note ? { note } : {}), ...(ticked.length ? { ticked } : {}) });
    touch(s, "f.reportReview");
    save(); render(true);
    toast(decision === "accepted" ? `Report accepted: ${ticked.length} criteria ticked. Click Done when you're satisfied.` : "Report rejected. Claude can resubmit.");
  }

  // The same checks the merge enforces (logic.js completionChecks): one rule set everywhere.
  const gateChecks = (q) => L.completionChecks(q, D, state).map((c) => [c.label, c.ok]);
  function questValidation(q, s) {
    const t = q.tests || {};
    return `<h3>Acceptance criteria <span class="muted small">(tick each one as you verify it)</span></h3>
      <ul class="checklist must">${(q.acceptance || []).map((a, i) => `<li><input type="checkbox" id="ack-${i}" data-action="ack" data-id="${esc(q.id)}" data-i="${i}" ${s.ack[i] ? "checked" : ""}${canQ(q) ? "" : " disabled"}><label for="ack-${i}">${rich(a)}</label></li>`).join("")}</ul>
      <p><strong>Expected result:</strong> ${rich(q.expected || "See the acceptance criteria.")}</p>
      <div class="grid g3"><div><h3>Unit tests</h3>${list(t.unit)}</div><div><h3>Integration tests</h3>${list(t.integration)}</div><div><h3>Manual verification</h3>${list(t.manual)}</div></div>
      <div class="secondary"><h3>Evidence or reports to save</h3>${list(q.evidence)}</div>
      <h3>Conditions before marking complete</h3>
      <ul class="checklist gate">${gateChecks(q).map(([t2, ok]) => `<li class="${ok ? "ok" : ""}">${esc(t2)}</li>`).join("")}</ul>`;
  }
  function questCompletion(q, s) {
    const ro = canQ(q) ? "" : " readonly";
    const by = (k) => { const b = s._b && s._b["f." + k]; return b && b !== me ? ` <span class="muted small">· by ${esc(memberName(b))}</span>` : ""; };
    // Earlier records typed into the old separate boxes stay visible, read-only.
    const OLD = [["actual", "Actual results"], ["testResults", "Test results"], ["filesChanged", "Files changed"], ["limitations", "Known limitations"],
      ["decisions", "Decisions made"], ["blockers", "Blockers"], ["followUps", "Follow-up tasks"], ["notes", "Notes"]];
    const old = OLD.filter(([k]) => (s.fields[k] || "").trim());
    return `<label class="field"><span><strong>Completion report</strong>${by("report")} <span class="muted small">(paste Claude's whole report here, or write your own notes; saved automatically)</span></span>
        <textarea class="report-box" data-field="report" data-id="${esc(q.id)}" rows="22" placeholder="${ro ? "" : "Paste the completion report: summary, files changed, commands and results, acceptance criteria, measurements, limitations, decisions, follow-ups, blockers."}"${ro}>${esc(s.fields.report || "")}</textarea></label>
      ${old.length ? `<h3>Earlier notes</h3>${old.map(([k, label]) => `<p class="small"><strong>${label}${by(k)}:</strong></p><div class="readonly">${esc(s.fields[k])}</div>`).join("")}` : ""}
      ${q.actual ? `<h3>Recorded results (from the project data)</h3><div class="readonly">${esc(q.actual)}</div>` : ""}
      ${q.filesChanged ? `<div class="readonly"><b>Files:</b> ${esc(q.filesChanged)}</div>` : ""}
      <h3>Definition of done</h3>${list(L.standardDoD(q), "secondary")}`;
  }
  function questHistory(q, s) {
    const h = (s.history || []).slice().reverse();
    return `<h3>Status history</h3>${h.length ? `<ul class="history">${h.map((e) => `<li><strong>${esc(L.STATUS_LABEL[e.from] || e.from)} → ${esc(L.STATUS_LABEL[e.to] || e.to)}</strong> <span class="secondary">· ${esc(fmtDate(e.at))}${e.by ? " · " + esc(memberName(e.by)) : ""}${e.forced ? " · marked done with unmet conditions" : ""}</span></li>`).join("")}</ul>` : '<p class="muted">No changes recorded yet.</p>'}`;
  }

  function recordStatus(id, to) {
    const s = qs(id); const from = L.questStatus(qById[id], state);
    s.status = to; touch(s, "status");
    delete s._rejected; // a new decision replaces an earlier refusal
    s.history.push({ at: new Date().toISOString(), from, to, ...(me ? { by: me } : {}) });
    save();
  }
  function setStatus(id, to) {
    const q = qById[id]; const s = qs(id); const from = L.questStatus(q, state);
    if (from === to || !canQ(q)) return;
    if (to === "done") {
      // No override: Done needs every condition (the merge would refuse it anyway).
      const unmet = L.completionProblems(q, D, state);
      if (unmet.length) {
        modal(`${id} can't be marked Done yet`, `<p>These conditions are not met:</p>${list(unmet)}<p class="small muted">Fix them (Validation and Completion tabs), then click Done again.</p>`, [{ label: "OK", cls: "primary" }]);
        return;
      }
    }
    recordStatus(id, to); render(true);
    if (to === "blocked") { currentTab = "completion"; render(true); toast("Write what blocks this quest in the report."); const el = document.querySelector('[data-field="report"]'); if (el) el.focus(); }
    else toast(`${id} → ${L.STATUS_LABEL[to]}`);
  }

  /* Opens a new Claude Code tab in VS Code with the quest prompt pre-filled (the extension's
     vscode://anthropic.claude-code/open handler; it fills the box but never auto-submits). */
  const VSCODE_OPEN = "vscode://anthropic.claude-code/open?prompt=";
  const vscodeFolderUri = () => "vscode://file/" + D.project.workingDir.replace(/\\/g, "/");
  const openUri = (uri) => store.openUri(uri).catch((e) => toast("Could not open VS Code: " + e.message));
  function startInVSCode(id) {
    const q = qById[id]; const d = derived(q);
    if (!canQ(q) || readOnly) return;
    const go = () => {
      if (!["in_progress", "done"].includes(L.questStatus(q, state))) recordStatus(id, "in_progress");
      const text = promptFor(q);
      copyText(text); // backup in case the link handler is blocked
      openUri(VSCODE_OPEN + encodeURIComponent(text));
      render(true);
      toast(`${id} started. In VS Code, check the Claude tab and press Enter. The prompt is also on your clipboard.`);
    };
    if (d === "done") { modal(`${id} is already done`, "<p>Open it in Claude Code anyway? Its status stays Done.</p>", [{ label: "Cancel" }, { label: "Open anyway", cls: "primary", run: go }]); return; }
    if (d === "locked" || d === "external" || d === "blocked") {
      const why = d === "locked" ? `Unfinished dependencies: ${L.unmetDeps(q, D, state).join(", ")}.` : d === "external" ? `External dependency not resolved: ${q.external}.` : "This quest is marked Blocked.";
      modal(`Start ${id} anyway?`, `<p>${esc(why)}</p><p class="small muted">The prompt tells Claude Code to check this and stop if prerequisites are missing.</p>`, [{ label: "Cancel" }, { label: "Start anyway", cls: "danger", run: go }]);
      return;
    }
    go();
  }

  function showPrompt(id) {
    const text = promptFor(qById[id]);
    modal(`Claude Code prompt: ${id}`, `<p class="small muted">Paste it into Claude Code in <code>${esc(D.project.workingDir)}</code>. It scopes the agent to this quest only and requires a completion report.</p><pre>${esc(text)}</pre>`,
      [{ label: "Close" }, { label: "Copy", cls: "primary", run: () => { copyText(text).then((ok) => toast(ok ? "Prompt copied" : "Copy failed: select the text manually")); return false; } }]);
  }

  /* ───────── graph ───────── */
  function viewGraph() {
    const lv = L.waves(D.quests); const crit = L.criticalPath(D, state).path; const critSet = new Set(crit);
    const shown = D.quests.filter((q) => !(ui.hideDone && L.questStatus(q, state) === "done"));
    const shownSet = new Set(shown.map((q) => q.id));
    const maxW = Math.max(0, ...Object.values(lv));
    const cols = Array.from({ length: maxW + 1 }, () => []);
    shown.forEach((q) => cols[lv[q.id]].push(q));
    const NW = 176, NH = 44, CG = 70, RG = 12, TOP = 30, LEFT = 14;
    const pos = {};
    cols.forEach((c, i) => c.forEach((q, j) => { pos[q.id] = { x: LEFT + i * (NW + CG), y: TOP + j * (NH + RG) }; }));
    const H = TOP + Math.max(1, ...cols.map((c) => c.length)) * (NH + RG) + 10;
    const W = LEFT + (maxW + 1) * (NW + CG);
    const critEdge = (a, b) => critSet.has(a) && critSet.has(b) && crit.indexOf(b) === crit.indexOf(a) + 1;
    let edges = "";
    for (const q of shown) for (const d of q.deps || []) {
      if (!shownSet.has(d)) continue;
      const a = pos[d], b = pos[q.id];
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      edges += `<path class="gedge ${critEdge(d, q.id) ? "crit" : ""}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    }
    const trunc = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
    const nodes = shown.map((q) => {
      const p = pos[q.id]; const d = derived(q);
      return `<a href="#quest/${esc(q.id)}" class="gnode n-${d} ${critSet.has(q.id) ? "crit" : ""} ${q.external ? "ext" : ""}">
        <title>${esc(q.id)} ${esc(q.title)} (${esc(L.STATUS_LABEL[d])})</title>
        <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="7"/>
        <text x="${p.x + 9}" y="${p.y + 17}"><tspan class="gid">${esc(q.id)}</tspan><tspan dx="6" class="muted">${q.hours}h · ${esc(L.STATUS_LABEL[d])}</tspan></text>
        <text x="${p.x + 9}" y="${p.y + 33}">${esc(trunc(q.title, 27))}</text></a>`;
    }).join("");
    const heads = cols.map((c, i) => (c.length ? `<text class="gwave" x="${LEFT + i * (NW + CG)}" y="18">Wave ${i}</text>` : "")).join("");
    const ext = D.quests.filter((q) => q.external);
    return `
    <div class="page-head"><div><h1>Execution order</h1><p>Each column is a wave: quests in a wave do not depend on each other and can run in parallel. Arrows point from a prerequisite to the quest it unlocks.</p></div>
      <div class="btn-row"><button class="btn" data-action="toggle-hide-done" aria-pressed="${ui.hideDone}">Hide completed</button></div></div>
    <div class="legend">${["ready", "in_progress", "blocked", "done", "locked", "external"].map((s) => pill(s)).join("")}<span class="chip crit">orange border = critical path</span><span class="chip" style="border-style:dashed">dashed = external dependency</span></div>
    <div class="graph-wrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Quest dependency graph">${heads}${edges}${nodes}</svg></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Waves (execution order)</h2>
        ${cols.map((c, i) => (c.length ? `<div class="wave-row"><b>Wave ${i}</b><div class="chips">${c.map((q) => `${qLink(q.id)}${pill(derived(q))}`).join(" ")}</div></div>` : "")).join("")}
      </div>
      <div>
        <div class="card"><h2>Critical path</h2><div class="chips">${crit.map((id, i) => `${i ? '<span class="muted">→</span>' : ""}${qLink(id)}`).join(" ")}</div></div>
        <div class="card"><h2>Blocked by external dependencies</h2>
          <table><tr><th>Quest</th><th>External dependency</th><th>State</th></tr>${ext.map((q) => `<tr><td>${qLink(q.id)} ${esc(q.title)}</td><td class="small">${esc(q.external)}</td><td>${pill(derived(q))}</td></tr>`).join("")}</table>
          <p class="small muted">Everything that depends on these quests waits too. No P0–P6 quest depends on GPU provisioning.</p></div>
      </div>
    </div>`;
  }

  /* ───────── ADRs ───────── */
  function viewAdrs(r) {
    const f = Object.assign({ adrText: "", adrStatus: "" }, ui.filters, r.params);
    const t = (f.adrText || "").toLowerCase();
    const items = D.adrs.filter((a) => (!f.adrStatus || L.adrStatus(a, state) === f.adrStatus) &&
      (!t || [a.id, a.title, a.context, a.decision].join(" ").toLowerCase().includes(t)));
    const counts = L.ADR_STATUSES.map((s) => [s, D.adrs.filter((a) => L.adrStatus(a, state) === s).length]);
    return `
    <div class="page-head"><div><h1>Architecture Decision Records</h1><p>Assistant decisions (AI-ADR-xx). The RCK application's own ADR-01…10 are separate and live in the RCK repository.</p></div>
      <div class="chips">${counts.map(([s, n]) => `${pill(s, `${n} ${s}`)}`).join(" ")}</div></div>
    <div class="filters"><input type="search" data-filter="adrText" placeholder="Search ADRs…" value="${esc(f.adrText)}" aria-label="Search ADRs">
      <select data-filter="adrStatus" aria-label="ADR status"><option value="">Status: all</option>${L.ADR_STATUSES.map((s) => `<option ${f.adrStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <span class="muted small">${items.length} shown</span></div>
    <div class="card" style="padding:0"><table style="margin:0">
      <tr><th style="width:110px">ID</th><th>Title and decision</th><th style="width:110px">Status</th><th style="width:170px">Quests</th></tr>
      ${items.map((a) => `<tr><td><a href="#adr/${esc(a.id)}"><b>${esc(a.id)}</b></a></td><td><a href="#adr/${esc(a.id)}"><b>${esc(a.title)}</b></a><div class="small muted">${esc(a.decision.split("\n")[0].slice(0, 170))}${a.decision.length > 170 ? "…" : ""}</div>${(a.openQuestions || []).length && L.adrStatus(a, state) === "proposed" ? `<div class="small" style="color:var(--warn)">Needs: ${esc(a.openQuestions[0])}${a.openQuestions.length > 1 ? ` (+${a.openQuestions.length - 1})` : ""}</div>` : ""}</td><td>${pill(L.adrStatus(a, state))}</td><td><div class="chips">${(a.quests || []).slice(0, 4).map(qLink).join("")}${a.quests.length > 4 ? `<span class="chip">+${a.quests.length - 4}</span>` : ""}</div></td></tr>`).join("")}
    </table></div>`;
  }
  function viewAdr(r) {
    const a = adrById[r.id]; if (!a) return viewNotFound();
    const st = state.adrs[a.id] || {}; const cur = L.adrStatus(a, state);
    const sec = (title, html) => `<h3>${title}</h3>${html}`;
    const hist = (a.history || []).map((h) => `<li><b>${esc(h[0])}</b>: ${esc(h[1])}</li>`).concat((st.history || []).map((h) => `<li><b>${esc(fmtDate(h.at))}</b>: status ${esc(h.from)} → ${esc(h.to)} <span class="secondary">(changed in the dashboard${h.by ? " by " + esc(memberName(h.by)) : ""})</span></li>`));
    const dis = canP() ? "" : " disabled";
    const idx = D.adrs.indexOf(a); const prev = D.adrs[idx - 1], nx = D.adrs[idx + 1];
    return `
    <div class="crumbs"><a href="#adrs">ADRs</a> / ${esc(a.id)}</div>
    <div class="page-head"><div><h1>${esc(a.id)}: ${esc(a.title)}</h1></div>
      <label class="btn-row">Status ${pill(cur)} <select data-action="adr-status" data-id="${esc(a.id)}" aria-label="Change ADR status"${dis}>${L.ADR_STATUSES.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
    ${cur === "proposed" && (a.openQuestions || []).length ? `<div class="callout"><b>Unresolved. Information needed to decide:</b>${list(a.openQuestions)}</div>` : ""}
    <div class="grid g2">
      <div class="card">${sec("Decision", `<div class="lead-box">${fmt(a.decision)}</div>`)}${sec("Context and problem", `<div class="secondary">${fmt(a.context)}</div>`)}${sec("Reasons", list(a.reasons))}${sec("Consequences and trade-offs", list(a.consequences))}</div>
      <div class="card">${sec("Alternatives considered", `<table><tr><th>Option</th><th>Why not chosen</th></tr>${a.alternatives.map((x) => `<tr><td><strong>${rich(x[0])}</strong></td><td class="secondary">${rich(x[1])}</td></tr>`).join("")}</table>`)}
        ${sec("Security and privacy", `<p>${rich(a.security)}</p>`)}${sec("Performance and cost", `<p>${rich(a.performance)}</p>`)}</div>
    </div>
    <div class="grid g2">
      <div class="card">${sec("Acceptance criteria", list(a.acceptance))}${sec("Dependencies", list(a.dependencies))}
        ${sec("Related ADRs", `<div class="chips">${(a.related || []).map(adrLink).join("") || '<span class="muted">None</span>'}</div>`)}
        ${sec("Related quests", `<div class="chips">${(a.quests || []).map((id) => `${qLink(id)}${pill(derived(qById[id]))}`).join(" ")}</div>`)}</div>
      <div class="card">${sec("Decision history", `<ul class="history">${hist.join("")}</ul>`)}
        <label class="field"><span>Notes</span><textarea data-adr-notes="${esc(a.id)}" rows="4" placeholder="${canP() ? "Discussion, evidence, links…" : ""}"${canP() ? "" : " readonly"}>${esc(st.notes || "")}</textarea></label></div>
    </div>
    <div class="pager">${prev ? `<a class="btn" href="#adr/${esc(prev.id)}">← ${esc(prev.id)}</a>` : "<span></span>"}${nx ? `<a class="btn" href="#adr/${esc(nx.id)}">${esc(nx.id)} →</a>` : ""}</div>`;
  }

  /* ───────── docs ───────── */
  function viewDocs(r) {
    const doc = docById[r.id] || D.docs[0];
    return `
    <div class="page-head"><div><h1>Engineering documentation</h1><p>Every section is labelled <b>implemented</b>, <b>partial</b> or <b>planned</b>. Anything planned does not exist in code yet.</p></div></div>
    <div class="docs">
      <nav class="card docnav" aria-label="Documentation sections">${D.docs.map((d) => `<a href="#docs/${esc(d.id)}" class="${d === doc ? "active" : ""}"><span>${esc(d.title)}</span>${pill(d.status)}</a>`).join("")}</nav>
      <article class="card"><div class="btn-row" style="justify-content:space-between"><h2 style="margin:0">${esc(doc.title)}</h2>${pill(doc.status)}</div><div style="margin-top:12px">${doc.html}</div></article>
    </div>`;
  }

  /* ───────── facts & assumptions ───────── */
  function viewFacts() {
    const proposed = D.adrs.filter((a) => L.adrStatus(a, state) === "proposed");
    return `
    <div class="page-head"><div><h1>Facts and assumptions</h1><p>Facts were verified with the listed command. "Reported" facts come from you or an earlier session and are not verified here. Assumptions stay unverified until the named quest confirms or refutes them.</p></div></div>
    <div class="card"><h2>Confirmed project facts</h2><table><tr><th>ID</th><th>Fact</th><th>Source</th><th>Date</th></tr>
      ${D.facts.map((f) => `<tr><td><b>${esc(f.id)}</b></td><td>${lead(f.text)} ${f.reported ? pill("reported", "reported") : pill("confirmed", "verified")}</td><td class="small"><code>${esc(f.source)}</code></td><td class="small">${esc(f.date)}</td></tr>`).join("")}</table></div>
    <div class="card"><h2>Assumptions that need verification</h2><table><tr><th>ID</th><th>Assumption</th><th>Verify in</th><th>Risk if wrong</th><th>State and note</th></tr>
      ${D.assumptions.map((a) => { const st = state.assumptions[a.id] || {}; const cur = L.assumptionState(a, state); return `<tr><td><b>${esc(a.id)}</b></td><td><strong>${rich(a.text)}</strong></td><td>${qLink(a.verifyIn)}</td><td class="small secondary">${rich(a.risk)}</td>
        <td><select data-action="assumption-state" data-id="${esc(a.id)}" aria-label="State of ${esc(a.id)}"${canP() ? "" : " disabled"}>${L.ASSUMPTION_STATES.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("")}</select> ${pill(cur)}
        <input type="text" data-assumption-note="${esc(a.id)}" value="${esc(st.note || "")}" placeholder="${canP() ? "Evidence…" : ""}" style="width:100%;margin-top:4px"${canP() ? "" : " readonly"}></td></tr>`; }).join("")}</table></div>
    <div class="card"><h2>Unresolved decisions (${proposed.length} proposed ADRs)</h2><table><tr><th>ADR</th><th>Information required to resolve</th></tr>
      ${proposed.map((a) => `<tr><td>${adrLink(a.id)} ${esc(a.title)}</td><td>${list(a.openQuestions)}</td></tr>`).join("")}</table></div>`;
  }

  /* ───────── backup ───────── */
  let snapCache = [];
  function viewBackup() {
    const touched = Object.keys(state.quests).length + Object.keys(state.adrs).length + Object.keys(state.assumptions).length;
    const where = store.kind === "desktop" ? `the shared folder <code>${esc(session.syncFolder)}</code> (your file: <code>progress\\${esc(me)}.js</code>)`
      : store.kind === "viewer" ? "the shared folder (read-only)" : "this browser's local storage for this address";
    const health = saveError ? `<div class="callout bad"><strong>${esc(saveError)}</strong></div>`
      : `<div class="callout ok">Progress is stored in ${where}. Last change: ${state.updatedAt ? esc(fmtDate(state.updatedAt)) : "none yet"} · ${touched} records.</div>`;
    return `
    <div class="page-head"><div><h1>Backup and export</h1><p class="secondary">Export regularly: the JSON file is a portable backup you can keep anywhere.</p></div></div>
    ${health}
    <div class="grid g2">
      <div class="card"><h2>Export</h2>
        <p class="secondary">Progress JSON holds statuses, assignments, notes, test results, acceptance ticks, ADR and assumption states.</p>
        <div class="btn-row"><button class="btn primary" data-action="export-json">Export progress (JSON)</button><button class="btn" data-action="export-md">Export roadmap (Markdown)</button><button class="btn" data-action="copy-json">Copy JSON</button></div>
      </div>
      ${canP() ? `<div class="card"><h2>Import</h2>
        <p class="secondary">Restores a progress JSON${store.kind === "desktop" ? " into the team's progress (imported values count as changed now)" : ""}. A snapshot is taken first.</p>
        <input type="file" id="importFile" accept="application/json,.json" aria-label="Choose a progress JSON file">
      </div>` : ""}
    </div>
    ${readOnly ? "" : `<div class="card"><h2>Snapshots ${store.kind === "desktop" ? "on this PC" : "in this browser"}</h2>
      <p class="small muted">Taken automatically once a day, before every import or restore, and on demand. The last 15 are kept.</p>
      <div class="btn-row" style="margin-bottom:10px"><button class="btn" data-action="snapshot">Create snapshot now</button></div>
      <div id="snapList"><p class="muted">Loading…</p></div>
    </div>`}
    <div class="card"><h2>Data integrity</h2>${integrity.length ? `<div class="callout bad">${list(integrity)}</div>` : `<div class="callout ok">All ${D.quests.length} quests, ${D.adrs.length} ADRs and ${D.docs.length} docs are consistent: no unknown references, no dependency cycles.</div>`}</div>
    ${store.kind === "local" ? `<div class="card"><h2>Reset</h2><p class="secondary">Clears all recorded progress in this browser (a snapshot is taken first). Project data files are not touched.</p><button class="btn danger" data-action="reset">Reset progress</button></div>` : ""}`;
  }
  function fillSnapshots() {
    const box = $("#snapList"); if (!box) return;
    store.snapshots().then((snaps) => {
      snapCache = snaps;
      box.innerHTML = snaps.length ? `<table><tr><th>When</th><th>Reason</th><th></th></tr>${snaps.map((s, i) => `<tr><td>${esc(fmtDate(s.at))}</td><td>${esc(s.reason)}</td><td><div class="btn-row">${canP() ? `<button class="btn sm" data-action="restore-snapshot" data-i="${i}">Restore</button>` : ""}<button class="btn sm" data-action="download-snapshot" data-i="${i}">Download</button></div></td></tr>`).join("")}</table>` : '<p class="muted">No snapshots yet.</p>';
    }).catch((e) => { box.innerHTML = `<p class="muted">Could not list snapshots: ${esc(e.message)}</p>`; });
  }

  /* ───────── team ───────── */
  function viewTeam() {
    if (!session.team) return viewNotFound();
    const owner = canP() && store.team;
    const count = (m, pred) => D.quests.filter((q) => L.assigneeOf(q, state) === m.id && pred(q)).length;
    return `
    <div class="page-head"><div><h1>Team</h1><p class="secondary">Who works on the project and what each person may change. Each member's progress is a separate file in the shared folder, so the sync never conflicts.</p></div></div>
    <div class="card"><h2>Members</h2>
      <table><tr><th>Member</th><th>Role</th><th>Assigned</th><th>In progress</th><th>Done</th>${owner ? "<th></th>" : ""}</tr>
      ${members().map((m) => `<tr><td><strong>${esc(m.name)}</strong>${m.id === me ? ' <span class="chip">you</span>' : ""}<div class="small muted">${esc(m.id)}</div></td>
        <td>${owner && m.id !== me ? `<select data-action="team-role" data-id="${esc(m.id)}" aria-label="Role of ${esc(m.name)}">${ROLES.map((r) => `<option value="${r}" ${m.role === r ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>` : esc(ROLE_LABEL[m.role])}</td>
        <td>${count(m, () => true)}</td><td>${count(m, (q) => L.questStatus(q, state) === "in_progress")}</td><td>${count(m, (q) => L.questStatus(q, state) === "done")}</td>
        ${owner ? `<td>${m.id !== me ? `<button class="btn sm danger" data-action="team-remove" data-id="${esc(m.id)}">Remove</button>` : ""}</td>` : ""}</tr>`).join("")}
      </table>
      ${owner ? `<h3>Add a member</h3><div class="btn-row"><input type="text" id="newMemberName" placeholder="Name" style="min-width:200px">
        <select id="newMemberRole" aria-label="Role"><option value="contributor">Contributor</option><option value="agent">Agent (Claude Code)</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
        <button class="btn primary" data-action="team-add">Add</button></div>
        <p class="small secondary" style="margin-top:8px">They then run the app on their PC, choose the same synced folder, and enter this exact name.</p>` : ""}
    </div>
    <div class="grid g2">
      <div class="card"><h2>Roles</h2><ul>
        <li><strong>Owner:</strong> everything: assigns quests, changes any quest, ADRs, assumptions and the team.</li>
        <li><strong>Contributor:</strong> works only on the quests assigned to them (status, ticks, notes, results). Edits to other quests are ignored when files are merged.</li>
        <li><strong>Agent (Claude Code):</strong> submits reports through <code>node questline/tools/ql.js</code> for the quests assigned to it, and can set them In progress or Blocked. It can never mark Done, tick criteria or change assignments: you review its report and decide.</li>
        <li><strong>Viewer:</strong> read-only. Your manager needs no install: they open <code>Open Questline.html</code> in the shared folder.</li></ul>
        <p class="small secondary">Identity is the name entered on each PC. Real access control comes from the folder's sharing settings: share it read-only with your manager.</p></div>
      <div class="card"><h2>This PC</h2>
        ${store.kind === "desktop" ? `<p><strong>Shared folder:</strong> <code>${esc(session.syncFolder)}</code></p>
          <div class="btn-row" style="margin-bottom:12px"><button class="btn" data-action="open-sync-folder">Open folder</button>${owner ? '<button class="btn" data-action="publish">Update manager view</button>' : ""}<button class="btn danger" data-action="disconnect">Disconnect this PC</button></div>
          <label class="field"><span>Project folder on this PC (used in Claude Code prompts)</span><div class="btn-row"><input type="text" id="workingDir" value="${esc(D.project.workingDir)}" style="flex:1;min-width:260px"><button class="btn" data-action="save-workdir">Save</button></div></label>`
        : `<p class="secondary">Read-only view of the shared folder.</p>`}
      </div>
    </div>`;
  }
  function importState(text, label) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { modal("Import failed", `<p>The file is not valid JSON.</p>`, [{ label: "OK" }]); return; }
    const payload = parsed && parsed.state ? parsed.state : parsed;
    const v = L.validateState(payload);
    if (!v.state) { modal("Import failed", `<p>The file is not a questline progress file.</p>${list(v.errors)}`, [{ label: "OK" }]); return; }
    const unknown = Object.keys(v.state.quests).filter((id) => !qById[id]);
    const apply = () => {
      addSnapshot("Before import of " + label);
      state = store.kind === "desktop" ? L.restamp(v.state, me) : v.state; // imported values must win the merge
      save(); render(true); toast("Progress imported");
    };
    if (!v.ok || unknown.length) {
      modal("Import with warnings?", `${v.errors.length ? `<p>Skipped entries:</p>${list(v.errors)}` : ""}${unknown.length ? `<p>Unknown quest IDs kept but not shown: ${esc(unknown.join(", "))}</p>` : ""}`,
        [{ label: "Cancel" }, { label: "Import", cls: "primary", run: apply }]);
    } else apply();
  }

  /* ───────── search ───────── */
  const sInput = $("#globalSearch"), sBox = $("#searchResults");
  let sActive = 0;
  function renderSearch() {
    const hits = L.search(D, sInput.value);
    if (!sInput.value.trim()) { sBox.hidden = true; return; }
    const href = (h) => (h.kind === "quest" ? `#quest/${h.id}` : h.kind === "adr" ? `#adr/${h.id}` : `#docs/${h.id}`);
    sBox.innerHTML = hits.length ? hits.map((h, i) => `<a href="${esc(href(h))}" class="${i === sActive ? "active" : ""}"><span class="kind">${esc(h.kind)}</span><span><b>${esc(h.id)}</b> ${esc(h.title)}</span></a>`).join("") : `<div style="padding:10px 12px" class="muted">No results</div>`;
    sBox.hidden = false;
  }
  sInput.addEventListener("input", () => { sActive = 0; renderSearch(); });
  sInput.addEventListener("keydown", (e) => {
    const links = sBox.querySelectorAll("a");
    if (e.key === "ArrowDown") { sActive = Math.min(sActive + 1, links.length - 1); renderSearch(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sActive = Math.max(sActive - 1, 0); renderSearch(); e.preventDefault(); }
    else if (e.key === "Enter" && links[sActive]) { location.hash = links[sActive].getAttribute("href"); sInput.value = ""; sBox.hidden = true; sInput.blur(); }
    else if (e.key === "Escape") { sInput.value = ""; sBox.hidden = true; sInput.blur(); }
  });
  sBox.addEventListener("click", () => { sInput.value = ""; sBox.hidden = true; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) sBox.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.target.closest("input, textarea, select")) { e.preventDefault(); sInput.focus(); }
    if (e.key === "Escape" && !$("#modal").hidden) closeModal();
  });

  /* ───────── events ───────── */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "SELECT" || el.type === "checkbox") return;
    const { action, id, i } = el.dataset;
    switch (action) {
      case "set-status": setStatus(id, el.dataset.status); break;
      case "copy-prompt": copyText(promptFor(qById[id])).then((ok) => (ok ? toast(`Claude Code prompt for ${id} copied`) : showPrompt(id))); break;
      case "preview-prompt": showPrompt(id); break;
      case "start-vscode": startInVSCode(id); break;
      case "copy-cmd": copyText(qById[id].commands[+i]).then((ok) => toast(ok ? "Command copied" : "Copy failed")); break;
      case "tab": currentTab = el.dataset.tab; render(true); break;
      case "clear-filters": ui.filters = {}; saveUi(); location.hash = "#quests"; render(false); break;
      case "toggle-hide-done": ui.hideDone = !ui.hideDone; saveUi(); render(true); break;
      case "export-json": download(`questline-progress-${stamp()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), app: "questline", state }, null, 2)); toast("Progress exported"); break;
      case "copy-json": copyText(JSON.stringify(state, null, 2)).then((ok) => toast(ok ? "JSON copied" : "Copy failed")); break;
      case "export-md": download(`ROADMAP-${stamp()}.md`, L.toMarkdown(D, state), "text/markdown"); toast("Roadmap exported"); break;
      case "snapshot": addSnapshot("Manual snapshot").then(() => { fillSnapshots(); toast("Snapshot created"); }); break;
      case "restore-snapshot": {
        const snap = snapCache[+i]; if (!snap || !canP()) break;
        modal("Restore snapshot?", `<p>Restore progress from ${esc(fmtDate(snap.at))}? The current state is snapshotted first.</p>`,
          [{ label: "Cancel" }, { label: "Restore", cls: "primary", run: () => {
            store.readSnapshot(snap.id).then(async (snapState) => {
              await addSnapshot("Before restore");
              const restored = L.validateState(snapState).state || L.emptyState();
              state = store.kind === "desktop" ? L.restamp(restored, me) : restored;
              save(); render(true); toast("Snapshot restored");
            }).catch((err) => toast(err.message));
          } }]);
        break;
      }
      case "download-snapshot": {
        const snap = snapCache[+i]; if (!snap) break;
        store.readSnapshot(snap.id).then((s) => download(`questline-snapshot-${String(snap.at).slice(0, 16).replace(/[-:T]/g, "")}.json`, JSON.stringify({ exportedAt: snap.at, app: "questline", state: s }, null, 2)));
        break;
      }
      case "reset":
        if (store.kind !== "local") break;
        modal("Reset all progress?", "<p>All statuses, notes and ticks in this browser are cleared. A snapshot is taken first so you can undo this.</p>",
          [{ label: "Cancel" }, { label: "Reset", cls: "danger", run: () => { addSnapshot("Before reset"); state = L.emptyState(); save(); render(true); toast("Progress reset"); } }]);
        break;
      case "open-project": openUri(vscodeFolderUri()); break;
      case "accept-report": reviewReport(id, "accepted"); break;
      case "reject-report":
        modal(`Reject Claude's report for ${id}?`, `<label class="field"><span>Reason (shown to Claude on resubmission)</span><textarea id="rejectNote" rows="4"></textarea></label>`,
          [{ label: "Cancel" }, { label: "Reject", cls: "danger", run: () => reviewReport(id, "rejected", ($("#rejectNote").value || "").trim().slice(0, 1000)) }]);
        break;
      case "reload": location.reload(); break;
      case "team-add": {
        const name = ($("#newMemberName").value || "").trim(); const role = $("#newMemberRole").value;
        if (!name) { toast("Enter a name"); break; }
        store.team.add(name, role).then(() => { render(true); toast(`${name} added as ${ROLE_LABEL[role]}`); }).catch((err) => toast(err.message));
        break;
      }
      case "team-remove": {
        const name = memberName(id);
        modal(`Remove ${name}?`, `<p>${esc(name)} can no longer save progress. Their existing work stays in the history; quests assigned to them become editable only by owners.</p>`,
          [{ label: "Cancel" }, { label: "Remove", cls: "danger", run: () => { store.team.remove(id).then(() => { render(true); toast(`${name} removed`); }).catch((err) => toast(err.message)); } }]);
        break;
      }
      case "publish": store.team.publish().then((p) => toast("Manager view updated: " + p)).catch((err) => toast(err.message)); break;
      case "open-sync-folder": store.team.openFolder().catch((err) => toast(err.message)); break;
      case "disconnect":
        modal("Disconnect this PC?", "<p>The app forgets the shared folder and your name on this PC. Nothing in the shared folder is deleted. The setup screen appears next time.</p>",
          [{ label: "Cancel" }, { label: "Disconnect", cls: "danger", run: () => { store.team.disconnect().then(() => location.reload()); } }]);
        break;
      case "save-workdir": {
        const v = ($("#workingDir").value || "").trim();
        ui.workingDir = v; saveUi(); D.project.workingDir = v || R.project.workingDir; toast("Project folder saved for this PC");
        break;
      }
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    const quest = el.dataset.id && qById[el.dataset.id];
    if (el.dataset.action === "ack") {
      if (!canQ(quest)) return;
      const s = qs(el.dataset.id); s.ack[el.dataset.i] = el.checked; touch(s, "ack." + el.dataset.i); save(); render(true);
    }
    else if (el.dataset.action === "external-cleared") {
      if (!canQ(quest)) return;
      const s = qs(el.dataset.id); s.externalCleared = el.checked; touch(s, "externalCleared"); save(); render(true);
    }
    else if (el.dataset.action === "assign") {
      if (!canP()) return;
      const s = qs(el.dataset.id); s.assignee = el.value || null; touch(s, "assignee"); save(); render(true);
      toast(el.value ? `${el.dataset.id} assigned to ${memberName(el.value)}` : `${el.dataset.id} unassigned`);
    }
    else if (el.dataset.action === "team-role") {
      store.team.setRole(el.dataset.id, el.value).then(() => { render(true); toast(`${memberName(el.dataset.id)} is now ${ROLE_LABEL[el.value]}`); }).catch((err) => { toast(err.message); render(true); });
    }
    else if (el.dataset.action === "adr-status") {
      if (!canP()) return;
      const a = adrById[el.dataset.id]; const from = L.adrStatus(a, state);
      const s = (state.adrs[a.id] = state.adrs[a.id] || { history: [] }); s.history = s.history || [];
      s.status = el.value; touch(s, "status");
      s.history.push({ at: new Date().toISOString(), from, to: el.value, ...(me ? { by: me } : {}) });
      save(); render(true); toast(`${a.id} → ${el.value}`);
    }
    else if (el.dataset.action === "assumption-state") {
      if (!canP()) return;
      const s = (state.assumptions[el.dataset.id] = state.assumptions[el.dataset.id] || { note: "" });
      s.state = el.value; touch(s, "state"); save(); render(true);
    }
    else if (el.dataset.filter) {
      Object.assign(ui.filters, route().params); // keep filters that came from the URL
      ui.filters[el.dataset.filter] = el.value; saveUi();
      const v = route().view;
      if (v === "quests" && location.hash.includes("?")) location.hash = "#quests"; else render(true);
    }
    else if (el.id === "importFile" && el.files[0]) {
      const file = el.files[0]; const reader = new FileReader();
      reader.onload = () => importState(String(reader.result), file.name); reader.readAsText(file);
      el.value = "";
    }
  });
  let typingTimer = null;
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.field) {
      if (!canQ(qById[el.dataset.id])) return;
      const s = qs(el.dataset.id); s.fields[el.dataset.field] = el.value; touch(s, "f." + el.dataset.field); debounceSave();
    }
    else if (el.dataset.adrNotes) {
      if (!canP()) return;
      const s = (state.adrs[el.dataset.adrNotes] = state.adrs[el.dataset.adrNotes] || { history: [] }); s.notes = el.value; touch(s, "notes"); debounceSave();
    }
    else if (el.dataset.assumptionNote) {
      if (!canP()) return;
      const s = (state.assumptions[el.dataset.assumptionNote] = state.assumptions[el.dataset.assumptionNote] || { state: "unverified" }); s.note = el.value; touch(s, "note"); debounceSave();
    }
    else if (el.dataset.filter && el.type === "search") {
      Object.assign(ui.filters, route().params);
      ui.filters[el.dataset.filter] = el.value; saveUi();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { const pos = el.selectionStart; render(true); const again = document.querySelector(`[data-filter="${el.dataset.filter}"]`); if (again) { again.focus(); again.setSelectionRange(pos, pos); } }, 180);
    }
  });
  function debounceSave() { $("#saveState").textContent = "Saving…"; clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  window.addEventListener("beforeunload", () => { if (saveTimer) save(); });

  /* ───────── theme ───────── */
  function applyTheme() { if (ui.theme) document.documentElement.setAttribute("data-theme", ui.theme); else document.documentElement.removeAttribute("data-theme"); }
  $("#themeToggle").addEventListener("click", () => {
    const dark = ui.theme ? ui.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    ui.theme = dark ? "light" : "dark"; saveUi(); applyTheme();
  });
  applyTheme();
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  /* ───────── team chrome and live refresh ───────── */
  if (session.team) {
    const nav = $("#nav");
    if (!nav.querySelector('[data-nav="team"]')) nav.querySelector('[data-nav="backup"]').insertAdjacentHTML("beforebegin", '<a href="#team" data-nav="team"><span>👥</span>Team</a>');
    const badge = document.createElement("span");
    badge.className = "user-badge";
    badge.innerHTML = readOnly ? '<strong>Team view</strong> · read-only' : `<strong>${esc(session.name || me)}</strong> · ${esc(ROLE_LABEL[session.role] || session.role)}`;
    $(".top-actions").prepend(badge);
  }
  if (store.kind === "desktop") {
    /* Pick up colleagues' saved changes. Skipped while you are typing or a save is pending. */
    const pull = () => {
      const active = document.activeElement;
      if (saveTimer || (active && /^(TEXTAREA|INPUT|SELECT)$/.test(active.tagName)) || !$("#modal").hidden) return;
      store.refresh(state).then((merged) => {
        if (!merged) return;
        state = merged; render(true);
      }).catch((e) => { saveError = "Sync folder unreachable: " + e.message; updateSaveIndicator(); });
    };
    setInterval(pull, 15000);
    window.addEventListener("focus", pull);
  }

  render(false);
  window.__questline = { D, L, getState: () => state, store }; // debugging and automated checks
};

/* Run from questline/: node --test   (no dependencies) */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("../js/logic.js");
const { loadData, ROOT, DATA_FILES } = require("./load.js");

const data = () => L.prepare(loadData());
const withStatus = (d, map) => ({ ...L.emptyState(), quests: Object.fromEntries(Object.entries(map).map(([id, status]) => [id, { status, fields: {}, ack: {}, history: [] }])) });

test("project data has no integrity errors (ids, references, cycles, required fields)", () => {
  assert.deepEqual(L.integrityErrors(data()), []);
});

test("required scale: 18+ ADRs, 10 phases, every phase has quests", () => {
  const d = data();
  assert.ok(d.adrs.length >= 18);
  assert.equal(d.phases.length, 10);
  for (const p of d.phases) assert.ok(d.quests.some((q) => q.phase === p.id), p.id);
});

test("index.html loads every data file in the order the tests use", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [...html.matchAll(/src="data\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, DATA_FILES);
});

test("the repository audit is the first quest to execute", () => {
  const d = data();
  assert.equal(L.nextAvailable(d, L.emptyState())[0].id, "Q0.1");
  assert.deepEqual(L.nextAvailable(d, L.emptyState()).map((q) => q.id), ["Q0.1"]);
});

test("local development (P0–P6) never depends on GPU deployment (P8) or RCK integration (P7)", () => {
  const d = data(); const byId = d._byId;
  const ancestors = (id, seen = new Set()) => { for (const dep of byId[id].deps || []) if (!seen.has(dep)) { seen.add(dep); ancestors(dep, seen); } return seen; };
  for (const q of d.quests.filter((q) => ["P0", "P1", "P2", "P3", "P4", "P5", "P6"].includes(q.phase))) {
    for (const a of ancestors(q.id)) assert.ok(!["P7", "P8"].includes(byId[a].phase), `${q.id} depends on ${a}`);
  }
});

test("derived status: locked until deps done, external until cleared, then ready", () => {
  const d = data();
  const q05 = d._byId["Q0.5"];
  assert.equal(L.derivedStatus(q05, d, L.emptyState()), "locked");
  const s = withStatus(d, { "Q0.1": "done", "Q0.2": "done", "Q0.3": "done", "Q0.4": "done" });
  assert.equal(L.derivedStatus(q05, d, s), "external");
  s.quests["Q0.5"] = { externalCleared: true, fields: {}, ack: {}, history: [] };
  assert.equal(L.derivedStatus(q05, d, s), "ready");
  s.quests["Q0.5"].status = "blocked";
  assert.equal(L.derivedStatus(q05, d, s), "blocked");
});

test("completing the audit unlocks parallel quests", () => {
  const d = data();
  const next = L.nextAvailable(d, withStatus(d, { "Q0.1": "done" })).map((q) => q.id);
  for (const id of ["Q0.2", "Q0.3", "Q0.4", "Q1.3", "Q1.6", "Q3.1"]) assert.ok(next.includes(id), id);
});

test("waves: a quest is always in a later wave than its dependencies", () => {
  const d = data(); const lv = L.waves(d.quests);
  for (const q of d.quests) for (const dep of q.deps || []) assert.ok(lv[q.id] > lv[dep], `${dep} → ${q.id}`);
});

test("cycle detection names the cycle", () => {
  const qs = [{ id: "A", deps: ["C"] }, { id: "B", deps: ["A"] }, { id: "C", deps: ["B"] }];
  assert.throws(() => L.topoOrder(qs), /cycle/i);
});

test("critical path is the longest remaining-effort chain and skips done work", () => {
  const toy = L.prepare({
    phases: [{ id: "P" }], roles: {}, adrs: [], docs: [], milestones: [],
    quests: [
      { id: "A", hours: 1, deps: [], status: "todo" }, { id: "B", hours: 5, deps: ["A"], status: "todo" },
      { id: "C", hours: 1, deps: ["A"], status: "todo" }, { id: "D", hours: 1, deps: ["B", "C"], status: "todo" }
    ]
  });
  assert.deepEqual(L.criticalPath(toy, L.emptyState()).path, ["A", "B", "D"]);
  assert.equal(L.criticalPath(toy, L.emptyState()).hours, 7);
  const s = withStatus(toy, { A: "done" });
  assert.deepEqual(L.criticalPath(toy, s).path, ["B", "D"]);
});

test("progress is weighted by effort and counts by derived status", () => {
  const d = data(); const p = L.progress(d, L.emptyState());
  assert.equal(p.overall.total, d.quests.length);
  assert.equal(p.overall.done, d.quests.filter((q) => q.status === "done").length);
  assert.equal(p.phases.length, d.phases.length);
  const sum = Object.values(p.overall.by).reduce((a, b) => a + b, 0);
  assert.equal(sum, d.quests.length);
});

test("filters combine phase, status, priority, role and text", () => {
  const d = data(); const s = L.emptyState();
  assert.ok(L.filterQuests(d, s, { phase: "P3" }).every((q) => q.phase === "P3"));
  assert.deepEqual(L.filterQuests(d, s, { status: "ready" }).map((q) => q.id), ["Q0.1"]);
  assert.ok(L.filterQuests(d, s, { role: "db", priority: "P0" }).every((q) => q.role === "db" && q.priority === "P0"));
  assert.deepEqual(L.filterQuests(d, s, { text: "critical-term" }).map((q) => q.id), ["Q4.2"]);
});

test("search finds quests, ADRs and docs, exact id first", () => {
  const d = data();
  assert.equal(L.search(d, "AI-ADR-07")[0].id, "AI-ADR-07");
  const kinds = new Set(L.search(d, "threshold").map((h) => h.kind));
  for (const k of ["quest", "adr", "doc"]) assert.ok(kinds.has(k), k);
  assert.deepEqual(L.search(d, "x"), []);
});

test("Claude Code prompt contains all nine required parts and the restrictions", () => {
  const d = data(); const p = L.buildPrompt(d._byId["Q1.8"], d, L.emptyState());
  for (const h of ["## 1. Project context", "## 2. Quest objective", "## 3. Relevant ADRs", "## 4. Prerequisites", "## 5. Implementation scope",
    "## 6. Validation requirements", "## 7. Acceptance criteria", "## 8. Restrictions", "## 9. Required completion report"]) assert.ok(p.includes(h), h);
  for (const r of ["Make no external LLM API calls", "Start no paid services", "inspect the existing files", "Then STOP", "Do not start another quest", "AI-ADR-09"]) assert.ok(p.toLowerCase().includes(r.toLowerCase()), r);
  assert.ok(p.includes("WARNING: these dependencies are not marked done: Q0.3"));
});

test("prompt for an external quest requires confirmation", () => {
  const d = data(); const p = L.buildPrompt(d._byId["Q8.4"], d, L.emptyState());
  assert.ok(p.includes("Do not proceed unless I have confirmed"));
});

test("state validation keeps good data, rejects garbage, and drops bad entries", () => {
  assert.equal(L.validateState(null).ok, false);
  assert.equal(L.validateState([1]).ok, false);
  assert.equal(L.validateState({ schema: 99 }).ok, false);
  const v = L.validateState({ schema: 1, quests: { "Q0.1": { status: "done", fields: { notes: "n", evil: 1 }, ack: { 0: 1 } }, "Q0.2": { status: "weird" } }, adrs: { "AI-ADR-02": { status: "accepted" } } });
  assert.equal(v.ok, false);
  assert.equal(v.state.quests["Q0.1"].status, "done");
  assert.deepEqual(v.state.quests["Q0.1"].fields, { notes: "n" });
  assert.equal(v.state.quests["Q0.1"].ack[0], true);
  assert.equal(v.state.quests["Q0.2"], undefined);
  assert.equal(v.state.adrs["AI-ADR-02"].status, "accepted");
  const round = L.validateState(JSON.parse(JSON.stringify(v.state)));
  assert.equal(round.ok, true);
});

/* ── team sync ── */
const TEAM = { members: [{ id: "jeeef", role: "owner" }, { id: "sam", role: "contributor" }, { id: "pm", role: "viewer" }] };
const T1 = "2026-10-25T10:00:00.000Z", T2 = "2026-10-25T11:00:00.000Z", T3 = "2026-10-25T12:00:00.000Z";
const rec = (vals, at, by) => {
  const r = { fields: {}, ack: {}, history: [], _t: {}, _b: {} };
  for (const [k, v] of Object.entries(vals)) {
    if (k.startsWith("f.")) r.fields[k.slice(2)] = v; else if (k.startsWith("ack.")) r.ack[k.slice(4)] = v; else r[k] = v;
    r._t[k] = at; r._b[k] = by;
  }
  return r;
};
const st = (quests, extra = {}) => ({ ...L.emptyState(), quests, ...extra });

test("merge: latest change per field wins, independent fields from different people combine", () => {
  const owner = st({ "Q1.3": rec({ assignee: "sam", status: "todo", "f.notes": "owner note" }, T1, "jeeef") });
  const sam = st({ "Q1.3": rec({ status: "in_progress", "f.testResults": "8 passed" }, T2, "sam") });
  const m = L.mergeStates([{ user: "jeeef", state: owner }, { user: "sam", state: sam }], TEAM);
  assert.equal(m.quests["Q1.3"].status, "in_progress");
  assert.equal(m.quests["Q1.3"].fields.notes, "owner note");
  assert.equal(m.quests["Q1.3"].fields.testResults, "8 passed");
  assert.equal(m.quests["Q1.3"]._b.status, "sam");
  // Owner changes status later: owner wins.
  owner.quests["Q1.3"].status = "blocked"; owner.quests["Q1.3"]._t.status = T3;
  assert.equal(L.mergeStates([{ user: "jeeef", state: owner }, { user: "sam", state: sam }], TEAM).quests["Q1.3"].status, "blocked");
});

test("merge: a contributor cannot change unassigned quests, assignments, ADRs or assumptions", () => {
  const owner = st({ "Q1.3": rec({ assignee: "sam" }, T1, "jeeef"), "Q0.1": rec({ status: "todo" }, T1, "jeeef") });
  const sam = st(
    { "Q0.1": rec({ status: "done" }, T3, "sam"), "Q1.3": rec({ assignee: "sam2", status: "done" }, T3, "sam") },
    { adrs: { "AI-ADR-02": { status: "accepted", history: [], _t: { status: T3 } } }, assumptions: { A1: { state: "confirmed", note: "", _t: { state: T3 } } } }
  );
  const m = L.mergeStates([{ user: "sam", state: sam }, { user: "jeeef", state: owner }], TEAM);
  assert.equal(m.quests["Q0.1"].status, "todo");
  assert.equal(m.quests["Q1.3"].assignee, "sam");
  assert.equal(m.quests["Q1.3"].status, "done");
  assert.equal(m.adrs["AI-ADR-02"], undefined);
  assert.equal(m.assumptions.A1, undefined);
});

test("merge: viewers and unknown users are ignored; histories are unioned without duplicates", () => {
  const h1 = { at: T1, from: "todo", to: "in_progress", by: "jeeef" }, h2 = { at: T2, from: "in_progress", to: "done", by: "sam" };
  const owner = st({ "Q1.3": { ...rec({ assignee: "sam" }, T1, "jeeef"), history: [h1] } });
  const sam = st({ "Q1.3": { ...rec({ status: "done" }, T2, "sam"), history: [h1, h2] } });
  const pm = st({ "Q1.3": rec({ status: "blocked" }, T3, "pm") });
  const intruder = st({ "Q1.3": rec({ status: "blocked" }, T3, "x") });
  const m = L.mergeStates([{ user: "jeeef", state: owner }, { user: "sam", state: sam }, { user: "pm", state: pm }, { user: "x", state: intruder }], TEAM);
  assert.equal(m.quests["Q1.3"].status, "done");
  assert.deepEqual(m.quests["Q1.3"].history.map((h) => h.to), ["in_progress", "done"]);
});

test("merge round-trips through validateState (stamps survive save/load)", () => {
  const owner = st({ "Q1.3": rec({ assignee: "sam", "ack.0": true, externalCleared: true }, T1, "jeeef") });
  const again = L.validateState(JSON.parse(JSON.stringify(L.mergeStates([{ user: "jeeef", state: owner }], TEAM)))).state;
  assert.equal(again.quests["Q1.3"]._t.assignee, T1);
  assert.equal(again.quests["Q1.3"].ack[0], true);
  assert.equal(again.quests["Q1.3"].externalCleared, true);
});

test("restamp makes imported values newer than everything else", () => {
  const imported = L.restamp(st({ "Q0.1": rec({ status: "done" }, T1, "old") }), "jeeef");
  const other = st({ "Q0.1": rec({ status: "blocked" }, T3, "jeeef") });
  assert.ok(imported.quests["Q0.1"]._t.status > T3);
  assert.equal(L.mergeStates([{ user: "jeeef", state: other }, { user: "jeeef", state: imported }], TEAM).quests["Q0.1"].status, "done");
});

test("permissions: owner edits all, contributor only assigned quests, viewer nothing", () => {
  const d = data(); const q = d._byId["Q1.3"];
  const s = st({ "Q1.3": rec({ assignee: "sam" }, T1, "jeeef") });
  assert.ok(L.canEditQuest({ mode: "desktop", user: "jeeef", role: "owner" }, q, s));
  assert.ok(L.canEditQuest({ mode: "desktop", user: "sam", role: "contributor" }, q, s));
  assert.ok(!L.canEditQuest({ mode: "desktop", user: "sam", role: "contributor" }, d._byId["Q0.1"], s));
  assert.ok(!L.canEditQuest({ mode: "viewer" }, q, s));
  assert.ok(L.canEditQuest({ mode: "local" }, q, s));
  assert.ok(L.canEditProject({ mode: "desktop", role: "owner" }) && !L.canEditProject({ mode: "desktop", role: "contributor" }) && !L.canEditProject({ mode: "viewer" }));
});

test("assignee filter and recent activity", () => {
  const d = data();
  const s = st({ "Q1.3": { ...rec({ assignee: "sam" }, T1, "jeeef"), history: [{ at: T2, from: "todo", to: "in_progress", by: "sam" }] } });
  assert.deepEqual(L.filterQuests(d, s, { assignee: "sam" }).map((q) => q.id), ["Q1.3"]);
  assert.ok(!L.filterQuests(d, s, { assignee: "__none" }).some((q) => q.id === "Q1.3"));
  assert.equal(L.recentActivity(d, s, 5)[0].by, "sam");
});

test("index.html loads sync.js last so it can start the app", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts.slice(-3), ["js/logic.js", "js/app.js", "js/sync.js"]);
});

test("markdown roadmap contains every quest and ADR", () => {
  const d = data(); const md = L.toMarkdown(d, L.emptyState());
  for (const q of d.quests) assert.ok(md.includes(`### ${q.id} `), q.id);
  for (const a of d.adrs) assert.ok(md.includes(`| ${a.id} |`), a.id);
});

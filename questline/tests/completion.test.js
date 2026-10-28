/* Central Done checks (enforceCompletion via mergeStates) and Agent permissions.
   Run from questline/: node --test */
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/logic.js");
const { loadData } = require("./load.js");

const D = L.prepare(loadData());
const TEAM = { members: [
  { id: "jeeef", role: "owner" }, { id: "sam", role: "contributor" },
  { id: "claude", role: "agent" }, { id: "pm", role: "viewer" }] };
const T = (n) => `2026-10-28T10:00:${String(n).padStart(2, "0")}.000Z`;

/* A quest record: vals like {status:"done", "ack.0":true, "f.report":"…"}, all stamped at `at` by `by`. */
function rec(vals, at, by, history = []) {
  const r = { fields: {}, ack: {}, history, _t: {}, _b: {} };
  for (const [k, v] of Object.entries(vals)) {
    if (k.startsWith("f.")) r.fields[k.slice(2)] = v; else if (k.startsWith("ack.")) r.ack[k.slice(4)] = v; else r[k] = v;
    r._t[k] = at; r._b[k] = by;
  }
  return r;
}
const st = (quests) => ({ ...L.emptyState(), quests });
const ticks = (id) => Object.fromEntries(D._byId[id].acceptance.map((_, i) => [`ack.${i}`, true]));
const merge = (...entries) => L.mergeStates(entries.map(([user, state]) => ({ user, state })), TEAM, D);
const status = (m, id) => L.questStatus(D._byId[id], m);

/* ── Step 2: completion enforced centrally ── */

test("a valid Done (deps, all ticks, report) stays Done and unlocks the next quests", () => {
  const owner = st({ "Q0.1": rec({ status: "done", ...ticks("Q0.1"), "f.report": "audit ok" }, T(1), "jeeef") });
  const m = merge(["jeeef", owner]);
  assert.equal(status(m, "Q0.1"), "done");
  assert.equal(m.quests["Q0.1"]._rejected, undefined);
  for (const id of ["Q0.2", "Q0.3", "Q0.4"]) assert.equal(L.derivedStatus(D._byId[id], D, m), "ready", id);
});

test("the owner cannot mark Done without ticks or a report either", () => {
  const owner = st({ "Q0.1": rec({ status: "done" }, T(1), "jeeef") });
  const m = merge(["jeeef", owner]);
  assert.equal(status(m, "Q0.1"), "in_progress");
  const reasons = m.quests["Q0.1"]._rejected.reasons.join(" | ");
  assert.match(reasons, /Acceptance criteria not ticked: 1, 2, 3 of 3/);
  assert.match(reasons, /No completion report/);
  assert.equal(m.quests["Q0.1"]._rejected.by, "jeeef");
  assert.equal(L.derivedStatus(D._byId["Q0.2"], D, m), "locked"); // nothing unlocks
});

test("a contributor's Done without all ticks is refused; with them it is accepted", () => {
  const owner = st({
    "Q0.1": rec({ status: "done", ...ticks("Q0.1"), "f.report": "ok" }, T(1), "jeeef"),
    "Q0.2": rec({ assignee: "sam" }, T(1), "jeeef") });
  const partial = st({ "Q0.2": rec({ status: "done", "ack.0": true, "f.report": "r" }, T(2), "sam") });
  let m = merge(["jeeef", owner], ["sam", partial]);
  assert.equal(status(m, "Q0.2"), "in_progress");
  assert.match(m.quests["Q0.2"]._rejected.reasons[0], /not ticked: 2, 3/);
  const full = st({ "Q0.2": rec({ status: "done", ...ticks("Q0.2"), "f.report": "r" }, T(3), "sam") });
  m = merge(["jeeef", owner], ["sam", full]);
  assert.equal(status(m, "Q0.2"), "done");
});

test("Done with unfinished dependencies is refused, and refusals cascade", () => {
  const owner = st({
    "Q0.1": rec({ status: "done" }, T(1), "jeeef"),                                       // invalid: no ticks/report
    "Q0.2": rec({ status: "done", ...ticks("Q0.2"), "f.report": "ok" }, T(2), "jeeef") }); // valid alone
  const m = merge(["jeeef", owner]);
  assert.equal(status(m, "Q0.1"), "in_progress");
  assert.equal(status(m, "Q0.2"), "in_progress");
  assert.match(m.quests["Q0.2"]._rejected.reasons[0], /Dependencies not done: Q0.1/);
});

test("an unresolved external dependency blocks Done", () => {
  const ok = { status: "done", ...ticks("Q0.5"), "f.report": "pulled" };
  const deps = Object.fromEntries(["Q0.1", "Q0.2", "Q0.3", "Q0.4"].map((id) => [id, rec({ status: "done", ...ticks(id), "f.report": "x" }, T(1), "jeeef")]));
  let m = merge(["jeeef", st({ ...deps, "Q0.5": rec(ok, T(2), "jeeef") })]);
  assert.equal(status(m, "Q0.5"), "in_progress");
  assert.match(m.quests["Q0.5"]._rejected.reasons.join(), /External dependency not resolved/);
  m = merge(["jeeef", st({ ...deps, "Q0.5": rec({ ...ok, externalCleared: true }, T(2), "jeeef") })]);
  assert.equal(status(m, "Q0.5"), "done");
});

test("existing progress shaped like the real file (Q0.1–Q0.4 done, ticked, reported) is preserved", () => {
  const hist = (id) => [{ at: T(1), from: "in_progress", to: "done", by: "jeeef", forced: true }];
  const owner = st(Object.fromEntries(["Q0.1", "Q0.2", "Q0.3", "Q0.4"].map((id) => [id,
    rec({ status: "done", ...ticks(id), [id === "Q0.1" ? "f.actual" : "f.report"]: "report text", assignee: "jeeef" }, T(1), "jeeef", hist(id))])));
  const m = merge(["jeeef", owner]);
  for (const id of ["Q0.1", "Q0.2", "Q0.3", "Q0.4"]) {
    assert.equal(status(m, id), "done", id);
    assert.equal(m.quests[id].history.length, 1, `${id} history kept`);
  }
});

test("enforcement is deterministic and a later valid Done wins over a refused one", () => {
  const owner = st({ "Q0.1": rec({ status: "done" }, T(1), "jeeef") });
  const a = merge(["jeeef", owner]); const b = merge(["jeeef", owner]);
  assert.deepEqual(a, b);
  // The refused result is saved by the owner app, then merged again with the old file: stays refused.
  const saved = L.validateState(JSON.parse(JSON.stringify(a))).state;
  assert.equal(saved.quests["Q0.1"]._rejected.reasons.length, 2);
  assert.equal(status(merge(["jeeef", saved], ["jeeef", owner]), "Q0.1"), "in_progress");
  // Owner ticks everything, writes a report and marks Done again later: accepted.
  const fixed = st({ "Q0.1": rec({ status: "done", ...ticks("Q0.1"), "f.report": "ok" }, T(5), "jeeef") });
  assert.equal(status(merge(["jeeef", saved], ["jeeef", fixed]), "Q0.1"), "done");
});

/* ── Step 3: agent role ── */

const assigned = (id, to) => rec({ assignee: to }, T(1), "jeeef");
const agentReport = (id, at) => JSON.stringify({ questId: id, status: "completed", submittedAt: at, summary: "done" });

test("agent: report and In progress/Blocked on its assigned quest are accepted", () => {
  const owner = st({ "Q0.1": assigned("Q0.1", "claude") });
  const agent = st({ "Q0.1": rec({ status: "blocked", "f.agentReport": agentReport("Q0.1", T(3)) }, T(3), "claude",
    [{ at: T(3), from: "todo", to: "blocked", by: "claude" }]) });
  const m = merge(["jeeef", owner], ["claude", agent]);
  assert.equal(status(m, "Q0.1"), "blocked");
  assert.equal(JSON.parse(m.quests["Q0.1"].fields.agentReport).questId, "Q0.1");
  assert.equal(m.quests["Q0.1"].history.at(-1).by, "claude");
});

test("agent: cannot mark Done, tick criteria, reassign, write notes/reviews, or touch ADRs", () => {
  const owner = st({ "Q0.1": assigned("Q0.1", "claude") });
  const forged = {
    ...L.emptyState(),
    quests: { "Q0.1": rec({ status: "done", ...ticks("Q0.1"), assignee: "sam", "f.report": "x",
      "f.reportReview": JSON.stringify({ decision: "accepted" }), externalCleared: true }, T(9), "claude",
      [{ at: T(9), from: "todo", to: "done", by: "claude" }]) },
    adrs: { "AI-ADR-02": { status: "accepted", history: [], _t: { status: T(9) } } },
    assumptions: { A1: { state: "confirmed", note: "", _t: { state: T(9) } } }
  };
  const m = merge(["jeeef", owner], ["claude", forged]);
  const q = m.quests["Q0.1"];
  assert.equal(L.questStatus(D._byId["Q0.1"], m), "todo");
  assert.deepEqual(q.ack, {});
  assert.equal(q.assignee, "claude");
  assert.equal(q.fields.report, undefined);
  assert.equal(q.fields.reportReview, undefined);
  assert.equal(q.externalCleared, undefined);
  assert.equal(q.history.length, 0);
  assert.equal(m.adrs["AI-ADR-02"], undefined);
  assert.equal(m.assumptions.A1, undefined);
});

test("agent: nothing on quests not assigned to it, and no status over a Done quest", () => {
  const done = rec({ status: "done", ...ticks("Q0.1"), "f.report": "ok", assignee: "claude" }, T(1), "jeeef");
  const owner = st({ "Q0.1": done, "Q0.2": assigned("Q0.2", "sam") });
  const agent = st({
    "Q0.1": rec({ status: "in_progress" }, T(9), "claude"),
    "Q0.2": rec({ status: "blocked", "f.agentReport": agentReport("Q0.2", T(9)) }, T(9), "claude") });
  const m = merge(["jeeef", owner], ["claude", agent]);
  assert.equal(status(m, "Q0.1"), "done");
  assert.equal(m.quests["Q0.2"].status, undefined);
  assert.equal(m.quests["Q0.2"].fields.agentReport, undefined);
});

test("contributor: cannot write the agent report or the owner's review", () => {
  const owner = st({ "Q0.1": assigned("Q0.1", "sam") });
  const sam = st({ "Q0.1": rec({ "f.agentReport": "{}", "f.reportReview": "{}", "f.report": "mine" }, T(2), "sam") });
  const q = merge(["jeeef", owner], ["sam", sam]).quests["Q0.1"];
  assert.equal(q.fields.report, "mine");
  assert.equal(q.fields.agentReport, undefined);
  assert.equal(q.fields.reportReview, undefined);
});

test("an accepted agent report counts as the completion report; a stale review does not", () => {
  const rep = agentReport("Q0.1", T(3));
  const accepted = JSON.stringify({ submittedAt: T(3), decision: "accepted", by: "jeeef", at: T(4) });
  const owner = st({ "Q0.1": rec({ assignee: "claude", status: "done", ...ticks("Q0.1"), "f.reportReview": accepted }, T(4), "jeeef") });
  const agent = st({ "Q0.1": rec({ "f.agentReport": rep }, T(3), "claude") });
  assert.equal(status(merge(["jeeef", owner], ["claude", agent]), "Q0.1"), "done");
  // The agent resubmits after the review: the old acceptance no longer applies.
  const resubmitted = st({ "Q0.1": rec({ "f.agentReport": agentReport("Q0.1", T(8)) }, T(8), "claude") });
  assert.equal(status(merge(["jeeef", owner], ["claude", resubmitted]), "Q0.1"), "in_progress");
});

test("completionChecks lists all four conditions for the UI", () => {
  const checks = L.completionChecks(D._byId["Q0.2"], D, L.emptyState());
  assert.deepEqual(checks.map((c) => c.key), ["deps", "ack", "report", "external"]);
  assert.equal(checks.filter((c) => !c.ok).length, 3);
});

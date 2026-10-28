/* Moving a Claude report between separate workspaces: ql export → prepareImport (work side).
   Run from questline/: node --test */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../js/logic.js");
const { loadData } = require("./load.js");
const { main, encode, decode } = require("../tools/ql.js");

const D = L.prepare(loadData());
const NOW = "2026-10-28T12:00:00.000Z";
const SUBMITTED = "2026-10-28T10:00:00.000Z";
const WORK_TEAM = { members: [{ id: "jeeef", role: "owner" }, { id: "sam", role: "contributor" }, { id: "claude", role: "agent" }] };

function rec(vals, by = "jeeef", at = "2026-10-28T09:00:00.000Z") {
  const r = { fields: {}, ack: {}, history: [], _t: {}, _b: {} };
  for (const [k, v] of Object.entries(vals)) {
    if (k.startsWith("f.")) r.fields[k.slice(2)] = v; else if (k.startsWith("ack.")) r.ack[k.slice(4)] = v; else r[k] = v;
    r._t[k] = at; r._b[k] = by;
  }
  return r;
}
const ticks = (id) => Object.fromEntries(D._byId[id].acceptance.map((_, i) => [`ack.${i}`, true]));
const work = (quests) => ({ ...L.emptyState(), quests });
function report(id, over = {}) {
  return {
    questId: id, status: "completed", summary: "Done on the personal PC.",
    filesChanged: [{ path: "tools/hw_snapshot.py", change: "created" }],
    commands: [{ command: "python -m pytest -q", result: "26 passed", exitCode: 0 }],
    tests: { passed: 26, failed: 0 },
    acceptance: D._byId[id].acceptance.map((_, i) => ({ index: i, met: true, evidence: "checked" })),
    limitations: [], decisions: [], blockers: [], ...over
  };
}
const envelope = (id, over = {}, reportOver = {}) =>
  ({ kind: "questline-agent-report", version: 1, questId: id, submittedAt: SUBMITTED, agent: "claude", exportedAt: "2026-10-28T10:05:00.000Z", report: report(id, reportOver), ...over });
const imp = (env, id, state) => L.prepareImport(env, D._byId[id], D, state, WORK_TEAM, "jeeef", NOW);

test("valid import: stored as an awaiting-review report; nothing ticked, not Done", () => {
  const state = work({ "Q0.1": rec({ assignee: "claude" }) });
  const res = imp(envelope("Q0.1"), "Q0.1", state);
  assert.deepEqual(res.errors, []);
  assert.equal(res.agentId, "claude");
  assert.equal(res.stored.submittedAt, NOW);
  assert.deepEqual(res.stored.source, { submittedAt: SUBMITTED, agent: "claude", exportedAt: "2026-10-28T10:05:00.000Z" });
  assert.deepEqual(res.stored.imported, { by: "jeeef", at: NOW });
  // The owner stores it in their own record; merge + central rules keep the quest not Done.
  const s = state.quests["Q0.1"];
  s.fields.agentReport = JSON.stringify(res.stored); L.stamp(s, "f.agentReport", "jeeef", NOW);
  const m = L.mergeStates([{ user: "jeeef", state }], WORK_TEAM, D);
  const r = L.agentReportOf(m.quests["Q0.1"]);
  assert.ok(r.report && !r.accepted);
  assert.deepEqual(m.quests["Q0.1"].ack, {});
  assert.notEqual(L.questStatus(D._byId["Q0.1"], m), "done");
});

test("after import: accept (owner ticks + review) then Done is valid and unlocks the next quest", () => {
  const state = work({ "Q0.1": rec({ assignee: "claude" }) });
  const { stored } = imp(envelope("Q0.1"), "Q0.1", state);
  const review = JSON.stringify({ submittedAt: stored.submittedAt, decision: "accepted", by: "jeeef", at: NOW });
  state.quests["Q0.1"] = rec({ assignee: "claude", "f.agentReport": JSON.stringify(stored), "f.reportReview": review, ...ticks("Q0.1"), status: "done" }, "jeeef", NOW);
  const m = L.mergeStates([{ user: "jeeef", state }], WORK_TEAM, D);
  assert.equal(L.questStatus(D._byId["Q0.1"], m), "done");
  assert.equal(L.derivedStatus(D._byId["Q0.2"], D, m), "ready");
});

test("invalid reports are refused (schema revalidated on the work side)", () => {
  const state = work({ "Q0.1": rec({ assignee: "claude" }) });
  const cases = {
    absolutePath: [{}, { filesChanged: [{ path: "C:/Windows/x.dll", change: "modified" }] }],
    escaping: [{}, { filesChanged: [{ path: "../RBC/x.py", change: "modified" }] }],
    wrongCount: [{}, { acceptance: [{ index: 0, met: true, evidence: "x" }] }],
    missingSummary: [{}, { summary: "" }],
    badStatus: [{}, { status: "done" }],
    unknownReportKey: [{}, { ack: { 0: true } }]
  };
  for (const [name, [envOver, repOver]] of Object.entries(cases)) {
    const res = imp(envelope("Q0.1", envOver, repOver), "Q0.1", state);
    assert.ok(res.errors.length && !res.stored, name);
    assert.ok(res.errors.some((e) => e.startsWith("Report:")), name);
  }
  assert.ok(imp("not an object", "Q0.1", state).errors.length);
  assert.ok(imp(envelope("Q0.1", { kind: "something-else" }), "Q0.1", state).errors.some((e) => /kind/.test(e)));
  assert.ok(imp(envelope("Q0.2"), "Q0.1", state).errors.some((e) => /for Q0.2, not Q0.1/.test(e)));
  assert.ok(imp(envelope("Q0.1", { submittedAt: "yesterday" }), "Q0.1", state).errors.some((e) => /timestamp/.test(e)));
  assert.ok(imp(envelope("Q0.1", { submittedAt: "2030-01-01T00:00:00.000Z" }), "Q0.1", state).errors.some((e) => /future/.test(e)));
});

test("wrong assignment in the work workspace is refused", () => {
  assert.match(imp(envelope("Q0.1"), "Q0.1", work({})).errors.join(), /not assigned to an Agent in this workspace/);
  assert.match(imp(envelope("Q0.1"), "Q0.1", work({ "Q0.1": rec({ assignee: "sam" }) })).errors.join(), /assigned to sam/);
  assert.match(imp(envelope("Q0.1"), "Q0.1", work({ "Q0.1": rec({ assignee: "jeeef" }) })).errors.join(), /assigned to jeeef/);
});

test("dependencies are checked against the work workspace, not the personal one", () => {
  // Personal PC had Q0.1 done; the work workspace does not.
  const res = imp(envelope("Q0.2"), "Q0.2", work({ "Q0.2": rec({ assignee: "claude" }) }));
  assert.match(res.errors.join(), /Dependencies not done: Q0.1/);
  const ok = imp(envelope("Q0.2"), "Q0.2", work({
    "Q0.1": rec({ status: "done", ...ticks("Q0.1"), "f.report": "r" }),
    "Q0.2": rec({ assignee: "claude" }) }));
  assert.deepEqual(ok.errors, []);
});

test("forged completion claims are refused", () => {
  const state = work({ "Q0.1": rec({ assignee: "claude" }) });
  const unmet = D._byId["Q0.1"].acceptance.map((_, i) => ({ index: i, met: i !== 1, evidence: "x" }));
  const forged = {
    envelopeStatusDone: envelope("Q0.1", { status: "done" }),
    envelopeTicks: envelope("Q0.1", { ack: { 0: true, 1: true, 2: true } }),
    envelopeReview: envelope("Q0.1", { reportReview: { decision: "accepted" } }),
    envelopeProgress: envelope("Q0.1", { progress: { quests: { "Q0.1": { status: "done" } } } }),
    envelopeTeam: envelope("Q0.1", { team: { members: [{ id: "claude", role: "owner" }] } }),
    completedButUnmet: envelope("Q0.1", {}, { acceptance: unmet }),
    completedWithFailures: envelope("Q0.1", {}, { tests: { passed: 1, failed: 2 } })
  };
  for (const [name, env] of Object.entries(forged)) assert.ok(imp(env, "Q0.1", state).errors.length, name);
  // Even a valid import cannot complete a quest by itself (no ticks, no Done).
  const done = rec({ assignee: "claude", status: "done", ...ticks("Q0.1"), "f.report": "r" });
  assert.match(imp(envelope("Q0.1"), "Q0.1", work({ "Q0.1": done })).errors.join(), /already Done/);
});

test("duplicate and out-of-date packages are refused", () => {
  const state = work({ "Q0.1": rec({ assignee: "claude" }) });
  const first = imp(envelope("Q0.1"), "Q0.1", state);
  state.quests["Q0.1"].fields.agentReport = JSON.stringify(first.stored);
  assert.match(imp(envelope("Q0.1"), "Q0.1", state).errors.join(), /already imported/);
  assert.match(imp(envelope("Q0.1", { submittedAt: "2026-10-28T08:00:00.000Z" }), "Q0.1", state).errors.join(), /older than the one already imported/);
  // A newer resubmission is accepted, and the owner's earlier review no longer applies to it.
  const newer = imp(envelope("Q0.1", { submittedAt: "2026-10-28T11:00:00.000Z" }), "Q0.1", state);
  assert.deepEqual(newer.errors, []);
});

/* ── ql export (personal side) ── */
function personal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ql-export-"));
  const shared = path.join(root, "shared"), cfg = path.join(root, "config");
  fs.mkdirSync(path.join(shared, "progress"), { recursive: true }); fs.mkdirSync(cfg);
  fs.writeFileSync(path.join(cfg, "config.json"), JSON.stringify({ sync_folder: shared, user: "mootaz" }));
  fs.writeFileSync(path.join(shared, "questline-team.js"), encode({ kind: "team", members: [{ id: "mootaz", role: "owner" }, { id: "claude", role: "agent" }] }));
  fs.writeFileSync(path.join(shared, "progress", "mootaz.js"), encode({ kind: "progress", user: "mootaz", state: work({ "Q0.1": rec({ assignee: "claude" }, "mootaz") }) }));
  process.env.QUESTLINE_CONFIG_DIR = cfg;
  return { root, shared };
}
const run = (...argv) => { const out = [], err = []; const code = main(argv, (s) => out.push(s), (s) => err.push(s)); return { code, out: out.join("\n"), err: err.join("\n") }; };

test("ql export packages only the report, and the work side accepts it", () => {
  const { root, shared } = personal();
  assert.match(run("export", "Q0.1").err, /No report from claude/);
  const rp = path.join(root, "r.json"); fs.writeFileSync(rp, JSON.stringify(report("Q0.1")));
  assert.equal(run("submit", rp).code, 0);
  const out = path.join(root, "out", "Q0.1.qlreport.json");
  const r = run("export", "Q0.1", "--out", out);
  assert.equal(r.code, 0, r.err);
  const env = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.deepEqual(Object.keys(env).sort(), ["agent", "exportedAt", "kind", "questId", "report", "submittedAt", "version"]);
  assert.ok(!JSON.stringify(env).includes("mootaz"), "no personal progress/team data in the package");
  assert.match(run("export", "Q0.1", "--out", out).err, /EEXIST|exists/); // never overwrites
  assert.match(run("export", "Q0.1", "--out", path.join(shared, "x.json")).err, /inside the Questline shared folder/);
  // Work workspace (separate state) imports it.
  const res = L.prepareImport(env, D._byId["Q0.1"], D, work({ "Q0.1": rec({ assignee: "claude" }) }), WORK_TEAM, "jeeef", new Date().toISOString());
  assert.deepEqual(res.errors, []);
});

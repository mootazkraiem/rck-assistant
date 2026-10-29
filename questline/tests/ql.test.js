/* tools/ql.js against a temporary shared folder. Run from questline/: node --test */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const L = require("../js/logic.js");
const { loadData } = require("./load.js");
const { main, encode, decode } = require("../tools/ql.js");

const D = L.prepare(loadData());
const T0 = "2026-10-28T09:00:00.000Z";

/* A fresh "PC": config dir + shared folder with a team and the owner's progress. */
function setup({ agent = true, ownerQuests = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ql-test-"));
  const shared = path.join(root, "shared"), cfg = path.join(root, "config");
  fs.mkdirSync(path.join(shared, "progress"), { recursive: true });
  fs.mkdirSync(cfg);
  fs.writeFileSync(path.join(cfg, "config.json"), JSON.stringify({ sync_folder: shared, user: "jeeef" }));
  const members = [{ id: "jeeef", name: "Jeeef", role: "owner" }];
  if (agent) members.push({ id: "claude", name: "Claude", role: "agent" });
  fs.writeFileSync(path.join(shared, "questline-team.js"), encode({ kind: "team", members }));
  fs.writeFileSync(path.join(shared, "progress", "jeeef.js"),
    encode({ kind: "progress", user: "jeeef", state: { ...L.emptyState(), quests: ownerQuests } }));
  process.env.QUESTLINE_CONFIG_DIR = cfg;
  return { root, shared };
}
const ownerRec = (vals) => {
  const r = { fields: {}, ack: {}, history: [], _t: {}, _b: {} };
  for (const [k, v] of Object.entries(vals)) {
    if (k.startsWith("f.")) r.fields[k.slice(2)] = v; else if (k.startsWith("ack.")) r.ack[k.slice(4)] = v; else r[k] = v;
    r._t[k] = T0; r._b[k] = "jeeef";
  }
  return r;
};
const ticks = (id) => Object.fromEntries(D._byId[id].acceptance.map((_, i) => [`ack.${i}`, true]));
function run(...argv) {
  const out = [], err = [];
  const code = main(argv, (s) => out.push(s), (s) => err.push(s));
  return { code, out: out.join("\n"), err: err.join("\n") };
}
function report(id, over = {}) {
  return {
    questId: id, status: "completed", summary: "Did it.",
    filesChanged: [{ path: "audit/AUDIT.md", change: "created" }],
    commands: [{ command: "python -m pytest -q", result: "26 passed", exitCode: 0 }],
    tests: { passed: 26, failed: 0, summary: "all green" },
    acceptance: D._byId[id].acceptance.map((_, i) => ({ index: i, met: true, evidence: "checked" })),
    limitations: [], decisions: [], blockers: [], nextQuest: "Q0.2", cost: "none", ...over
  };
}
function writeReport(root, obj, name = "r.json") {
  const p = path.join(root, name);
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj));
  return p;
}
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function merged(shared) {
  const team = decode(fs.readFileSync(path.join(shared, "questline-team.js"), "utf8"));
  const entries = team.members.map((m) => {
    const p = path.join(shared, "progress", `${m.id}.js`);
    return fs.existsSync(p) ? { user: m.id, state: L.validateState(decode(fs.readFileSync(p, "utf8")).state).state } : null;
  }).filter(Boolean);
  return L.mergeStates(entries, team, D);
}

test("no agent member: every command explains how to add one", () => {
  setup({ agent: false });
  const r = run("show", "Q0.1");
  assert.equal(r.code, 1);
  assert.match(r.err, /Team → add "Claude"/);
});

test("show refuses unassigned quests and quests with unfinished dependencies", () => {
  setup({ ownerQuests: { "Q0.2": ownerRec({ assignee: "claude" }) } });
  assert.match(run("show", "Q0.1").err, /not assigned to claude/);
  const r = run("show", "Q0.2");
  assert.equal(r.code, 1);
  assert.match(r.err, /Dependencies not done: Q0.1/);
  assert.match(run("show", "nonsense").err, /Not a quest id/);
  assert.match(run("show", "Q9.99").err, /Unknown quest/);
});

test("show prints the agent prompt for a workable assigned quest; list shows it", () => {
  setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const r = run("show", "Q0.1");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Quest Q0.1/);
  assert.match(r.out, /node questline\/tools\/ql.js submit \.questline-reports\/Q0.1.json/);
  assert.match(r.out, /You cannot mark the quest Done/);
  assert.match(run("list").out, /Q0.1 .* workable/);
});

test("submit writes only the agent's own file, atomically; the owner's file is untouched", () => {
  const { root, shared } = setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const ownerFile = path.join(shared, "progress", "jeeef.js"), teamFile = path.join(shared, "questline-team.js");
  const before = [sha(ownerFile), sha(teamFile)];
  const r = run("submit", writeReport(root, report("Q0.1")));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([sha(ownerFile), sha(teamFile)], before);
  assert.deepEqual(fs.readdirSync(path.join(shared, "progress")).sort(), ["claude.js", "jeeef.js"]); // no temp files left
  const m = merged(shared);
  const { report: stored } = L.agentReportOf(m.quests["Q0.1"]);
  assert.equal(stored.questId, "Q0.1");
  assert.equal(stored.agent, "claude");
  assert.equal(m.quests["Q0.1"].status, "in_progress");
  assert.equal(L.questStatus(D._byId["Q0.1"], m), "in_progress"); // never Done
  assert.deepEqual(m.quests["Q0.1"].ack, {});                       // never ticks
});

test("submit with status blocked sets the quest Blocked", () => {
  const { root, shared } = setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const r = run("submit", writeReport(root, report("Q0.1", { status: "blocked", blockers: ["Ollama not installed"],
    acceptance: D._byId["Q0.1"].acceptance.map((_, i) => ({ index: i, met: false, evidence: "not run" })) })));
  assert.equal(r.code, 0, r.err);
  assert.equal(merged(shared).quests["Q0.1"].status, "blocked");
});

test("submit rejects invalid reports and writes nothing", () => {
  const { root, shared } = setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const bad = {
    absolutePath: report("Q0.1", { filesChanged: [{ path: "C:\\Windows\\system32\\x.dll", change: "modified" }] }),
    escapingPath: report("Q0.1", { filesChanged: [{ path: "../RBC/server/main.py", change: "modified" }] }),
    unixAbsolute: report("Q0.1", { filesChanged: [{ path: "/etc/passwd", change: "modified" }] }),
    gitDir: report("Q0.1", { filesChanged: [{ path: ".git/config", change: "modified" }] }),
    completedButUnmet: report("Q0.1", { acceptance: D._byId["Q0.1"].acceptance.map((_, i) => ({ index: i, met: i > 0, evidence: "x" })) }),
    completedWithFailures: report("Q0.1", { tests: { passed: 3, failed: 1 } }),
    blockedNoBlocker: report("Q0.1", { status: "blocked", blockers: [] }),
    unknownKey: { ...report("Q0.1"), runThis: "rm -rf /" },
    wrongCount: report("Q0.1", { acceptance: [{ index: 0, met: true, evidence: "x" }] }),
    duplicateIndex: report("Q0.1", { acceptance: D._byId["Q0.1"].acceptance.map(() => ({ index: 0, met: true, evidence: "x" })) }),
    hugeSummary: report("Q0.1", { summary: "x".repeat(5000) }),
    badStatus: report("Q0.1", { status: "done" }),
    badNext: report("Q0.1", { nextQuest: "Q42.1" })
  };
  for (const [name, obj] of Object.entries(bad)) {
    const r = run("submit", writeReport(root, obj, `${name}.json`));
    assert.equal(r.code, 1, `${name} should be rejected`);
    assert.match(r.err, /not valid \(nothing was written\)/, name);
  }
  assert.match(run("submit", writeReport(root, "{not json", "broken.json")).err, /Invalid JSON/);
  assert.match(run("submit", writeReport(root, "x".repeat(300 * 1024), "big.json")).err, /at most 256 KB/);
  assert.match(run("submit", writeReport(root, report("Q0.1"), "r.txt")).err, /Usage/);
  assert.ok(!fs.existsSync(path.join(shared, "progress", "claude.js")), "nothing written");
});

test("submit refuses unassigned, Done or blocked-by-dependency quests", () => {
  const done = ownerRec({ assignee: "claude", status: "done", ...ticks("Q0.1"), "f.report": "ok" });
  const { root } = setup({ ownerQuests: { "Q0.1": done, "Q0.3": ownerRec({ assignee: "jeeef" }), "Q0.5": ownerRec({ assignee: "claude" }) } });
  assert.match(run("submit", writeReport(root, report("Q0.1"))).err, /already Done/);
  assert.match(run("submit", writeReport(root, report("Q0.3"))).err, /not assigned to claude/);
  assert.match(run("submit", writeReport(root, report("Q0.5"))).err, /Dependencies not done/);
});

test("commands in a report are never executed", () => {
  const { root, shared } = setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const marker = path.join(root, "PWNED");
  const evil = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')"`;
  const r = run("submit", writeReport(root, report("Q0.1", { commands: [{ command: evil, result: "ok" }] })));
  assert.equal(r.code, 0, r.err);
  assert.ok(!fs.existsSync(marker));
  assert.equal(L.agentReportOf(merged(shared).quests["Q0.1"]).report.commands[0].command, evil); // stored as text
});

test("--agent must name an Agent member, never the owner", () => {
  const { root, shared } = setup({ ownerQuests: { "Q0.1": ownerRec({ assignee: "claude" }) } });
  const ownerFile = path.join(shared, "progress", "jeeef.js");
  const before = sha(ownerFile);
  assert.match(run("submit", writeReport(root, report("Q0.1")), "--agent", "jeeef").err, /not an Agent member/);
  assert.equal(sha(ownerFile), before);
});

test("read shows any quest without assignment, writes nothing, and submit stays locked", () => {
  const { root, shared } = setup();
  const before = fs.readdirSync(path.join(shared, "progress")).map((f) => sha(path.join(shared, "progress", f)));
  const r = run("read", "Q7.5");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /READ-ONLY VIEW of Q7.5/);
  assert.match(r.out, /assigned to nobody/);
  assert.match(r.out, /cannot submit a report for it yet/);
  assert.match(r.out, /Quest Q7.5/);
  assert.deepEqual(fs.readdirSync(path.join(shared, "progress")).map((f) => sha(path.join(shared, "progress", f))), before);
  assert.match(run("submit", writeReport(root, report("Q7.5"))).err, /not assigned to claude/);
  assert.match(run("read", "Q99.1").err, /Unknown quest/);
});

test("missing setup gives a clear message", () => {
  process.env.QUESTLINE_CONFIG_DIR = path.join(os.tmpdir(), "ql-no-such-dir-" + process.pid);
  assert.match(run("list").err, /not set up on this PC/);
});

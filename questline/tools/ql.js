#!/usr/bin/env node
/* Questline CLI for Claude Code (the "Agent" team member). Requires Node.js 18+.

     node questline/tools/ql.js list                 quests assigned to the agent
     node questline/tools/ql.js show <quest-id>      print the quest prompt (refuses if not workable)
     node questline/tools/ql.js submit <report.json> validate and record a completion report
     node questline/tools/ql.js export <quest-id>    package the submitted report for another
                                                     workspace (report only; --out <file.json>)

   What it can write: ONLY <shared folder>/progress/<agent-id>.js, the agent's own file, by
   atomic replace. Never the owner's or anyone else's file, never the team file.
   What that file can change is limited again by the merge (js/logic.js): the agent's report
   and status In progress / Blocked on quests assigned to it. Done is the owner's decision.
   Commands listed in a report are stored as text and never executed.

   Finds the shared folder from Questline's settings: %APPDATA%\Questline\config.json
   (or QUESTLINE_CONFIG_DIR). --agent <id> picks the agent if the team has several. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../js/logic.js");
const { loadData } = require("./plan.js");

const PREFIX = "window.QUESTLINE_SYNC.push(";
const SUFFIX = ");";
const TEAM_FILE = "questline-team.js";
const MAX_REPORT_BYTES = 256 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const QUEST_RE = /^Q\d+\.\d+$/;

class QlError extends Error {}

/* ── shared-folder files (same format as desktop/store.py) ── */
function decode(text, file) {
  const t = text.trim();
  if (!t.startsWith(PREFIX) || !t.endsWith(SUFFIX)) throw new QlError(`${file} is not a Questline file`);
  return JSON.parse(t.slice(PREFIX.length, -SUFFIX.length));
}
const encode = (obj) => PREFIX + JSON.stringify(obj) + SUFFIX + "\n";

function configDir() {
  return process.env.QUESTLINE_CONFIG_DIR || path.join(process.env.APPDATA || os.homedir(), "Questline");
}
function syncDir() {
  const cfgPath = path.join(configDir(), "config.json");
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); }
  catch (e) { throw new QlError(`Questline is not set up on this PC (${cfgPath} missing). Open the Questline app once and connect a shared folder.`); }
  const dir = cfg.sync_folder;
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new QlError(`Shared folder not found: ${dir}`);
  return dir;
}
function readTeam(dir) {
  const p = path.join(dir, TEAM_FILE);
  if (!fs.existsSync(p)) throw new QlError(`No team file in ${dir}`);
  const team = decode(fs.readFileSync(p, "utf8"), TEAM_FILE);
  if (team.kind !== "team" || !Array.isArray(team.members)) throw new QlError(`${TEAM_FILE} is not a team file`);
  return team;
}
function pickAgent(team, wanted) {
  const agents = team.members.filter((m) => m.role === "agent" && ID_RE.test(m.id));
  if (wanted) {
    const a = agents.find((m) => m.id === wanted);
    if (!a) throw new QlError(`"${wanted}" is not an Agent member of this team.`);
    return a;
  }
  if (!agents.length) throw new QlError('No Agent member. In Questline: Team → add "Claude" with the role "Agent (Claude Code)".');
  if (agents.length > 1) throw new QlError(`Several agents (${agents.map((a) => a.id).join(", ")}): pass --agent <id>.`);
  return agents[0];
}
function readProgress(dir, uid) {
  const p = path.join(dir, "progress", `${uid}.js`);
  if (!fs.existsSync(p)) return null;
  const doc = decode(fs.readFileSync(p, "utf8"), `progress/${uid}.js`);
  if (doc.kind !== "progress" || doc.user !== uid) throw new QlError(`progress/${uid}.js has the wrong owner or kind`);
  return L.validateState(doc.state).state || L.emptyState();
}
/* Everyone's progress merged with the central rules: the same view the app shows. */
function currentState(dir, team, data) {
  const entries = [];
  for (const m of team.members) {
    if (!ID_RE.test(m.id)) continue;
    try { const s = readProgress(dir, m.id); if (s) entries.push({ user: m.id, state: s }); }
    catch (e) { console.error(`ql: warning: skipped ${m.id}'s progress (${e.message})`); }
  }
  return L.mergeStates(entries, team, data);
}
/* Atomic, complete-file replacement of the agent's OWN file; refuses any other target. */
function writeAgentProgress(dir, team, agentId, state) {
  const member = team.members.find((m) => m.id === agentId);
  if (!member || member.role !== "agent" || !ID_RE.test(agentId)) throw new QlError("Refusing to write: not an agent's own file.");
  const pdir = path.join(dir, "progress");
  fs.mkdirSync(pdir, { recursive: true });
  const target = path.join(pdir, `${agentId}.js`);
  if (path.dirname(path.resolve(target)) !== path.resolve(pdir)) throw new QlError("Refusing to write outside progress/.");
  const tmp = path.join(pdir, `.${agentId}.js.${process.pid}.tmp`);
  fs.writeFileSync(tmp, encode({ kind: "progress", user: agentId, savedAt: new Date().toISOString(), state }), "utf8");
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, target); return target; }
    catch (e) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
      const until = Date.now() + 200 * (attempt + 1); while (Date.now() < until) { /* sync client briefly locks files */ }
    }
  }
}

/* ── commands ── */
function context(opts) {
  const dir = syncDir();
  const team = readTeam(dir);
  const agent = pickAgent(team, opts.agent);
  const data = L.prepare(loadData());
  return { dir, team, agent, data, state: currentState(dir, team, data) };
}
function questOrFail(data, id) {
  if (!QUEST_RE.test(id || "")) throw new QlError(`Not a quest id: ${id}`);
  const q = data._byId[id];
  if (!q) throw new QlError(`Unknown quest: ${id}`);
  return q;
}
function cmdList(opts, out) {
  const { agent, data, state } = context(opts);
  const mine = data.quests.filter((q) => L.assigneeOf(q, state) === agent.id);
  if (!mine.length) { out(`No quests are assigned to ${agent.id}.`); return 0; }
  for (const q of mine) {
    const problems = L.agentQuestProblems(q, agent.id, data, state);
    out(`${q.id.padEnd(6)} ${L.STATUS_LABEL[L.derivedStatus(q, data, state)].padEnd(17)} ${problems.length ? "not workable: " + problems[0] : "workable"}  ${q.title}`);
  }
  return 0;
}
function cmdShow(id, opts, out) {
  const { agent, data, state } = context(opts);
  const q = questOrFail(data, id);
  const problems = L.agentQuestProblems(q, agent.id, data, state);
  if (problems.length) throw new QlError(`Cannot work on ${id}:\n- ${problems.join("\n- ")}`);
  out(L.buildPrompt(q, data, state, { agent: true }));
  return 0;
}
function cmdSubmit(file, opts, out) {
  if (!file || path.extname(file).toLowerCase() !== ".json") throw new QlError("Usage: ql submit <report.json>");
  let st;
  try { st = fs.statSync(file); } catch (e) { throw new QlError(`Cannot read ${file}`); }
  if (!st.isFile() || st.size > MAX_REPORT_BYTES) throw new QlError(`The report must be a JSON file of at most ${MAX_REPORT_BYTES / 1024} KB.`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
  catch (e) { throw new QlError(`Invalid JSON in ${file}: ${e.message}`); }
  const { dir, team, agent, data, state } = context(opts);
  const q = questOrFail(data, raw && raw.questId);
  const problems = L.agentQuestProblems(q, agent.id, data, state);
  if (problems.length) throw new QlError(`Cannot submit for ${q.id}:\n- ${problems.join("\n- ")}`);
  const { errors, report } = L.validateAgentReport(raw, q, data);
  if (errors.length) throw new QlError(`The report is not valid (nothing was written):\n- ${errors.join("\n- ")}`);

  const now = new Date().toISOString();
  const own = readProgress(dir, agent.id) || L.emptyState();
  const rec = (own.quests[q.id] = own.quests[q.id] || { fields: {}, ack: {}, history: [] });
  rec.fields.agentReport = JSON.stringify({ ...report, submittedAt: now, agent: agent.id });
  L.stamp(rec, "f.agentReport", agent.id, now);
  const to = report.status === "blocked" ? "blocked" : "in_progress";
  const from = L.questStatus(q, state);
  if (from !== to) {
    rec.status = to;
    L.stamp(rec, "status", agent.id, now);
    rec.history = (rec.history || []).concat({ at: now, from, to, by: agent.id }).slice(-200);
  }
  own.updatedAt = now;
  const written = writeAgentProgress(dir, team, agent.id, own);
  out(`Report for ${q.id} recorded (reported status: ${report.status}; quest is now ${L.STATUS_LABEL[to]}).`);
  out(`Written to ${written}. The owner reviews it in Questline; only the owner can mark ${q.id} Done.`);
  return 0;
}

/* Package the agent's submitted report for another workspace (e.g. personal PC → work PC).
   Contains ONLY the report: no progress, team or settings. The receiving Questline
   revalidates everything against its own state ("Import Claude's report"). */
function cmdExport(id, opts, out) {
  const { dir, agent, data, state } = context(opts);
  const q = questOrFail(data, id);
  const { report: stored } = L.agentReportOf(state.quests[q.id]);
  if (!stored || stored.agent !== agent.id) throw new QlError(`No report from ${agent.id} for ${q.id}. Run "ql submit" first.`);
  const { errors } = L.validateAgentReport(L.makeExportEnvelope(stored, "").report, q, data);
  if (errors.length) throw new QlError(`The stored report is not valid:\n- ${errors.join("\n- ")}`);
  const stamp = new Date().toISOString();
  const target = path.resolve(opts.out || path.join(".questline-reports", "export", `${q.id}-${stamp.replace(/[-:]/g, "").slice(0, 15)}.qlreport.json`));
  if (!target.toLowerCase().endsWith(".json")) throw new QlError("--out must be a .json file");
  const rel = path.relative(path.resolve(dir), target);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new QlError("Refusing to write the package inside the Questline shared folder.");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(L.makeExportEnvelope(stored, stamp), null, 2), { encoding: "utf8", flag: "wx" });
  out(`Exported ${q.id} (submitted ${stored.submittedAt}) to ${target}`);
  out("Transfer it only through a channel your company approves (not the public git repo). On the work PC: quest page → Import Claude's report.");
  return 0;
}

function main(argv, out = console.log, err = console.error) {
  const args = argv.slice();
  const opts = {};
  for (const flag of ["--agent", "--out"]) {
    const i = args.indexOf(flag);
    if (i >= 0) { opts[flag.slice(2)] = args[i + 1]; args.splice(i, 2); }
  }
  const [cmd, arg] = args;
  try {
    if (cmd === "list") return cmdList(opts, out);
    if (cmd === "show") return cmdShow(arg, opts, out);
    if (cmd === "submit") return cmdSubmit(arg, opts, out);
    if (cmd === "export") return cmdExport(arg, opts, out);
    err("Usage: node questline/tools/ql.js list | show <quest-id> | submit <report.json> | export <quest-id> [--out <file.json>] [--agent <id>]");
    return 2;
  } catch (e) {
    err(`ql: ${e instanceof QlError ? e.message : (e && e.stack) || e}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, decode, encode };

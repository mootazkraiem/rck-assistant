/* Loads the browser data files into a sandbox so Node tests use exactly what the page uses. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
// Same order as the <script> tags in index.html.
const DATA_FILES = ["project.js", "adrs.js", "quests-p0-p2.js", "quests-p3-p5.js", "quests-p6-p9.js", "docs.js"];

function loadData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const f of DATA_FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "data", f), "utf8"), sandbox, { filename: f });
  }
  const R = sandbox.window.RCK;
  // Re-materialize in this realm so deepEqual and instanceof behave normally.
  const data = JSON.parse(JSON.stringify({
    project: R.project, phases: R.phases, roles: R.roles, priorities: R.priorities, milestones: R.milestones,
    externalDeps: R.externalDeps, risks: R.risks, facts: R.facts, assumptions: R.assumptions,
    adrs: R.adrs, quests: R.quests, docs: R.docs
  }));
  return data;
}

module.exports = { loadData, ROOT, DATA_FILES };

/* Regenerates ROADMAP.md from the data files (initial progress only; your browser
   progress is exported from the Backup view instead).
   Run from questline/: node tools/export-roadmap.js */
const fs = require("fs");
const path = require("path");
const L = require("../js/logic.js");
const { loadData, ROOT } = require("../tests/load.js");

const data = L.prepare(loadData());
const errors = L.integrityErrors(data);
if (errors.length) {
  console.error("Data integrity errors:\n" + errors.join("\n"));
  process.exit(1);
}
const out = path.join(ROOT, "ROADMAP.md");
fs.writeFileSync(out, L.toMarkdown(data, L.emptyState()) + "\n", "utf8");
console.log(`Wrote ${out} (${data.quests.length} quests, ${data.adrs.length} ADRs)`);

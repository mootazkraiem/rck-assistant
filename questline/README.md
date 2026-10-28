# Questline

An interactive dashboard for running the RCK AI Assistant project. It covers the ADR
registry, the quests, the execution order, progress tracking, Claude Code prompts and
the engineering docs.

It is a static page (HTML, CSS and vanilla JS). There is no backend, nothing to install
and no network calls.

## Launch

The dashboard runs in three modes, and the code is the same in each.

| Mode | Who | How | Where progress lives |
|---|---|---|---|
| **Desktop app (team)** | You and your colleague | Double-click `Questline.exe`, or run `pythonw questline\desktop\app.py` | The shared sync folder |
| **Manager view** | Your project manager | Double-click `Open Questline.html` in the shared folder | Read-only, built from everyone's files |
| Browser (solo) | Anyone | `python questline\launch.py` | This browser only |

### The .exe

```powershell
python questline\desktop\build_exe.py
```

This produces `questline\dist\Questline.exe`: a single file of about 54 MB, with no
console window. Python is not needed to run it. You can delete `questline\build`
afterwards.

- **Contents:** the plan (`data\*.js`) is bundled inside the .exe. After you edit the
  plan, rebuild it and give your colleague the new .exe.
- **Windows SmartScreen:** the .exe is unsigned, so on first launch SmartScreen may show
  "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **Company PC:** if company security software blocks unsigned programs, don't work
  around it. Use the `pythonw` command instead, or ask IT to allow the file.
- **Testing:** set `QUESTLINE_CONFIG_DIR` to use a different settings folder. Tests use
  this so they never touch your real setup.

## Team sync (desktop app)

**First run on each PC:** the app asks for the shared folder (for example a OneDrive or
SharePoint folder synced to the PC) and your name.

- **Empty folder:** you become the **owner**. Open **Team**, then add your colleague as
  **Contributor** and your manager as **Viewer**.
- **Existing folder:** your colleague runs the app, picks the same synced folder and
  enters the exact name you added.

**Shared folder layout:**

```
<shared folder>\
  questline-team.js           members and roles (written by the owner)
  progress\jeeef.js     your progress (only your app writes it)
  progress\sam.js       your colleague's progress (only theirs writes it)
  app\                  read-only copy of the dashboard, refreshed when you start the app
  Open Questline.html   what the manager double-clicks (no install needed)
```

**Why it never conflicts:**

- Each person writes only their own file, so the sync client never has to merge two
  people's edits to the same file.
- The app merges all files itself: every field (status, a note, a tick) carries its
  change time, and the latest change wins.
- Colleagues' changes appear within about 15 seconds, or when you switch back to the
  window.

**Roles,** enforced in the UI and again when merging, so a hand-edited file cannot
bypass them:

- **Owner:** everything, including assigning quests (the "Assigned to" field on each
  quest page), ADRs, assumptions and the team.
- **Contributor:** only the quests assigned to them: status, ticks, notes, results and
  **Start in VS Code**. Changes to anything else are ignored. Their overview shows "Your
  next task".
- **Viewer:** read-only.

**What the manager sees:**

- The overview, with who is working on what and a recent activity feed (who changed
  what, and when).
- All quests, ADRs and docs.
- No editing controls.

They press **Refresh** for the latest state.

**Notes:**

- **Identity** is the name entered on each PC. Real access control is the folder's
  sharing settings, so share it **read-only** with your manager.
- Sync clients sometimes create **conflict copies** (for example `sam-LAPTOP.js`).
  The app ignores them and lists them on the overview, and they are safe to delete.
- **Your colleague's project path** differs from yours. They set it once in
  **Team → This PC** so their Claude Code prompts point to their own checkout.
- **Local data:** each PC keeps daily backups and its settings in
  `%APPDATA%\Questline`. **Disconnect this PC** (Team page) forgets the folder;
  it deletes nothing in it.
- **Moving progress from the browser version:** Backup → Export JSON in the browser,
  then Backup → Import in the app (owner).

## Browser launch (solo)

```powershell
python questline\launch.py
```

This serves the folder on `http://127.0.0.1:8765` (localhost only) and opens your
browser. Stop it with Ctrl+C. Without the launcher, you can also open `index.html`
directly, but read the persistence note first.

## Sections

| View | What it does |
|---|---|
| **Overview** | Mission, current stage, immediate priority and overall progress (weighted by effort). Also shows status counts, phase bars, milestones, the critical path, external dependencies, risks and blockers, the next recommended quest, and a facts vs assumptions summary. |
| **Quests** | All 61 quests, grouped by phase. Filter by phase, status, priority, role or text. |
| **Quest page** | Metadata; the **Execution** tab (objective, steps, files, commands, failures); the **Validation** tab (tests, acceptance checkboxes, completion gate); the **Completion** tab (results, test results, files, decisions, blockers, follow-ups, notes); the **History** tab. Status buttons: To do, In progress, Blocked, Done. **Copy Claude Code prompt**. |
| **Execution order** | A dependency graph laid out in waves (quests in the same wave can run in parallel), with the critical path highlighted and the external blockers listed. |
| **ADRs** | 18 AI-ADRs, searchable. Each detail page covers context, decision, alternatives, reasons, consequences, security, performance and cost, dependencies, related ADRs and quests, acceptance criteria, open questions and history. Status can be changed; every change is recorded. |
| **Docs** | 13 engineering sections, each labelled *implemented*, *partial* or *planned*. |
| **Facts & assumptions** | Facts verified on this machine (with the command used), facts that were only reported, assumptions with the quest that verifies each (you set confirmed/refuted plus evidence), and unresolved decisions. |
| **Backup & export** | Export or import progress JSON, export the roadmap as Markdown, manage snapshots, reset, and check data integrity. |

Global search: press `/`, then use the arrow keys and Enter.

## Working a quest with Claude Code

1. Open the `rck-assistant` folder in VS Code (or click **Open project in VS Code** on
   any quest page).
2. Click **▶ Start in VS Code** on the overview or on a quest page. It does three things:
   - marks the quest In progress;
   - opens a new Claude Code tab in the focused VS Code window with the quest prompt
     pre-filled, through the extension's `vscode://anthropic.claude-code/open?prompt=…`
     link;
   - copies the prompt to your clipboard as a backup.

   The extension never auto-submits, so check the prompt and **press Enter** to start.
   The first time, the browser asks to allow opening Visual Studio Code. If the quest's
   dependencies or external gate are not done, you are warned first.

   **Copy prompt** still works if you prefer to paste it yourself. The prompt contains:
   - the context, the objective and the relevant ADRs;
   - the prerequisites, any unmet dependencies and any external gate;
   - the scope and the allowed files;
   - the validation steps and the acceptance criteria;
   - the restrictions (no external LLM APIs, no paid services, synthetic data only, no unrelated changes);
   - a required completion report, followed by **STOP**.
3. Paste the agent's report into the **Completion** tab and tick the acceptance criteria
   on the **Validation** tab. (Or let Claude submit it itself: see the next section.)
4. Click **Done**. Done is only accepted when every condition holds, and there is no
   override. The conditions are:
   - all dependencies are done;
   - every acceptance criterion is ticked;
   - a report is recorded (or Claude's report has been accepted);
   - any external dependency is resolved.

   The same rule is enforced when progress files are merged, so it also applies to a
   colleague's or a hand-edited file: a refused Done shows on the quest as **"A Done was
   refused"**, with the reasons.

## Claude Code integration (Agent member)

Claude Code can read its quest and submit its report straight into Questline. **You
still decide:** Claude can never mark a quest Done or tick criteria.

**Requirements:**
- The **desktop app** (team mode), since browser-only mode keeps progress in browser
  storage, which no other program can read.
- **Node.js 18 or newer** on the PC where Claude Code runs. Check with `node --version`.

**One-time setup:**
1. In Questline, go to **Team**, add **Claude** with the role **Agent (Claude Code)**.
2. In `rck-assistant`, copy `questline/claude-settings.example.json` to
   `.claude/settings.local.json` (not committed). Replace `SHARED_FOLDER` with your
   shared folder in `//c/...` form (`C:\Users\me\Questline-Shared` becomes
   `//c/Users/me/Questline-Shared`).

**For each quest:**
1. On the quest page, set **Assigned to = Claude**. This is your per-quest permission.
2. **▶ Start in VS Code** opens Claude with the agent version of the prompt. Its last
   section tells Claude to:
   - run `node questline/tools/ql.js show <id>` first;
   - write its report to `.questline-reports/<id>.json` (git-ignored);
   - run `node questline/tools/ql.js submit .questline-reports/<id>.json`.
3. Within about 15 seconds, the quest shows **Claude's report: Awaiting review**, with
   the summary, the criteria and their evidence, the tests, files and commands (as text,
   never executed), limitations, decisions, blockers and the suggested next quest.
4. **Accept report** ticks the criteria Claude marked as met, and records the report as
   the completion report. **Reject report** asks for a reason, and Claude can resubmit.
5. Check the ticks, then click **Done** yourself. The dependent quests unlock as usual.

**What the CLI enforces:**
- `show` refuses quests that aren't assigned to the agent, are already Done, have
  unfinished dependencies, or have an unresolved external dependency.
- `submit` rejects:
  - unknown keys and a wrong `questId`;
  - wrong criterion counts or duplicate indexes;
  - "completed" with unmet criteria or failed tests, and "blocked" without a blocker;
  - absolute paths, `..` and `.git` paths;
  - oversized fields and files over 256 KB.

  Nothing is written when the report is rejected.
- **What it writes:** only `progress/<agent>.js`, by atomic replace. Never your file or
  the team file. Commands in reports are stored as text and never run.
- **What that file can change** (limited again by the merge): its report, and the status
  **In progress** or **Blocked**, on quests assigned to it. It can't mark Done, tick
  criteria, write notes, change the assignee or touch ADRs and assumptions. A forged
  Done in the agent's file is ignored.

**What the permissions do and don't stop.** Questline itself can't stop a program on
your PC from editing files. The real limits are:
- **The settings file:** it denies Claude's file tools access to the shared folder,
  `%APPDATA%\Questline` and `questline/`, and allows only the three `ql.js` commands
  for progress.
  - Per Claude Code's docs, these rules also cover shell commands it recognises (such as
    `cat` or `sed`) and output redirection (`>` into a file).
  - They do **not** cover a Python or Node script that opens files itself.
  - For OS-level blocking, use Claude Code's sandboxing, where your platform supports it.
- **Keep Claude Code in Manual mode** (it asks before each shell command) for quests
  that touch sensitive files. `disableBypassPermissionsMode` blocks the "skip all
  permissions" mode.
- **The merge rules and your review** are the second layer. Anything written as the
  agent is limited as described above, and nothing becomes Done without you.

## Moving the shared folder

Close every Questline window first, then run:
```powershell
python questline\desktop\migrate_shared.py --to "C:\Users\me\Questline-Shared"
```
It:
1. refuses while Questline runs, and refuses to overwrite a folder that already holds
   Questline files;
2. backs up the team file, every progress file and `config.json` to
   `%APPDATA%\Questline\backups\migration-<time>`, and checks the copies byte for byte;
3. copies the files to the new folder and checks them again;
4. switches the setting, then republishes the manager view.

It never deletes anything: remove the old copies yourself after checking.

**Keep the shared folder outside `rck-assistant`.** That repo is public, and the local web
server must never sit next to progress files.

## Persistence and backup

- Progress is saved automatically in the browser's `localStorage`. It survives refreshes
  and restarts.
- Storage belongs to the *origin*: `http://127.0.0.1:8765` and a double-clicked
  `file://…/index.html` keep **separate** progress. Pick one (the launcher is
  recommended) and always use the same port.
- A snapshot is taken automatically once a day, and before every import, restore or
  reset. The last 15 are kept.
- The only backup that survives clearing browser data is an exported file:
  **Backup & export → Export progress (JSON)**. Export after each work session.
- If storage is blocked (private window), the header shows a red warning. Export before
  closing the tab.

## Editing the project data

All content lives in `data/*.js`. The UI never needs to change.

| File | Contents |
|---|---|
| `data/project.js` | Mission, phases, roles, priorities, milestones, external dependencies, risks, facts, assumptions, agent restrictions |
| `data/adrs.js` | ADR registry |
| `data/quests-p0-p2.js`, `quests-p3-p5.js`, `quests-p6-p9.js` | Quests |
| `data/docs.js` | Documentation sections |

**Adding a quest:** append an object to `R.quests.push(...)` in the right file.

- **Required:**
  - `id`, `phase`, `title`, `desc`
  - `priority` (`P0`–`P3`)
  - `status` (`todo` | `in_progress` | `blocked` | `done`)
  - `hours` (> 0)
  - `role` (a key of `R.roles`)
  - `adrs` (existing IDs), `deps` (existing quest IDs)
  - `objective`, `why`
  - non-empty lists: `steps`, `files`, `acceptance`, `evidence`
- **Optional:** `prereqs`, `external` (text; makes the quest wait until marked resolved),
  `commands`, `outputs`, `failures` (`[[case, fix], …]`), `tests` (`{unit, integration,
  manual}`), `expected`, `limitations`, `followUps`, `actual`, `filesChanged`.

**Adding an ADR:** append to `R.adrs`. A `proposed` ADR must list `openQuestions` (the
information needed to decide it).

After editing:

```powershell
cd questline; node --test; node tools\export-roadmap.js
```

The tests reject unknown references, dependency cycles, missing fields, and any local
quest (P0–P6) that depends on GPU or RCK work. The second command regenerates
`ROADMAP.md`. Reload the page; the Backup view also shows integrity problems.

## Tests run on this build

- **Integration build:**
  - **`node --test`, 48 tests.** On top of the list below:
    - **Central Done checks:** refused for owners and contributors without ticks, a
      report or done dependencies; refusals cascade; existing valid progress is
      preserved; the result is deterministic.
    - **Agent permissions:** report and In progress/Blocked only; no Done, ticks,
      reassignment, review fields, ADRs or assumptions; nothing on unassigned or Done
      quests.
    - **The CLI:** refusals; invalid reports with nothing written; only the agent's own
      file written; commands never executed.
  - **`python -m pytest -q questline/desktop/tests`:**
    - local web server allowlist and no port sharing (29 tests);
    - migration (4 tests).
  - **`python questline\desktop\tests\e2e_agent_flow.py`:** the real app, hidden, with
    temporary folders. 20/20 checks: assign, show, submit, awaiting review, Done refused,
    reject, resubmit, accept with ticks, Done, next quest unlocks, forged agent Done
    ignored.
- `node --test` (25 tests): data integrity; the audit is the first quest; P0–P6 never
  depend on P7/P8; derived statuses; waves; the critical path; progress; filters; search;
  prompt contents; import validation; Markdown export.
  - The team merge: latest change wins; a contributor is limited to assigned quests;
    viewers and unknown users are ignored; histories are combined; stamps survive
    save/load; restamping after import.
  - Permissions, the assignee filter and the activity feed.
- `python -m pytest -q questline/desktop/tests` (14 tests), covering the
  shared-folder store:
  - setup as owner, joining, membership checks and role rules;
  - one file per member;
  - conflict copies and corrupt or forged files are rejected;
  - a removed member is cut off;
  - backup rotation, publishing the manager view, and atomic writes.
- `python questline\desktop\tests\smoke_desktop.py` runs the real pywebview app in
  a hidden window, with temporary folders. It checks:
  - start-up and the bridge;
  - a status change saved to the shared folder;
  - assignment;
  - a colleague's change from another "PC" shown live, and one outside their permissions
    ignored;
  - the VS Code link guard, the Team page and the backups list.

  Result: 10/10 checks pass.
- The manager view, opened from `file://` in headless Edge and over http, is read-only
  and shows the merged progress.
- In-browser checks against the launcher:
  - every view and all 61 quest, 18 ADR and 13 doc pages render without console errors;
  - tabs, status changes, the done gate, acceptance ticks and autosaved notes work;
  - progress survives a reload;
  - reset and snapshot restore work;
  - an invalid import is rejected with warnings;
  - filters and search work;
  - layout checked at 800 px and 1366 px.

## Decisions made for this tool

- **Static files plus localStorage, no backend:** the tracker is single-user, and the
  brief asked for nothing elaborate.
- **Data as `.js` files** (not `.json`): they load from `file://` without a server, and
  Node tests read the same files.
- **ADR IDs prefixed `AI-ADR-`**, so they never collide with the RCK application's own
  ADR-01…10.
- **Legacy work recorded as done:** D1 and D2 (corpus, retrieval) are Q1.1 and Q1.2,
  marked done with their measured results. The Q0.1 audit re-verifies them.
- **The earlier plan's B0–B7 steps map to quests:**
  - B0 → Q0.4/Q0.5
  - B1 → Q1.6/Q1.7
  - B2 → Q1.8
  - B3 → Q1.9–Q2.6
  - B4 → Q3.1/Q3.2/Q3.7
  - B5 → Q3.5
  - B6 → P4
  - B7 → Q4.7

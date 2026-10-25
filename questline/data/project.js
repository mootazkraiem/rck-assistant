/* Project-level data: mission, phases, roles, milestones, risks, facts, assumptions.
   Edit this file to change project facts; the UI reads it at load time. */
(function () {
  const R = (window.RCK = window.RCK || {});

  R.project = {
    name: "RCK AI Assistant",
    mission:
      "Give RCK engineers fast, cited answers from approved engineering knowledge, " +
      "serving reviewed answers from a database first and calling a local model only when needed.",
    finalObjective:
      "A retrieval-first assistant integrated into the latest RCK release, backed by a reviewed answer " +
      "database and the benchmark-selected Qwen model deployed on an approved company GPU server.",
    immediatePriority:
      "Phase 0 audit, then local Qwen 4B vs 9B benchmarking (Phases 1–2). Answer database schema work (Q3.1) may run in parallel.",
    workingDir: "C:\\Users\\benkr\\Projects\\rck-assistant",
    revised: "2026-10-25",
    agentContext:
      "RCK (Release Knowledge Capture) is an internal engineering knowledge application (pywebview client, " +
      "FastAPI + SQLite server). We are building a standalone AI assistant in C:\\Users\\benkr\\Projects\\rck-assistant " +
      "that answers engineering questions from APPROVED tickets only, cites tickets as [T-1042], answers in EN/DE/RO, " +
      "and returns exactly \"Not enough information.\" when evidence is insufficient. Strategy: benchmark local Qwen 4B vs 9B " +
      "with Ollama, store reviewed answers in an answer database, and serve validated answers on a reliable question match " +
      "without model inference; otherwise apply a configurable fallback policy. Development is local-first with synthetic data. " +
      "The local RCK copy in C:\\Users\\benkr\\Projects\\RBC is NOT the latest company version and must not be modified by assistant quests.",
    restrictions: [
      "Inspect the existing files relevant to this quest before changing anything.",
      "Preserve useful existing work; do not delete or rewrite working code without stating why.",
      "Modify only the files listed for this quest. No unrelated refactoring, renaming or formatting changes.",
      "Use synthetic or explicitly authorized data only. Never use real tickets or company documents.",
      "Make no external LLM API calls. The only model endpoint allowed is local Ollama on 127.0.0.1.",
      "Start no paid services and rent no GPUs. Do not download models unless this quest explicitly says it is approved.",
      "Do not modify the RCK application (C:\\Users\\benkr\\Projects\\RBC) unless this quest explicitly targets it.",
      "Do not commit or push unless I ask.",
      "Run the required tests and report exact commands and results, including failures.",
      "Stop when this quest is complete and wait for my next instruction. Do not start the next quest."
    ]
  };

  R.phases = [
    { id: "P0", name: "Project audit", goal: "Verify existing work, machine resources, runtime and candidate models." },
    { id: "P1", name: "Benchmark preparation", goal: "Dataset, gold answers, scoring, prompt, checks, model client and runner." },
    { id: "P2", name: "Qwen benchmarking", goal: "Measure Qwen 4B and 9B under identical conditions and select one on evidence." },
    { id: "P3", name: "Answer database", goal: "Schema, lifecycle, candidate generation, pre-validation and human review." },
    { id: "P4", name: "Retrieval-first assistant", goal: "Exact + keyword matching with critical-term guard, thresholds and fallback." },
    { id: "P5", name: "Safety & evaluation", goal: "Injection, unapproved-source, near-miss and regression suites; system report." },
    { id: "P6", name: "Standalone demo", goal: "Local UI showing provenance, reuse, refusal and abstention; demo script." },
    { id: "P7", name: "RCK integration", goal: "Audit the latest RCK source and integrate through adapters, behind RCK auth." },
    { id: "P8", name: "GPU deployment preparation", goal: "Requirements, verified costs, runbook; provision only with explicit approval." },
    { id: "P9", name: "Production hardening", goal: "Feedback, freshness, monitoring, load, backup/rollback and release docs." }
  ];

  R.roles = {
    arch: "AI Architect",
    ml: "ML Engineer",
    swe: "Software Engineer",
    db: "Database Architect",
    cloud: "Cloud Engineer",
    qa: "QA Engineer",
    sec: "Security Engineer"
  };

  R.priorities = {
    P0: "Critical",
    P1: "High",
    P2: "Medium",
    P3: "Low"
  };

  R.milestones = [
    { id: "M1", title: "Audit complete", quests: ["Q0.1", "Q0.2", "Q0.3", "Q0.4"] },
    { id: "M2", title: "Benchmark harness ready", quests: ["Q1.10", "Q1.11", "Q2.1"] },
    { id: "M3", title: "Model selected on evidence", quests: ["Q2.6"] },
    { id: "M4", title: "Validated answer database v1", quests: ["Q3.8"] },
    { id: "M5", title: "Retrieval-first assistant passes safety suite", quests: ["Q4.7", "Q5.4"] },
    { id: "M6", title: "Standalone demo ready", quests: ["Q6.4"] },
    { id: "M7", title: "Integrated into latest RCK", quests: ["Q7.5"], external: true },
    { id: "M8", title: "Running on approved GPU server", quests: ["Q8.5"], external: true },
    { id: "M9", title: "Production-ready release", quests: ["Q9.6"] }
  ];

  R.externalDeps = [
    { id: "E1", title: "Explicit approval to download Qwen models (~10 GB, free)", blocks: ["Q0.5"], owner: "You" },
    { id: "E2", title: "Named answer reviewer (you act as reviewer until assigned)", blocks: ["Q3.8"], owner: "You / team lead" },
    { id: "E3", title: "Access to the latest RCK source on the company PC", blocks: ["Q7.1"], owner: "You (company PC)" },
    { id: "E4", title: "Company approval, budget and data clearance for a GPU server", blocks: ["Q8.4"], owner: "Company / client" },
    { id: "E5", title: "Client validation before any use of the company AI platform — out of current scope", blocks: [], owner: "Client" }
  ];

  R.risks = [
    { id: "R1", level: "high", title: "Qwen 9B does not fit in 4 GB VRAM",
      impact: "Partial CPU offload makes 9B latency on this laptop unrepresentative of a GPU server.",
      mitigation: "Record the CPU/GPU split per run; judge accuracy locally, re-measure latency on the GPU server (Q8.5)." },
    { id: "R2", level: "high", title: "Cache serves a similar but different question",
      impact: "A wrong validated answer is worse than no answer (e.g. VAL-217 vs VAL-271).",
      mitigation: "Critical-term guard + threshold calibrated to zero false matches on a labelled near-miss set (Q4.2, Q4.5)." },
    { id: "R3", level: "medium", title: "Synthetic data overstates quality",
      impact: "Questions and tickets were written by the same author, so wording overlaps more than in real use.",
      mitigation: "Treat results as relative (4B vs 9B); re-evaluate on authorized real questions after P7." },
    { id: "R4", level: "medium", title: "Stored answers go stale after ticket edits",
      impact: "Validated answers could contradict updated tickets.",
      mitigation: "Store cited ticket hashes; mark entries stale on change or un-approval (Q3.3, Q9.2)." },
    { id: "R5", level: "medium", title: "Latest RCK schema and auth unknown",
      impact: "Integration design could be wrong if based on the outdated local copy.",
      mitigation: "Integration only through adapters, designed after the read-only audit of the latest source (Q7.1)." },
    { id: "R6", level: "low", title: "Disk space (17 GB free)",
      impact: "Two Qwen models (~10 GB) leave little headroom.",
      mitigation: "Check before download; removing llama3.1:8b (4.9 GB) only with your approval (Q0.5)." },
    { id: "R7", level: "medium", title: "Qwen thinking mode breaks output contract or latency",
      impact: "Reasoning text may leak into answers and inflate response time.",
      mitigation: "Benchmark with thinking disabled; validate the flag in Q1.8; optional thinking-on run documented separately." },
    { id: "R8", level: "low", title: "Limited Claude Code usage",
      impact: "Large uncontrolled agent runs waste budget.",
      mitigation: "Small quests with explicit file scope and a mandatory stop after completion." }
  ];

  R.facts = [
    { id: "F1", text: "Ollama 0.40.9 is installed (0.40.11 available).", source: "ollama --version", date: "2026-10-25" },
    { id: "F2", text: "Installed models: llama3.2:3b, llama3.1:8b, all-minilm. No Qwen model is installed.", source: "ollama list", date: "2026-10-25" },
    { id: "F3", text: "GPU: NVIDIA GeForce RTX 2050 with 4096 MiB VRAM.", source: "nvidia-smi", date: "2026-10-25" },
    { id: "F4", text: "17 GB free on drive C:.", source: "Get-PSDrive C", date: "2026-10-25" },
    { id: "F5", text: "Node 24.18.0 and Python 3.14.4 are available.", source: "node --version / python --version", date: "2026-10-25" },
    { id: "F6", text: "Synthetic corpus: 40 tickets (34 approved, 6 not), 30 EN / 10 DE; 20 eval questions (14 answerable, 6 not; EN 11 / DE 5 / RO 4). Validator passes.", source: "validate_dataset.py", date: "2026-10" },
    { id: "F7", text: "8/8 search tests pass. Retrieval top-5: same-language 8/8, cross-language 5/6 (Q11 missed); unapproved tickets never returned.", source: "pytest, eval_retrieval.py", date: "2026-10" },
    { id: "F8", text: "The local RCK copy (C:\\Users\\benkr\\Projects\\RBC) has 52 passing tests and is NOT the latest company version.", source: "pytest; user statement", date: "2026-10" },
    { id: "F9", text: "Reported by you, not verified here: the latest RCK on the company PC includes Engineering Cases and 73 + 50 tests.", source: "user statement", date: "2026-10", reported: true },
    { id: "F10", text: "Reported in an earlier session, re-verify in Q0.2: Ryzen 7 7435HS CPU, ~24 GB RAM.", source: "earlier session", date: "2026-09", reported: true }
  ];

  R.assumptions = [
    { id: "A1", text: "\"Qwen 4B / 9B\" means the Qwen3.5 4B and 9B models, available in Ollama as qwen3.5:4b and qwen3.5:9b.", verifyIn: "Q0.4", risk: "Wrong tags or generation; benchmark targets the wrong models." },
    { id: "A2", text: "Both models are benchmarked at the same quantization (Q4_K_M), about 3.4 GB and 6.6 GB on disk.", verifyIn: "Q0.4", risk: "Unequal quantization makes the comparison unfair." },
    { id: "A3", text: "Qwen 9B runs with partial CPU offload on this laptop; Qwen 4B fits mostly on the GPU.", verifyIn: "Q0.5", risk: "Latency comparison is hardware-bound, not model-bound." },
    { id: "A4", text: "Thinking mode can be disabled per request through the Ollama API.", verifyIn: "Q1.8", risk: "Reasoning text pollutes answers; latency inflated." },
    { id: "A5", text: "Both models handle EN, DE and RO adequately for short cited answers.", verifyIn: "Q2.5", risk: "One language fails; per-language policy needed." },
    { id: "A6", text: "Lexical matching plus a critical-term guard is enough for a reliable v1 matcher (no embeddings).", verifyIn: "Q4.5", risk: "Low hit rate on paraphrases; embeddings needed sooner." },
    { id: "A7", text: "Serving answers only in the question's language is acceptable for v1.", verifyIn: "Q4.7", risk: "Duplicate review effort per language." },
    { id: "A8", text: "The latest RCK stores tickets/cases in SQLite with an explicit approval status.", verifyIn: "Q7.1", risk: "Adapter design changes." },
    { id: "A9", text: "Ticket edits are detectable (update timestamp or content), enabling staleness checks.", verifyIn: "Q7.2", risk: "Stale answers cannot be detected automatically." },
    { id: "A10", text: "A future company GPU server will expose an Ollama or OpenAI-compatible HTTP API.", verifyIn: "Q8.1", risk: "A new client adapter is needed." },
    { id: "A11", text: "Synthetic questions approximate real user questions well enough for model selection.", verifyIn: "Q9.6", risk: "Model choice revisited after real-question evaluation." }
  ];
})();

# RCK AI Assistant: Roadmap

_Generated from Questline on 2026-10-26. Source of truth: questline/data/*.js plus your saved progress._

## Mission
Give RCK engineers fast, cited answers from approved engineering knowledge, serving reviewed answers from a database first and calling a local model only when needed.

## Final objective
A retrieval-first assistant integrated into the latest RCK release, backed by a reviewed answer database and the benchmark-selected Qwen model deployed on an approved company GPU server.

## Immediate priority
Phase 0 audit, then local Qwen 4B vs 9B benchmarking (Phases 1–2). Answer database schema work (Q3.1) may run in parallel.

## Progress
2/61 quests done, 4% of estimated effort (6/135.25 h).

| Phase | Done | Effort % |
|---|---|---|
| P0 Project audit | 0/5 | 0% |
| P1 Benchmark preparation | 2/11 | 21% |
| P2 Qwen benchmarking | 0/6 | 0% |
| P3 Answer database | 0/8 | 0% |
| P4 Retrieval-first assistant | 0/7 | 0% |
| P5 Safety & evaluation | 0/4 | 0% |
| P6 Standalone demo | 0/4 | 0% |
| P7 RCK integration | 0/5 | 0% |
| P8 GPU deployment preparation | 0/5 | 0% |
| P9 Production hardening | 0/6 | 0% |

## Critical path (remaining)
Q0.1 → Q1.3 → Q1.4 → Q1.5 → Q1.10 → Q2.1 → Q2.3 → Q2.4 → Q2.5 → Q2.6 → Q3.5 → Q3.6 → Q3.8 → Q5.4 → Q6.4 → Q7.4 → Q9.4 → Q9.6 (40 h)

## Next available quests
- Q0.1 Repository and workspace audit (P0, 1.5 h)

## Milestones
- M1 Audit complete: 0/4
- M2 Benchmark harness ready: 0/3
- M3 Model selected on evidence: 0/1
- M4 Validated answer database v1: 0/1
- M5 Retrieval-first assistant passes safety suite: 0/2
- M6 Standalone demo ready: 0/1
- M7 Integrated into latest RCK: 0/1 (external dependency)
- M8 Running on approved GPU server: 0/1 (external dependency)
- M9 Production-ready release: 0/1

## External dependencies
- E1 Explicit approval to download Qwen models (~10 GB, free): blocks Q0.5; owner: You
- E2 Named answer reviewer (you act as reviewer until assigned): blocks Q3.8; owner: You / team lead
- E3 Access to the latest RCK source on the company PC: blocks Q7.1; owner: You (company PC)
- E4 Company approval, budget and data clearance for a GPU server: blocks Q8.4; owner: Company / client
- E5 Client validation before any use of the company AI platform — out of current scope: blocks nothing yet; owner: Client

## Risks
- R1 [high] Qwen 9B does not fit in 4 GB VRAM: Record the CPU/GPU split per run; judge accuracy locally, re-measure latency on the GPU server (Q8.5).
- R2 [high] Cache serves a similar but different question: Critical-term guard + threshold calibrated to zero false matches on a labelled near-miss set (Q4.2, Q4.5).
- R3 [medium] Synthetic data overstates quality: Treat results as relative (4B vs 9B); re-evaluate on authorized real questions after P7.
- R4 [medium] Stored answers go stale after ticket edits: Store cited ticket hashes; mark entries stale on change or un-approval (Q3.3, Q9.2).
- R5 [medium] Latest RCK JSON layout and auth unknown: Integration only through adapters, designed after the read-only audit of the latest source and its shared JSON folder (Q7.1).
- R9 [medium] Databases on a network share: Keep answers.db on local disk of the machine that runs the assistant; read RCK JSON read-only with retry on parse errors (Q7.2, Q7.3).
- R6 [low] Disk space (17 GB free): Check before download; removing llama3.1:8b (4.9 GB) only with your approval (Q0.5).
- R7 [medium] Qwen thinking mode breaks output contract or latency: Benchmark with thinking disabled; validate the flag in Q1.8; optional thinking-on run documented separately.
- R8 [low] Limited Claude Code usage: Small quests with explicit file scope and a mandatory stop after completion.

## Confirmed facts
- F1: Ollama 0.40.9 is installed (0.40.11 available). (source: ollama --version)
- F2: Installed models: llama3.2:3b, llama3.1:8b, all-minilm. No Qwen model is installed. (source: ollama list)
- F3: GPU: NVIDIA GeForce RTX 2050 with 4096 MiB VRAM. (source: nvidia-smi)
- F4: 17 GB free on drive C:. (source: Get-PSDrive C)
- F5: Node 24.18.0 and Python 3.14.4 are available. (source: node --version / python --version)
- F6: Synthetic corpus: 40 tickets (34 approved, 6 not), 30 EN / 10 DE; 20 eval questions (14 answerable, 6 not; EN 11 / DE 5 / RO 4). Validator passes. (source: validate_dataset.py)
- F7: 8/8 search tests pass. Retrieval top-5: same-language 8/8, cross-language 5/6 (Q11 missed); unapproved tickets never returned. (source: pytest, eval_retrieval.py)
- F8: The local RCK copy (C:\Users\benkr\Projects\RBC) has 52 passing tests and is NOT the latest company version. (source: pytest; user statement)
- F9 (reported): Reported by you, not verified here: the latest RCK on the company PC includes Engineering Cases and 73 + 50 tests. (source: user statement)
- F10 (reported): Reported in an earlier session, re-verify in Q0.2: Ryzen 7 7435HS CPU, ~24 GB RAM. (source: earlier session)
- F11 (reported): Reported by you, not verified here: the latest RCK stores its data as JSON files in a shared network folder (not SQLite). (source: user statement)

## Assumptions to verify
- A1 [unverified] "Qwen 4B / 9B" means the Qwen3.5 4B and 9B models, available in Ollama as qwen3.5:4b and qwen3.5:9b. (verify in Q0.4)
- A2 [unverified] Both models are benchmarked at the same quantization (Q4_K_M), about 3.4 GB and 6.6 GB on disk. (verify in Q0.4)
- A3 [unverified] Qwen 9B runs with partial CPU offload on this laptop; Qwen 4B fits mostly on the GPU. (verify in Q0.5)
- A4 [unverified] Thinking mode can be disabled per request through the Ollama API. (verify in Q1.8)
- A5 [unverified] Both models handle EN, DE and RO adequately for short cited answers. (verify in Q2.5)
- A6 [unverified] Lexical matching plus a critical-term guard is enough for a reliable v1 matcher (no embeddings). (verify in Q4.5)
- A7 [unverified] Serving answers only in the question's language is acceptable for v1. (verify in Q4.7)
- A8 [unverified] Each RCK ticket/case in the shared JSON folder carries an explicit approval status field (replaces the earlier SQLite assumption, see F11). (verify in Q7.1)
- A9 [unverified] Ticket edits are detectable from the JSON files (an update field, file modified time, or content hash), enabling staleness checks. (verify in Q7.2)
- A10 [unverified] A future company GPU server will expose an Ollama or OpenAI-compatible HTTP API. (verify in Q8.1)
- A11 [unverified] Synthetic questions approximate real user questions well enough for model selection. (verify in Q9.6)

## Unresolved decisions
- AI-ADR-02 Candidate models: Qwen 4B versus Qwen 9B: Exact model generation and Ollama tags (assumed qwen3.5:4b / qwen3.5:9b).; Quantization available for both (assumed Q4_K_M).; License terms acceptable for company use.
- AI-ADR-03 Model evaluation methodology: Also run with thinking on as a separate configuration?; Final question count: 20 or 40?
- AI-ADR-05 Answer database architecture: Which machine runs the assistant and holds answers.db, given RCK's data lives in JSON on a network share?; How validated answers reach other machines (export, or a single assistant host).
- AI-ADR-06 Retrieval-first answering versus model inference: The default fallback policy for production (model vs queue).
- AI-ADR-07 Matching strategy and confidence thresholds: How the score is normalized (BM25 rank, token overlap, or both).; The threshold value (from Q4.5).; Whether multilingual embeddings are needed (decided by the measured miss rate).
- AI-ADR-10 Standalone demo: The audience and the date of the demo.
- AI-ADR-11 RCK integration: The JSON folder layout, file naming and ticket/case fields, including the approval field.; How RCK writes the files (atomic replace or in-place) and whether several clients write concurrently.; The auth and role model.; Which machine runs the assistant and holds answers.db.; How ticket updates are tracked (update field or file modified time).
- AI-ADR-12 GPU deployment: The provider and region.; The billing rules (hourly, idle, minimum).; The VRAM and concurrency targets.; Whether the endpoint is Ollama or vLLM.
- AI-ADR-13 Security and access control: The RCK role model (from Q7.1).
- AI-ADR-14 Logging, monitoring and privacy: The company retention policy for user questions.
- AI-ADR-16 Feedback and answer lifecycle management: Who the reviewers are and the review SLA.
- AI-ADR-17 Deployment and rollback: The company change-management requirements.
- AI-ADR-18 Future scaling and optimization: The trigger thresholds are confirmed after the first system evaluation (Q5.4).

## ADR registry
| ID | Title | Status |
|---|---|---|
| AI-ADR-01 | Local-first development | accepted |
| AI-ADR-02 | Candidate models: Qwen 4B versus Qwen 9B | proposed |
| AI-ADR-03 | Model evaluation methodology | proposed |
| AI-ADR-04 | Approved knowledge and evidence handling | accepted |
| AI-ADR-05 | Answer database architecture | proposed |
| AI-ADR-06 | Retrieval-first answering versus model inference | proposed |
| AI-ADR-07 | Matching strategy and confidence thresholds | proposed |
| AI-ADR-08 | Citation validation and abstention | accepted |
| AI-ADR-09 | Modular model-client architecture | accepted |
| AI-ADR-10 | Standalone demo | proposed |
| AI-ADR-11 | RCK integration | proposed |
| AI-ADR-12 | GPU deployment | proposed |
| AI-ADR-13 | Security and access control | proposed |
| AI-ADR-14 | Logging, monitoring and privacy | proposed |
| AI-ADR-15 | Testing and quality assurance | accepted |
| AI-ADR-16 | Feedback and answer lifecycle management | proposed |
| AI-ADR-17 | Deployment and rollback | proposed |
| AI-ADR-18 | Future scaling and optimization | proposed |

## P0: Project audit
Verify existing work, machine resources, runtime and candidate models.

### Q0.1 Repository and workspace audit
Status: Ready · Priority P0 · 1.5 h · AI Architect · Wave 0
Depends on: none · ADRs: AI-ADR-01, AI-ADR-15

**Objective:** Produce audit/AUDIT.md listing every existing file and its purpose, the exact test and validator results, the D2 retrieval numbers re-measured, and the components still missing.

**Acceptance:**
- audit/AUDIT.md exists with the inventory, exact command outputs and the gap list
- No existing file in rck-assistant or RBC was modified
- Any discrepancy from Questline's Facts is listed

### Q0.2 Machine resource baseline
Status: Waiting on deps · Priority P1 · 0.75 h · ML Engineer · Wave 1
Depends on: Q0.1 · ADRs: AI-ADR-01, AI-ADR-03

**Objective:** Create tools/hw_snapshot.py, which writes audit/hardware.json: CPU model and core count, total and free RAM, GPU name, VRAM and driver, free disk, OS build, and Python/Node/Ollama versions.

**Acceptance:**
- hardware.json is produced
- The unit test passes
- F10 (CPU and RAM) is confirmed or corrected in the Facts view

### Q0.3 Local model runtime verification
Status: Waiting on deps · Priority P0 · 0.75 h · ML Engineer · Wave 1
Depends on: Q0.1 · ADRs: AI-ADR-01, AI-ADR-09, AI-ADR-13

**Objective:** Record in audit/runtime.md:
- The Ollama version and the API reachable at 127.0.0.1:11434.
- The listening address (localhost only).
- The installed models.
- One timed /api/chat call to llama3.2:3b with a synthetic question, showing load_duration, prompt_eval_duration and eval_duration.

**Acceptance:**
- runtime.md contains all four outputs
- The localhost-only binding is confirmed or flagged

### Q0.4 Identify the exact Qwen 4B and 9B models (no download)
Status: Waiting on deps · Priority P0 · 0.75 h · ML Engineer · Wave 1
Depends on: Q0.1 · ADRs: AI-ADR-02, AI-ADR-03

**Objective:** Write audit/models.md with, for the Qwen 4B and 9B candidates:
- The Ollama tag.
- The parameter count and quantization.
- The download size and context length.
- Thinking-mode support.
- The license.

Confirm or correct assumptions A1 and A2.

**Acceptance:**
- models.md lists the exact tags, quantization, sizes and license
- A1 and A2 are marked confirmed or refuted in the Assumptions view

### Q0.5 Download the Qwen models (approval gate)
Status: Waiting on deps · Priority P0 · 1 h · ML Engineer · Wave 2
Depends on: Q0.2, Q0.3, Q0.4 · ADRs: AI-ADR-01, AI-ADR-02 · External: E1: your explicit approval to download about 10 GB

**Objective:** Both Qwen models installed. Their digests, sizes, load times and CPU/GPU split are recorded in audit/models.md, and each one has answered one synthetic question.

**Acceptance:**
- Both models answer
- Digests and processor splits recorded
- Disk space after the download recorded


## P1: Benchmark preparation
Dataset, gold answers, scoring, prompt, checks, model client and runner.

### Q1.1 Synthetic ticket corpus and evaluation questions (legacy D1)
Status: Done · Priority P0 · 3 h · ML Engineer · Wave 0
Depends on: none · ADRs: AI-ADR-03, AI-ADR-04

**Objective:** A synthetic knowledge base and question set covering the same-language, cross-language, near-miss, unapproved-trap and out-of-scope categories.

**Acceptance:**
- Approved by you (D1)

### Q1.2 Approved-only ticket source and FTS5 retrieval (legacy D2)
Status: Done · Priority P0 · 3 h · Software Engineer · Wave 1
Depends on: Q1.1 · ADRs: AI-ADR-04, AI-ADR-07

**Objective:** Retrieve the right approved tickets for a question, measurably, and never return unapproved ones.

**Acceptance:**
- At least 7/8 same-language questions in the top 5 (achieved 8/8)
- Unapproved tickets never returned

### Q1.3 Extend the benchmark dataset to 40 questions
Status: Waiting on deps · Priority P1 · 3 h · ML Engineer · Wave 1
Depends on: Q0.1, Q1.1 · ADRs: AI-ADR-03

**Objective:** Add Q21–Q40 to eval/questions.jsonl so the totals are at least 12 per language (EN/DE/RO), at least 12 unanswerable, at least 6 near-miss, at least 4 multi-ticket questions and at least 4 paraphrases of existing questions. Every new question passes the validator.

**Acceptance:**
- The counts meet the minimums
- VALID
- Existing tests still pass

### Q1.4 Gold answers and expected citations review
Status: Waiting on deps · Priority P1 · 2 h · QA Engineer · Wave 2
Depends on: Q1.3 · ADRs: AI-ADR-03, AI-ADR-08

**Objective:** For every answerable question:
- gold_ticket_ids is not empty.
- Every key_facts item occurs literally in a gold ticket.
- answer_check holds 1–4 translation-stable facts (codes, numbers, names).
- expected_answer is written in the question's language.

For every unanswerable question, expected_answer is exactly 'Not enough information.'

**Acceptance:**
- The validator enforces the literal-fact rule
- gold_review.md is signed off in this quest's notes

### Q1.5 Scoring rules and automatic grader
Status: Waiting on deps · Priority P0 · 3 h · QA Engineer · Wave 3
Depends on: Q1.4 · ADRs: AI-ADR-03, AI-ADR-08, AI-ADR-15

**Objective:** assistant/grading.py with these functions:
- parse_citations
- is_exact_abstention
- fact_coverage (normalized answer_check matching)
- detect_language (EN/DE/RO stopword heuristic, standard library)
- grade(answer, question, sent_ids)

grade returns a dict: abstained, abstain_correct, citations, unsent_citations, gold_cited, facts_hit/total, lang_ok, auto_score.

**Acceptance:**
- At least 15 tests pass
- Unsent citations are always detected
- Only the exact string counts as an abstention

### Q1.6 Prompt builder and output contract
Status: Waiting on deps · Priority P0 · 2 h · AI Architect · Wave 2
Depends on: Q0.1, Q1.2 · ADRs: AI-ADR-08, AI-ADR-13

**Objective:** assistant/prompt.py:
- PROMPT_VERSION.
- build_messages(question, tickets, lang), returning a system and a user message.
- Each ticket is wrapped in <ticket id="T-…"> … </ticket>.
- The rules: answer only from the tickets, cite as [T-####], answer in the question's language, otherwise reply exactly 'Not enough information.'
- A token-budget guard that truncates ticket bodies, never IDs.

**Acceptance:**
- The tests pass
- PROMPT_VERSION is set
- No unapproved ticket can enter (uses the source output only)

### Q1.7 Citation validator and abstention enforcement
Status: Waiting on deps · Priority P0 · 2 h · Security Engineer · Wave 3
Depends on: Q1.6 · ADRs: AI-ADR-08, AI-ADR-13

**Objective:** assistant/checks.py:
- validate_answer(text, sent_ids, question_lang) returns a Verdict with ok, final_text, citations, reasons[].
- Any unsent citation, a non-abstaining answer without citations, or the wrong language turns the answer into 'Not enough information.' and records the reason.
- Abstention variants are normalized.

**Acceptance:**
- An unsent citation is never in final_text
- The reason codes are documented

### Q1.8 Model client layer and configuration
Status: Waiting on deps · Priority P0 · 3 h · Software Engineer · Wave 2
Depends on: Q0.3 · ADRs: AI-ADR-09, AI-ADR-01, AI-ADR-13

**Objective:** assistant/llm.py:
- A ModelClient protocol and a Result dataclass: text, model, digest, load_ms, prompt_ms, gen_ms, total_ms, tokens_in, tokens_out.
- OllamaClient (/api/chat, stream=false, options: temperature, seed, num_ctx; think=false).
- OpenAICompatClient (/v1/chat/completions).
- FakeLLM (is_test_double = True).

assistant/config.py loads config.toml with tomllib and refuses a non-localhost base_url unless allow_remote = true.

**Acceptance:**
- Unit tests pass without Ollama
- A remote URL is refused by default
- Timings are populated from the Ollama counters

### Q1.9 Frozen retrieval context
Status: Waiting on deps · Priority P1 · 1 h · ML Engineer · Wave 2
Depends on: Q1.2, Q1.3 · ADRs: AI-ADR-03

**Objective:** tools/freeze_context.py writes eval/frozen_context.json: {corpus_sha256, tokenizer, k, questions: {Qxx: [ticket ids]}}.

**Acceptance:**
- The rerun is identical
- A hash mismatch is detected

### Q1.10 Benchmark runner
Status: Waiting on deps · Priority P0 · 4 h · ML Engineer · Wave 4
Depends on: Q1.5, Q1.7, Q1.8, Q1.9 · ADRs: AI-ADR-03, AI-ADR-09

**Objective:** bench/run_benchmark.py --models A,B --repeats 3 --out results/benchmark/<run_id>. For every model × question × repeat it:
- builds the prompt from the frozen context;
- calls the model;
- validates with checks.py;
- grades with grading.py;
- appends one JSON line.

bench/summarize.py aggregates the results. FakeLLM is refused unless --dry-run is given, and dry-run output is labelled DRY-RUN.

**Acceptance:**
- The tests pass
- DRY-RUN labelling is enforced
- The settings and hardware are embedded

### Q1.11 Resource sampler
Status: Waiting on deps · Priority P1 · 2 h · ML Engineer · Wave 2
Depends on: Q0.2 · ADRs: AI-ADR-03

**Objective:** bench/resources.py: a background sampler (every 0.5 s) that records:
- the GPU memory used and utilization (nvidia-smi --query-gpu);
- the Ollama runner process working set and CPU% (PowerShell Get-Process, or psutil if already installed);
- the `ollama ps` processor split at the start and end.

It writes resources.jsonl and exposes peak and mean values for summary.json.

**Acceptance:**
- The tests pass
- Fail-soft behaviour verified


## P2: Qwen benchmarking
Measure Qwen 4B and 9B under identical conditions and select one on evidence.

### Q2.1 Benchmark harness dry run
Status: Waiting on deps · Priority P0 · 1 h · QA Engineer · Wave 5
Depends on: Q1.10, Q1.11 · ADRs: AI-ADR-03, AI-ADR-09

**Objective:** A FakeLLM dry run (DRY-RUN labelled) and a 3-question live run with llama3.2:3b both produce complete artefacts, with resources sampled.

**Acceptance:**
- Both pilots complete
- Every summary field is populated
- Pilot results are clearly labelled as non-evidence

### Q2.2 Benchmark Qwen 4B
Status: Waiting on deps · Priority P0 · 1.5 h · ML Engineer · Wave 6
Depends on: Q2.1, Q0.5 · ADRs: AI-ADR-02, AI-ADR-03

**Objective:** results/benchmark/<date>-qwen4b/ with all questions × 3 repeats, resources sampled, no harness errors.

**Acceptance:**
- Row count = questions × 3
- Error rate recorded
- Results saved

### Q2.3 Benchmark Qwen 9B
Status: Waiting on deps · Priority P0 · 2.5 h · ML Engineer · Wave 6
Depends on: Q2.1, Q0.5 · ADRs: AI-ADR-02, AI-ADR-03

**Objective:** results/benchmark/<date>-qwen9b/ under identical settings, with the CPU/GPU split recorded.

**Acceptance:**
- Settings identical to Q2.2
- Row count = questions × 3
- Results saved

### Q2.4 Blind manual grading
Status: Waiting on deps · Priority P1 · 2 h · QA Engineer · Wave 7
Depends on: Q2.2, Q2.3 · ADRs: AI-ADR-03

**Objective:** bench/blind_sheet.py creates results/benchmark/blind/sheet.csv: repeat 1 answers from both models, shuffled, with the model replaced by a code. You grade 0 (wrong), 1 (partial) or 2 (correct and complete). bench/merge_grades.py un-blinds the grades and adds them to both summaries.

**Acceptance:**
- Every row graded
- The key file was not opened before grading (noted)

### Q2.5 Model comparison report
Status: Waiting on deps · Priority P0 · 1.5 h · ML Engineer · Wave 8
Depends on: Q2.4 · ADRs: AI-ADR-02, AI-ADR-03

**Objective:** results/benchmark/COMPARISON.md with:
- A gate table: unsent citations, abstention.
- Accuracy: auto score, facts, gold cited, manual grade.
- Results per category and per language.
- Consistency.
- Latency p50/p95, tokens/s and load time.
- Resources: peak RAM and VRAM, CPU/GPU split.
- 3 failure examples per model.
- The caveats (R1, R3).

**Acceptance:**
- Every metric from AI-ADR-03 is present
- The decision rule outcome is stated

### Q2.6 Model selection decision
Status: Waiting on deps · Priority P0 · 0.5 h · AI Architect · Wave 9
Depends on: Q2.5 · ADRs: AI-ADR-02

**Objective:** AI-ADR-02 set to accepted with the tag, digest, quantization and reason. config.toml's default model is set to the selected tag.

**Acceptance:**
- AI-ADR-02 accepted with the digest
- The config is updated


## P3: Answer database
Schema, lifecycle, candidate generation, pre-validation and human review.

### Q3.1 Answer database schema and repository layer
Status: Waiting on deps · Priority P0 · 3 h · Database Architect · Wave 1
Depends on: Q0.1 · ADRs: AI-ADR-05

**Objective:** assistant/answers_db.py:
- open_db(path) applies migrations (schema_version), with WAL and foreign keys on.
- Tables: qa_entry, qa_variant (+ an FTS5 table), qa_source, qa_review_event, match_log.
- Dataclasses and CRUD functions: add_entry, add_variant, get_entry, list_entries(status), log_match.

**Acceptance:**
- Every field required by the brief is stored: question, answer, model name and digest, response time, metadata, validation status
- The tests pass

### Q3.2 Answer lifecycle state machine and audit trail
Status: Waiting on deps · Priority P0 · 2 h · Database Architect · Wave 2
Depends on: Q3.1 · ADRs: AI-ADR-16, AI-ADR-05

**Objective:** assistant/lifecycle.py:
- A TRANSITIONS table (pending→validated|rejected; validated→stale|flagged|retired; stale|flagged→pending; rejected→pending).
- transition(entry_id, to, actor, note), which writes qa_review_event.
- servable(entry), which is true only for validated entries.
- validated requires a non-empty actor.

**Acceptance:**
- The illegal-transition tests pass
- Audit events are written

### Q3.3 Ticket hashing and staleness invalidation
Status: Waiting on deps · Priority P1 · 2 h · Database Architect · Wave 2
Depends on: Q3.1, Q1.2 · ADRs: AI-ADR-04, AI-ADR-16

**Objective:** ticket_hash(ticket) is the SHA-256 of the normalized title and fields. sweep_stale(db, approved_tickets) marks a validated entry stale when a cited ticket is missing or unapproved, or its hash differs. It returns the counts.

**Acceptance:**
- Every case is tested
- Sweep counts reported

### Q3.4 Collection question set
Status: Waiting on deps · Priority P1 · 2 h · ML Engineer · Wave 2
Depends on: Q1.3 · ADRs: AI-ADR-05, AI-ADR-07

**Objective:** eval/collection_questions.jsonl with at least 60 synthetic questions (EN/DE/RO) covering every approved ticket at least once. Fields: id, lang, question, intended_ticket_ids, critical_terms. A validator is added to validate_dataset.py.

**Acceptance:**
- Every approved ticket is covered
- VALID

### Q3.5 Candidate answer generation run
Status: Waiting on deps · Priority P0 · 2 h · ML Engineer · Wave 10
Depends on: Q2.6, Q3.2, Q3.3, Q3.4, Q1.7 · ADRs: AI-ADR-05, AI-ADR-06, AI-ADR-08

**Objective:** tools/collect_answers.py runs, for every question: retrieve → prompt → model → checks. It inserts a pending qa_entry with the model name and digest, prompt_version, params, timings, tokens, cited tickets and their hashes, plus a canonical qa_variant. A snapshot of answers.db is taken first.

**Acceptance:**
- Every question has an entry or a recorded error
- All metadata fields are filled
- Nothing is stored as validated

### Q3.6 Automatic pre-validation flags
Status: Waiting on deps · Priority P1 · 2 h · QA Engineer · Wave 11
Depends on: Q3.5, Q1.5 · ADRs: AI-ADR-08, AI-ADR-16

**Objective:** assistant/prevalidate.py stores flags per entry:
- citations_valid.
- unsupported_tokens: codes, numbers and versions in the answer that do not appear in any cited ticket.
- lang_ok.
- abstained.
- critical_terms_present.

**Acceptance:**
- The tests pass
- Every pending entry has flags

### Q3.7 Review CLI
Status: Waiting on deps · Priority P0 · 3 h · Software Engineer · Wave 3
Depends on: Q3.2 · ADRs: AI-ADR-16, AI-ADR-13

**Objective:** tools/review.py commands:
- list [--status]
- show <id>: question, answer, flags, and the cited ticket text side by side
- approve <id> --reviewer
- reject <id> --reviewer --note
- edit <id> --reviewer: edits the answer, keeps the original in the event log
- add-variant <id> "text"
- next: the first pending entry, with the flags shown first

**Acceptance:**
- Every command works
- Edits keep the original in the audit trail

### Q3.8 First review pass
Status: Waiting on deps · Priority P0 · 2 h · QA Engineer · Wave 12
Depends on: Q3.6, Q3.7 · ADRs: AI-ADR-16 · External: E2: a named reviewer (you, until one is assigned)

**Objective:** Every pending entry is validated, rejected or edited. results/review/REVIEW_1.md records the counts, the main rejection reasons, the review time per entry, and how the flags correlated with rejections.

**Acceptance:**
- 0 pending entries
- REVIEW_1.md written


## P4: Retrieval-first assistant
Exact + keyword matching with critical-term guard, thresholds and fallback.

### Q4.1 Question normalizer and exact match
Status: Waiting on deps · Priority P0 · 2 h · Software Engineer · Wave 2
Depends on: Q3.1 · ADRs: AI-ADR-07

**Objective:** assistant/matching.py:
- normalize(text): NFKC, casefold, collapse whitespace, strip punctuation except inside codes and versions (VAL-217, 2.3.1).
- exact_match(db, question, lang) returns only a servable entry.

**Acceptance:**
- The tests pass
- Codes survive normalization

### Q4.2 Critical-term extractor and guard
Status: Waiting on deps · Priority P0 · 3 h · Security Engineer · Wave 3
Depends on: Q4.1 · ADRs: AI-ADR-07

**Objective:** extract_critical(text, vocab) returns sets of error codes, versions, numbers, application names (vocabulary from ticket applications) and negations (EN/DE/RO). guard(q, candidate) is true only if every set is equal.

**Acceptance:**
- Every swap category is rejected
- No false veto on identical questions

### Q4.3 Keyword candidate retrieval over stored questions
Status: Waiting on deps · Priority P1 · 2 h · Software Engineer · Wave 3
Depends on: Q4.1 · ADRs: AI-ADR-07

**Objective:** candidates(db, question, lang, k=5) returns the BM25 matches over the qa_variant FTS (reusing search.build_query) plus a normalized similarity in [0, 1] (token overlap on normalized text). The formula is documented.

**Acceptance:**
- The tests pass
- The formula is documented

### Q4.4 Labelled match set (paraphrases and near-misses)
Status: Waiting on deps · Priority P0 · 3 h · QA Engineer · Wave 3
Depends on: Q3.4 · ADRs: AI-ADR-07, AI-ADR-15

**Objective:** eval/match_pairs.jsonl with at least 120 pairs (stored question, user question, should_match, category, lang):
- At least 60 paraphrases.
- At least 60 near-misses: code swap, version swap, application swap, negation, different action on the same topic.
- All three languages.
- A deterministic 70/30 calibration/holdout split field.

**Acceptance:**
- The counts are met
- VALID
- The split is fixed

### Q4.5 Threshold calibration and matching evaluation
Status: Waiting on deps · Priority P0 · 2 h · ML Engineer · Wave 4
Depends on: Q4.2, Q4.3, Q4.4 · ADRs: AI-ADR-07

**Objective:** tools/eval_matching.py:
- Sweeps thresholds on the calibration split.
- Picks the highest-hit-rate threshold with 0 false matches.
- Reports precision, recall and false matches per category on the holdout.
- Writes results/matching/MATCHING.md and sets [matching].threshold in the config.

**Acceptance:**
- 0 false matches on the holdout
- The hit rate is reported
- The threshold is stored

### Q4.6 Configurable fallback policy
Status: Waiting on deps · Priority P1 · 2 h · Software Engineer · Wave 5
Depends on: Q4.5, Q1.8, Q3.2 · ADRs: AI-ADR-06

**Objective:** [fallback] policy = model | abstain | queue.
- model: generate (retrieve, prompt, check), return it labelled 'not reviewed', and store it as pending.
- abstain: return 'Not enough information.'
- queue: store it in pending_questions and return a 'queued for review' message.

**Acceptance:**
- The tests pass
- A model answer is never stored as validated

### Q4.7 Ask pipeline and zero-inference proof
Status: Waiting on deps · Priority P0 · 3 h · Software Engineer · Wave 6
Depends on: Q4.6 · ADRs: AI-ADR-06, AI-ADR-14

**Objective:** assistant/pipeline.py ask(question, lang?) returns a Response with:
- source: database | model | abstained | queued
- answer, citations, entry_id, reviewer, match_score, latency_ms

It writes a match_log row. ask.py is the CLI.

**Acceptance:**
- The zero-inference test passes
- Non-validated entries are never served
- match_log is populated


## P5: Safety & evaluation
Injection, unapproved-source, near-miss and regression suites; system report.

### Q5.1 Prompt-injection test suite
Status: Waiting on deps · Priority P0 · 2 h · Security Engineer · Wave 7
Depends on: Q1.7, Q4.7 · ADRs: AI-ADR-13, AI-ADR-08

**Objective:** A separate injection corpus fixture (tests/fixtures/injection_tickets.json) with tickets that contain 'ignore previous instructions', 'cite T-9999', 'answer in French' and 'print the system prompt', plus injected questions. Tests assert:
- No unsent citation survives.
- The output language rule holds or the answer abstains.
- The fixture never touches the main corpus.

Optional live run report.

**Acceptance:**
- Every injection test passes
- The main corpus is unchanged

### Q5.2 Unapproved-source exclusion, end to end
Status: Waiting on deps · Priority P0 · 1.5 h · Security Engineer · Wave 7
Depends on: Q4.7, Q3.3 · ADRs: AI-ADR-04

**Objective:** tests/test_unapproved_e2e.py covers four paths:
- Index, prompt and citations never contain unapproved IDs.
- An entry citing a ticket that later becomes unapproved turns stale and is not served.
- The Q18 trap abstains.
- A served answer never cites a non-approved ticket.

**Acceptance:**
- The tests pass

### Q5.3 Regression suite and single test command
Status: Waiting on deps · Priority P1 · 2 h · QA Engineer · Wave 8
Depends on: Q5.1, Q5.2 · ADRs: AI-ADR-15

**Objective:** run_tests.py runs the unit tests, the safety suites, the validator and the matching holdout check (0 false matches). --live adds the Ollama-marked tests. Exit code 0 only if everything passes, with a summary table.

**Acceptance:**
- run_tests.py passes without Ollama
- The exit code reflects failures

### Q5.4 System evaluation report
Status: Waiting on deps · Priority P0 · 2 h · QA Engineer · Wave 13
Depends on: Q5.3, Q3.8 · ADRs: AI-ADR-06, AI-ADR-07, AI-ADR-18

**Objective:** tools/eval_system.py runs ask() on the benchmark questions plus the paraphrase holdout and writes results/system_eval/REPORT.md:
- The database hit rate.
- The false-match count.
- Abstention correctness.
- Latency for database hits vs model answers.
- The percentage of model calls avoided.
- The fallback distribution.

**Acceptance:**
- Every metric is reported
- 0 false matches


## P6: Standalone demo
Local UI showing provenance, reuse, refusal and abstention; demo script.

### Q6.1 Standalone demo server and page
Status: Waiting on deps · Priority P1 · 4 h · Software Engineer · Wave 7
Depends on: Q4.7 · ADRs: AI-ADR-10, AI-ADR-13

**Objective:** demo/server.py: FastAPI bound to 127.0.0.1:8765 with POST /api/ask (calls pipeline.ask), GET /api/ticket/{id} (approved only) and a static page demo/static/index.html with a question box and an answer panel.

**Acceptance:**
- The tests pass
- Bound to localhost only
- No external network requests (check DevTools)

### Q6.2 Answer provenance display
Status: Waiting on deps · Priority P1 · 2 h · Software Engineer · Wave 8
Depends on: Q6.1 · ADRs: AI-ADR-10, AI-ADR-06

**Objective:** Badges: 'Validated answer: database', with the reviewer, date and match score; 'Generated: not reviewed', with the model and digest; 'Not enough information'; 'Queued'. Citations open the ticket text. The response time is shown in ms.

**Acceptance:**
- Every state is demonstrated with screenshots

### Q6.3 Demo dataset and reset
Status: Waiting on deps · Priority P2 · 1 h · Software Engineer · Wave 13
Depends on: Q3.8 · ADRs: AI-ADR-10, AI-ADR-17

**Objective:** demo/seed_demo.py copies the validated entries into demo/demo_answers.db (snapshot) and can reset it in one command.

**Acceptance:**
- Reset restores the exact counts

### Q6.4 Demo script and dry run
Status: Waiting on deps · Priority P1 · 2 h · QA Engineer · Wave 14
Depends on: Q6.2, Q6.3, Q5.4 · ADRs: AI-ADR-10

**Objective:** docs/DEMO_SCRIPT.md, step by step:
1. A known question answered from the database (ms).
2. A paraphrase answered from the database.
3. A near-miss (VAL-271) refused by the guard.
4. An unanswerable question abstains.
5. The unapproved trap.
6. A new question goes to the model fallback and is stored as pending.
7. It is approved in the review CLI.
8. The same question is now served from the database.

One dry run with the timings recorded.

**Acceptance:**
- Every step passes in the dry run
- Timings recorded


## P7: RCK integration
Audit the latest RCK source and integrate through adapters, behind RCK auth.

### Q7.1 Audit the latest RCK source (read-only)
Status: Waiting on deps · Priority P1 · 3 h · AI Architect · Wave 1
Depends on: Q0.1 · ADRs: AI-ADR-11, AI-ADR-13 · External: E3: access to the latest RCK source on the company PC

**Objective:** RCK_AUDIT.md, kept on the company PC; only the structure-level summary is shared. It records:
- The project structure.
- **The shared JSON folder:** its path pattern, folder layout and file naming (one file per ticket/case, or collections).
- **The JSON fields** of tickets/cases, quoted verbatim from the code that reads and writes them (no real file contents).
- The approval states and the field that holds them.
- **How RCK writes the files:** atomic replace or in-place, locking, who writes concurrently.
- How ticket updates are tracked (an update field, modified time).
- The auth and roles, and how the api.py bridge works.
- The baseline test results (73 + 50).

**Acceptance:**
- Every AI-ADR-11 open question is answered or marked unknown
- No company data is in the summary

### Q7.2 Integration design (accept AI-ADR-11)
Status: Waiting on deps · Priority P1 · 2 h · AI Architect · Wave 7
Depends on: Q7.1, Q4.7 · ADRs: AI-ADR-11, AI-ADR-05, AI-ADR-13

**Objective:** docs/INTEGRATION_DESIGN.md:
- The field mapping from RCK JSON to Ticket.
- The approval mapping.
- **Read-only access** to the shared JSON folder, with retry on partial or locked files.
- The API contract: ask, review and ticket endpoints.
- The role checks.
- **Where answers.db lives:** local disk of the machine running the assistant, never the network share (R9).
- The feature flag.
- The test plan.

AI-ADR-11 is set to accepted.

**Acceptance:**
- Every mapping references the audit
- AI-ADR-11 accepted

### Q7.3 RckTicketSource adapter (shared JSON folder)
Status: Waiting on deps · Priority P1 · 3 h · Software Engineer · Wave 8
Depends on: Q7.2 · ADRs: AI-ADR-04, AI-ADR-11

**Objective:** assistant/sources_rck.py: RckTicketSource(folder).load_approved_tickets() reads the RCK JSON files **read-only**, keeps approved tickets only, and maps the audited fields to Ticket. It retries a file that fails to parse (it may be mid-write) and reports files it cannot read. It is tested against a temporary folder of synthetic JSON files that follow the audited layout.

**Acceptance:**
- The tests pass
- No unapproved tickets returned
- The RCK folder is never written to

### Q7.4 Assistant API inside the RCK server
Status: Waiting on deps · Priority P1 · 4 h · Software Engineer · Wave 15
Depends on: Q7.3, Q6.4 · ADRs: AI-ADR-11, AI-ADR-13, AI-ADR-17

**Objective:** An assistant router in the RCK server. Ask requires a valid session; approve, reject and edit require the reviewer role; a feature flag (default off) controls it. The existing RCK suites still pass, and the new tests pass.

**Acceptance:**
- The existing suites pass
- Unauthorized approval is rejected
- Flag off means no behaviour change

### Q7.5 Assistant panel in the RCK client
Status: Waiting on deps · Priority P1 · 4 h · Software Engineer · Wave 16
Depends on: Q7.4 · ADRs: AI-ADR-11, AI-ADR-10

**Objective:** An assistant panel in the RCK UI (pywebview) that calls the server through api.py (CSP connect-src 'none' respected), showing the same provenance badges as the demo, plus a reviewer view.

**Acceptance:**
- Every state works
- The suites pass
- No CSP changes


## P8: GPU deployment preparation
Requirements, verified costs, runbook; provision only with explicit approval.

### Q8.1 GPU infrastructure requirements
Status: Waiting on deps · Priority P2 · 2 h · Cloud Engineer · Wave 10
Depends on: Q2.6 · ADRs: AI-ADR-12

**Objective:** deploy/GPU_REQUIREMENTS.md:
- The VRAM needed for the selected model plus its context.
- The concurrency target and expected throughput.
- The OS and runtime (Ollama or vLLM).
- Network isolation, auth in front of the endpoint, and monitoring.
- The data classification.

**Acceptance:**
- Every number traces to measured data

### Q8.2 Cost model and billing verification (no provisioning)
Status: Waiting on deps · Priority P2 · 2 h · Cloud Engineer · Wave 11
Depends on: Q8.1 · ADRs: AI-ADR-12

**Objective:** deploy/COST_MODEL.md: candidate options with their verified billing rules (per-second or per-hour, idle billing, minimums, storage, egress), the monthly estimate at the target usage, the shutdown policy, and the savings from database hits (using the Q5.4 hit rate).

**Acceptance:**
- Every price is cited with a date
- The shutdown policy is defined

### Q8.3 Deployment configuration and runbook
Status: Waiting on deps · Priority P2 · 2 h · Cloud Engineer · Wave 11
Depends on: Q8.1, Q1.8 · ADRs: AI-ADR-12, AI-ADR-09, AI-ADR-17

**Objective:** config profiles (local, gpu-server); tools/healthcheck.py (endpoint reachable, model digest matches, one canary question passes the checks); deploy/RUNBOOK.md (switch, verify, roll back to local, stop the instance).

**Acceptance:**
- The health check passes locally
- The rollback steps are tested locally

### Q8.4 Provision and deploy (approval gate)
Status: Waiting on deps · Priority P2 · 3 h · Cloud Engineer · Wave 12
Depends on: Q8.2, Q8.3 · ADRs: AI-ADR-12 · External: E4: explicit written approval, budget and data clearance

**Objective:** The selected model (same digest) is running on the approved server and the health check passes there. The cost tracking and shutdown policy are active.

**Acceptance:**
- Health check passes
- Billing visible
- Shutdown policy active

### Q8.5 Re-benchmark on the GPU server
Status: Waiting on deps · Priority P2 · 2 h · ML Engineer · Wave 13
Depends on: Q8.4 · ADRs: AI-ADR-12, AI-ADR-03

**Objective:** The same benchmark (same settings and digest) runs against the server. results/benchmark/<date>-server/ and a parity section in COMPARISON.md: accuracy within ±1 question, plus the latency p50/p95.

**Acceptance:**
- Accuracy within tolerance
- Latency recorded


## P9: Production hardening
Feedback, freshness, monitoring, load, backup/rollback and release docs.

### Q9.1 User feedback workflow
Status: Waiting on deps · Priority P2 · 3 h · Software Engineer · Wave 9
Depends on: Q6.2, Q3.2 · ADRs: AI-ADR-16

**Objective:** A qa_feedback table (migration) and POST /api/feedback. 'Wrong' feedback on a database answer moves the entry from validated to flagged (no longer served) and adds it to the review queue. The review CLI gains a 'flagged' view.

**Acceptance:**
- Flagged answers are never served
- Audit trail written

### Q9.2 Freshness sweep on the RCK source
Status: Waiting on deps · Priority P2 · 2 h · Database Architect · Wave 9
Depends on: Q3.3, Q7.3 · ADRs: AI-ADR-16, AI-ADR-04

**Objective:** A sweep at server startup and on a schedule (configurable interval) using RckTicketSource, reporting the stale counts and queueing regeneration. File modified times skip unchanged JSON files; content hashes decide staleness.

**Acceptance:**
- Edited tickets make their entries stale within one interval

### Q9.3 Monitoring and privacy-safe logging
Status: Waiting on deps · Priority P2 · 3 h · Security Engineer · Wave 7
Depends on: Q4.7 · ADRs: AI-ADR-14, AI-ADR-18

**Objective:** tools/metrics.py reports from match_log: the hit rate, fallback rate, abstention rate, p50/p95 latency by source, and the top unmatched questions. purge(retention_days) is driven by the config.

**Acceptance:**
- The tests pass
- No external sinks

### Q9.4 Load and reliability testing
Status: Waiting on deps · Priority P2 · 3 h · QA Engineer · Wave 16
Depends on: Q7.4 · ADRs: AI-ADR-15

**Objective:** tools/loadtest.py: N concurrent asks (default 10) against the integrated endpoint. Measured: p95 latency, error rate, SQLite lock errors, behaviour on a model timeout (a graceful fallback message). Results go to results/load/LOAD.md.

**Acceptance:**
- 0 crashes
- Timeouts handled gracefully
- Limits documented

### Q9.5 Backup, recovery and rollback drill
Status: Waiting on deps · Priority P2 · 2 h · Database Architect · Wave 16
Depends on: Q9.3, Q7.4 · ADRs: AI-ADR-17

**Objective:** tools/backup.py (snapshot with retention) plus a documented drill:
1. Snapshot.
2. Corrupt or delete the database.
3. Restore.
4. Verify the counts and that the pipeline answers.
5. Roll the config back to the previous model and prompt version.
6. Feature flag off and on.

**Acceptance:**
- The drill succeeds
- Timings recorded

### Q9.6 Release documentation and sign-off
Status: Waiting on deps · Priority P2 · 2 h · AI Architect · Wave 17
Depends on: Q9.1, Q9.2, Q9.4, Q9.5, Q8.5 · ADRs: AI-ADR-15, AI-ADR-17

**Objective:** Release notes, an operations guide, a reviewer guide, known limitations, the final evaluation on authorized real questions (confirms A11), and a sign-off checklist in which every ADR is accepted or explicitly deferred.

**Acceptance:**
- Every gate passes
- Every proposed ADR is resolved or deferred with a reason


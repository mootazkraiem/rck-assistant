/* Architecture Decision Records for the RCK AI Assistant.
   IDs use the AI-ADR prefix so they never collide with the RCK application's ADR-01..ADR-10.
   status: proposed | accepted | superseded | rejected.
   Proposed ADRs list openQuestions: the information needed to resolve them. */
(function () {
  const R = (window.RCK = window.RCK || {});
  R.adrs = [
    {
      id: "AI-ADR-01", title: "Local-first development", status: "accepted",
      context: "No external LLM API is approved for development (the company AI platform waits on client validation), no GPU server exists yet, and paid infrastructure needs explicit approval. Waiting would stall the project for an unknown period.",
      decision: "All development, benchmarking and evaluation run on the local machine. The model runtime is Ollama bound to 127.0.0.1. Only synthetic or explicitly authorized data is used. No external LLM calls and no paid services without explicit approval.",
      alternatives: [
        ["Wait for the company GPU server", "Blocks all progress on an external timeline."],
        ["Rent a cloud GPU now", "Costs money, needs approval, and raises data-handling questions."],
        ["Use the company AI platform or another external LLM API", "Not approved; real data must not leave company systems."]
      ],
      reasons: ["Zero cost and zero approval latency.", "Data never leaves the machine.", "The architecture stays portable: switching to a server is a configuration change (AI-ADR-09, AI-ADR-12)."],
      consequences: ["Laptop latency is not representative of a GPU server.", "Model size is limited by about 24 GB RAM and 4 GB VRAM.", "Results must be re-validated on the target server later."],
      security: "No network egress for inference. Ollama must listen on localhost only (checked in Q0.3).",
      performance: "Inference is slower, especially for 9B with CPU offload. Cost: none.",
      dependencies: ["Ollama runtime installed locally"],
      related: ["AI-ADR-02", "AI-ADR-09", "AI-ADR-12"],
      quests: ["Q0.3", "Q0.5", "Q1.8"],
      acceptance: ["Config validation rejects non-localhost model endpoints unless explicitly allowed.", "Every quest states its cost; the total cost so far is 0."],
      history: [["2026-10", "Initial plan: Ollama llama3.1:8b demo, company AI platform later."], ["2026-10-25", "Accepted at the project meeting: local Qwen benchmarking, no waiting for a GPU."]]
    },
    {
      id: "AI-ADR-02", title: "Candidate models: Qwen 4B versus Qwen 9B", status: "proposed",
      context: "We need one local model that answers accurately, cites correctly and abstains when appropriate, within laptop limits now and a GPU server later.",
      decision: "Benchmark exactly two candidates, Qwen 4B and Qwen 9B, under the AI-ADR-03 methodology, and select one with the decision rule. The selection is recorded here with the exact tag and digest.",
      alternatives: [
        ["llama3.1:8b (already installed)", "Not a Qwen candidate; it was the previous demo plan. Can be a reference later if needed."],
        ["Models larger than 9B", "Do not run acceptably on this hardware."],
        ["Pick a model without benchmarking", "No evidence; it violates the decision process."]
      ],
      reasons: ["The two sizes bracket the quality and latency trade-off.", "Both are small enough to run locally.", "Qwen models are multilingual (EN/DE/RO needed)."],
      consequences: ["Both models must be downloaded (~10 GB).", "The 9B latency measured locally is pessimistic."],
      security: "Weights come from the Ollama library. Record the digest and license before use.",
      performance: "4B: faster, lower memory. 9B: likely more accurate, slower on 4 GB VRAM. Cost: free download.",
      dependencies: ["AI-ADR-03 methodology", "Q0.4 tag verification", "Q0.5 download approval"],
      related: ["AI-ADR-01", "AI-ADR-03", "AI-ADR-12"],
      quests: ["Q0.4", "Q0.5", "Q2.2", "Q2.3", "Q2.5", "Q2.6"],
      acceptance: ["The comparison report exists with all metrics for both models.", "The decision rule is applied as written.", "This ADR is accepted with the chosen tag, digest and quantization."],
      openQuestions: ["Exact model generation and Ollama tags (assumed qwen3.5:4b / qwen3.5:9b).", "Quantization available for both (assumed Q4_K_M).", "License terms acceptable for company use."],
      history: [["2026-10-25", "Proposed: candidates set by the project meeting; the decision waits on benchmark evidence."]]
    },
    {
      id: "AI-ADR-03", title: "Model evaluation methodology", status: "proposed",
      context: "A fair comparison requires identical inputs and settings, metrics that reflect our requirements (citations, abstention, languages), and results that can be reproduced.",
      decision: "The settings are:\n- Frozen retrieval: identical top-5 tickets per question.\n- One prompt version.\n- Same quantization for both models.\n- temperature 0, fixed seed, num_ctx 8192, thinking off.\n- One warm-up call excluded from timing.\n- 3 repeats per question.\n\nThe measurements are:\n- Automatic grading: facts, citations, abstention, language.\n- Blind manual grading on a 0–2 scale.\n- Ollama timing counters and sampled resource use.\n\nDecision rule:\n1. Gate: zero citations of unsent tickets and at least 5 of 6 correct abstentions.\n2. Then accuracy.\n3. Then p95 latency.\n4. Within 1 question of each other, the smaller model wins.",
      alternatives: [
        ["An LLM-as-judge", "A local judge is biased and weak; an external judge is not allowed. A blind human grade is used instead."],
        ["A single run per question", "Cannot measure consistency."],
        ["Public benchmarks", "Not relevant to RCK tickets, citations or abstention."]
      ],
      reasons: ["Removes retrieval noise from the model comparison.", "Measures the behaviours the product depends on.", "The raw data is saved, so the conclusions can be audited."],
      consequences: ["20 to 40 questions detect only large differences.", "Manual grading costs reviewer time (about 1–2 h)."],
      security: "Synthetic data only. Results are stored locally.",
      performance: "About 120–240 local calls per model run. Cost: none.",
      dependencies: ["Q1.3 dataset", "Q1.5 grader", "Q1.9 frozen context"],
      related: ["AI-ADR-02", "AI-ADR-08", "AI-ADR-15"],
      quests: ["Q1.3", "Q1.4", "Q1.5", "Q1.9", "Q1.10", "Q1.11", "Q2.4", "Q2.5"],
      acceptance: ["The settings are recorded in every run's summary.json.", "Rerunning on the same machine reproduces the automatic scores (temperature 0, seed fixed)."],
      openQuestions: ["Also run with thinking on as a separate configuration?", "Final question count: 20 or 40?"],
      history: [["2026-10-25", "Proposed in the revised roadmap."]]
    },
    {
      id: "AI-ADR-04", title: "Approved knowledge and evidence handling", status: "accepted",
      context: "Only approved tickets are trustworthy. Answers must be grounded in evidence that was actually provided to the model.",
      decision: "The ticket source layer returns approved tickets only. Nothing unapproved reaches the index, the prompt, the citations or the answer database. Every ticket is sent with its ID. The content hash of each cited ticket is stored with the answer.",
      alternatives: [
        ["Filter at query time", "The filter can be bypassed by any new query path."],
        ["Include review-stage tickets with a warning", "Spreads unverified knowledge."]
      ],
      reasons: ["A single enforcement point is easy to test.", "Already implemented in sources.py and tested."],
      consequences: ["Newly approved tickets need an index rebuild.", "Un-approval must invalidate stored answers (AI-ADR-16)."],
      security: "This is the core control against unverified or rejected content. Synthetic data until authorized.",
      performance: "Negligible.",
      dependencies: ["The ticket source adapter (JSON now, RCK later)"],
      related: ["AI-ADR-05", "AI-ADR-08", "AI-ADR-11", "AI-ADR-16"],
      quests: ["Q1.2", "Q3.3", "Q5.2", "Q7.3"],
      acceptance: ["Tests prove unapproved tickets are never indexed, prompted, cited or served."],
      history: [["2026-10", "Implemented in assistant/sources.py (D2)."], ["2026-10-25", "Kept as accepted."]]
    },
    {
      id: "AI-ADR-05", title: "Answer database architecture", status: "proposed",
      context: "Generated answers must be stored with full provenance, reviewed before use, and reused without calling the model.",
      decision: "A separate SQLite database (answers.db, WAL mode, foreign keys on) with these tables:\n- qa_entry: the answer, its status and provenance.\n- qa_variant: question phrasings, with an FTS5 index.\n- qa_source: cited tickets and their hashes.\n- qa_review_event: the audit trail.\n- match_log: every ask.\n\nThe schema is versioned through a schema_version table.",
      alternatives: [
        ["Tables inside the RCK database", "The latest schema is unknown; coupling it now is premature."],
        ["A vector database", "Unnecessary complexity for v1 (AI-ADR-07)."],
        ["JSON files", "No transactions or constraints, and weak concurrency."]
      ],
      reasons: ["SQLite is already the RCK stack.", "No new service to run.", "Easy to snapshot and roll back (AI-ADR-17)."],
      consequences: ["Migration into RCK may be decided later (AI-ADR-11)."],
      security: "Stored locally. When integrated, only reviewers can change status.",
      performance: "Lookups in milliseconds for thousands of entries.",
      dependencies: [],
      related: ["AI-ADR-06", "AI-ADR-07", "AI-ADR-16", "AI-ADR-17"],
      quests: ["Q3.1", "Q3.2", "Q3.3", "Q3.5", "Q3.7"],
      acceptance: ["The schema is created by migration and covered by tests.", "Every required field is stored: question, answer, model name and digest, response time, metadata, validation status."],
      openQuestions: ["Final home after integration: a separate file, or tables in the RCK database?"],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-06", title: "Retrieval-first answering versus model inference", status: "proposed",
      context: "Many questions repeat. Calling the model every time wastes time and, on a paid server later, money.",
      decision: "The pipeline is:\n1. Look for a reliable match against validated stored answers.\n2. On a hit, serve the stored answer with no model call.\n3. Otherwise, apply the configured fallback policy (model / abstain / queue).\n\nAnswers generated by the model are labelled 'not reviewed' and stored as pending.",
      alternatives: [
        ["Always generate (classic retrieval plus generation)", "Highest latency and cost; answers are never reviewed."],
        ["A cache keyed on the exact question string only", "Very low hit rate."],
        ["Automatically serve unreviewed cached answers", "Unsafe: it skips review."]
      ],
      reasons: ["Reviewed answers are both faster and safer.", "Inference is reserved for genuinely new questions."],
      consequences: ["The quality of served answers depends on review throughput.", "Freshness must be managed (AI-ADR-16)."],
      security: "Only validated entries are servable; this is enforced in code and tests.",
      performance: "A database hit costs milliseconds and no inference.",
      dependencies: ["AI-ADR-05", "AI-ADR-07"],
      related: ["AI-ADR-05", "AI-ADR-07", "AI-ADR-18"],
      quests: ["Q4.6", "Q4.7", "Q5.4"],
      acceptance: ["A test with a model client that raises on use proves a hit makes no inference call.", "Pending, rejected or stale entries are never served."],
      openQuestions: ["The default fallback policy for production (model vs queue)."],
      history: [["2026-10-25", "Proposed at the project meeting."]]
    },
    {
      id: "AI-ADR-07", title: "Matching strategy and confidence thresholds", status: "proposed",
      context: "Similar wording does not mean the same intent. 'VAL-217 after upgrade' and 'VAL-271 after upgrade' look alike but need different answers.",
      decision: "Matching runs in order:\n1. Normalize the question (NFKC, casefold, whitespace and punctuation), keeping codes intact, and try an exact match.\n2. Otherwise, take FTS5/BM25 candidates over qa_variant (top 5, same language).\n3. Apply a hard critical-term guard: error codes, versions, numbers, application names and negations must be identical.\n4. Apply a similarity threshold, calibrated so the near-miss calibration and holdout sets have zero false matches.\n\nEmbeddings are deferred.",
      alternatives: [
        ["Embedding similarity only", "Treats near-misses as the same; harder to explain. The only local embedding model is English-only."],
        ["Exact match only", "Safe but too few hits."],
        ["LLM-based intent judgement", "Needs inference on every ask, which defeats the purpose."]
      ],
      reasons: ["Measurable and explainable.", "Reuses the existing FTS5 code.", "The guard targets the known failure mode directly."],
      consequences: ["Paraphrases that use different words may miss; they fall back safely.", "Reviewers can add phrasings to raise the hit rate."],
      security: "The primary metric is false matches, which must be 0. A missed match is an acceptable failure; a false match is not.",
      performance: "Sub-millisecond to a few milliseconds per ask.",
      dependencies: ["AI-ADR-05"],
      related: ["AI-ADR-06", "AI-ADR-15", "AI-ADR-18"],
      quests: ["Q4.1", "Q4.2", "Q4.3", "Q4.4", "Q4.5"],
      acceptance: ["0 false matches on the near-miss holdout set.", "The paraphrase hit rate is reported.", "The threshold is stored in config, together with the calibration report."],
      openQuestions: ["How the score is normalized (BM25 rank, token overlap, or both).", "The threshold value (from Q4.5).", "Whether multilingual embeddings are needed (decided by the measured miss rate)."],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-08", title: "Citation validation and abstention", status: "accepted",
      context: "These are product requirements: cite tickets as [T-1042]; never cite a source that was not sent; return exactly 'Not enough information.' when evidence is insufficient; answer in EN, DE or RO.",
      decision: "The model output is post-validated:\n- Parse the [T-####] citations.\n- If any citation is not in the sent set, replace the answer with the abstention string.\n- An answer that is not an abstention must have at least one valid citation.\n- Abstention variants are normalized to exactly 'Not enough information.'\n- The answer language must match the question language (EN/DE/RO).",
      alternatives: [
        ["Trust the prompt instructions alone", "Small models do not follow instructions reliably."],
        ["Strip invalid citations but keep the text", "The text may rely on the invented source."]
      ],
      reasons: ["Deterministic, testable enforcement.", "It fails closed."],
      consequences: ["Some correct answers with formatting slips become abstentions; this is measured in the benchmark."],
      security: "It mitigates hallucinated sources and prompt injection that tries to plant citations.",
      performance: "Negligible.",
      dependencies: [],
      related: ["AI-ADR-03", "AI-ADR-04", "AI-ADR-13"],
      quests: ["Q1.6", "Q1.7", "Q5.1"],
      acceptance: ["Unit tests cover unsent citations, missing citations, abstention variants and language mismatch."],
      history: [["2026-10", "Requirements set."], ["2026-10-25", "Accepted."]]
    },
    {
      id: "AI-ADR-09", title: "Modular model-client architecture", status: "accepted",
      context: "The model will move from the laptop to a GPU server. The provider, URL, model and credentials must be configurable without rebuilding.",
      decision: "A ModelClient interface: generate(messages, params) returns text, timings, token counts and model id/digest. The implementations are:\n- OllamaClient, using the native /api/chat for timings and the think flag.\n- OpenAICompatClient, for a future server.\n- FakeLLM, for unit tests only. It is flagged as a test double, and the benchmark refuses it.\n\nConfiguration lives in config.toml; secrets are read from environment variables.",
      alternatives: [
        ["LangChain or a similar framework", "Heavy dependencies for a small need."],
        ["Calling the HTTP API directly everywhere", "No single place to switch providers."]
      ],
      reasons: ["A provider switch is a configuration change.", "Tests run without Ollama."],
      consequences: ["Two client implementations to maintain."],
      security: "Non-localhost endpoints are refused unless allow_remote = true is set deliberately. No keys in files.",
      performance: "Negligible overhead.",
      dependencies: [],
      related: ["AI-ADR-01", "AI-ADR-12", "AI-ADR-15"],
      quests: ["Q1.8", "Q8.3"],
      acceptance: ["The same code runs against FakeLLM, Ollama and a local OpenAI-compatible stub.", "The benchmark runner refuses FakeLLM except in a labelled dry run."],
      history: [["2026-10", "Required: configurable provider and URL."], ["2026-10-25", "Accepted."]]
    },
    {
      id: "AI-ADR-10", title: "Standalone demo", status: "proposed",
      context: "Stakeholders need to see reuse, provenance and safe refusal before RCK integration. The local RCK copy is outdated.",
      decision: "A small local web app (FastAPI on 127.0.0.1 plus one static page), separate from RCK. It shows the answer source (database / model / abstained), citations, reviewer, response time and model. This replaces the earlier plan to demo inside the local RCK copy.",
      alternatives: [
        ["Demo inside the outdated local RCK copy", "Misrepresents the real product; the integration work would be thrown away."],
        ["A command-line demo only", "Less clear for non-engineers."]
      ],
      reasons: ["Independent of RCK version uncertainty.", "Reuses the same pipeline that will be integrated later."],
      consequences: ["Some UI work is repeated during RCK integration."],
      security: "Localhost only, synthetic data.",
      performance: "N/A. Cost: none.",
      dependencies: ["AI-ADR-06"],
      related: ["AI-ADR-06", "AI-ADR-11"],
      quests: ["Q6.1", "Q6.2", "Q6.3", "Q6.4"],
      acceptance: ["The demo script runs end to end: database hit, paraphrase hit, near-miss refusal, abstention, fallback then approval then reuse."],
      openQuestions: ["The audience and the date of the demo."],
      history: [["2026-10", "Earlier D6: demo inside the local RCK copy."], ["2026-10-25", "Proposed: standalone demo instead."]]
    },
    {
      id: "AI-ADR-11", title: "RCK integration", status: "proposed",
      context: "The latest RCK (Engineering Cases, 73 + 50 tests) is on the company PC and has not been inspected. Table names, columns, auth and approval flows must not be invented.",
      decision: "Direction:\n- Integrate through adapters: an RckTicketSource, an assistant service module, and an API router behind RCK session auth.\n- The client goes through the existing api.py bridge (CSP connect-src 'none').\n- The concrete design is decided only after the read-only audit (Q7.1).",
      alternatives: [
        ["Design against the local RCK copy", "Outdated; high risk of rework."],
        ["Fork the assistant into RCK now", "Couples unfinished work to an unknown codebase."]
      ],
      reasons: ["Keeps the assistant modular and testable.", "Avoids assumptions."],
      consequences: ["Integration starts only when the source is available."],
      security: "The assistant inherits RCK auth and roles; only reviewers approve answers.",
      performance: "TBD after the audit.",
      dependencies: ["External: latest RCK source (E3)"],
      related: ["AI-ADR-04", "AI-ADR-05", "AI-ADR-13"],
      quests: ["Q7.1", "Q7.2", "Q7.3", "Q7.4", "Q7.5"],
      acceptance: ["The existing RCK test suites still pass.", "New integration tests pass.", "No company data is copied off the company PC."],
      openQuestions: ["The ticket/case schema and the approval field.", "The auth and role model.", "Where answers.db lives.", "How ticket updates are tracked.", "The deployment model of the RCK server."],
      history: [["2026-10-25", "Proposed; blocked on access to the latest source."]]
    },
    {
      id: "AI-ADR-12", title: "GPU deployment", status: "proposed",
      context: "Production inference should run on a company-approved GPU server. Its provider, cost and timing are unknown.",
      decision: "Direction:\n- Deploy the selected model, with the same digest and quantization, behind an Ollama or OpenAI-compatible endpoint inside the company network.\n- Switching is a configuration change.\n- Nothing is provisioned without explicit approval and verified billing rules.\n- No instance is left running unused.",
      alternatives: [
        ["Rent cloud GPUs now", "Unapproved cost and data handling."],
        ["Stay on the laptop permanently", "Cannot serve many users."]
      ],
      reasons: ["Local development continues independently.", "The benchmark results carry over."],
      consequences: ["Latency must be re-measured on the server (Q8.5)."],
      security: "Requires data-classification approval before any real data reaches the server.",
      performance: "Expected large latency gains. Cost: to be verified in Q8.2 before approval.",
      dependencies: ["External: company approval and budget (E4)", "AI-ADR-02 accepted"],
      related: ["AI-ADR-01", "AI-ADR-09", "AI-ADR-17"],
      quests: ["Q8.1", "Q8.2", "Q8.3", "Q8.4", "Q8.5"],
      acceptance: ["The server benchmark accuracy is within tolerance of the local results.", "The runbook rollback has been tested."],
      openQuestions: ["The provider and region.", "The billing rules (hourly, idle, minimum).", "The VRAM and concurrency targets.", "Whether the endpoint is Ollama or vLLM."],
      history: [["2026-10-25", "Proposed; the GPU is not a prerequisite for local work."]]
    },
    {
      id: "AI-ADR-13", title: "Security and access control", status: "proposed",
      context: "The assistant handles engineering knowledge and must resist prompt injection and unauthorized answer changes.",
      decision: "The controls are:\n- The model runtime is bound to localhost.\n- Tickets are inserted as delimited data, never as instructions.\n- Output validation follows AI-ADR-08.\n- Integrated endpoints require an RCK session.\n- Approve, reject and edit require the reviewer role.\n- No secrets in the repository; configuration secrets come from environment variables.\n- Inputs are length-limited and FTS queries are quoted.",
      alternatives: [
        ["Rely on network isolation only", "Does not cover injection or insider misuse."]
      ],
      reasons: ["Defense in depth with testable controls."],
      consequences: ["A reviewer role must exist in RCK (verified in Q7.1)."],
      security: "This record defines the security baseline.",
      performance: "Negligible.",
      dependencies: ["AI-ADR-11 for the auth details"],
      related: ["AI-ADR-04", "AI-ADR-08", "AI-ADR-14"],
      quests: ["Q1.6", "Q1.8", "Q5.1", "Q7.4"],
      acceptance: ["The injection suite passes.", "Unauthorized approval attempts are rejected in the integration tests."],
      openQuestions: ["The RCK role model (from Q7.1)."],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-14", title: "Logging, monitoring and privacy", status: "proposed",
      context: "We need hit-rate, fallback and latency metrics without leaking questions or sending logs to external services.",
      decision: "match_log stores asks locally (question, language, best match, score, decision, latency) with a configurable retention period (default 90 days, then purged). Metrics are computed locally: hit rate, false-match reports, fallback rate, abstention rate and p95 latency. Nothing is sent to external sinks. Prompts and answers are logged only in benchmark runs on synthetic data.",
      alternatives: [
        ["An external APM or log service", "Data would leave the company and add cost."],
        ["No logging", "The optimization goal could not be measured."]
      ],
      reasons: ["Measuring is required to prove the inference savings."],
      consequences: ["Retention must follow company policy once real data is used."],
      security: "Question text may be sensitive: local storage, access-restricted, purged.",
      performance: "One insert per ask.",
      dependencies: ["AI-ADR-05"],
      related: ["AI-ADR-05", "AI-ADR-13", "AI-ADR-18"],
      quests: ["Q4.7", "Q9.3"],
      acceptance: ["A purge test proves retention works.", "The metrics report is generated from match_log."],
      openQuestions: ["The company retention policy for user questions."],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-15", title: "Testing and quality assurance", status: "accepted",
      context: "Small, reviewable steps, with tests run after each change.",
      decision: "The testing rules are:\n- pytest unit tests per module, deterministic through FakeLLM.\n- Live tests are marked @pytest.mark.ollama and skipped when the runtime is unreachable.\n- Benchmarks and evaluations are separate from the tests.\n- A single run_tests.py.\n- Regression suites: near-miss, injection, unapproved-source, citation.\n- Every quest reports exact commands and results.",
      alternatives: [
        ["Manual testing only", "Not repeatable."],
        ["Tests that require Ollama", "Fragile and slow."]
      ],
      reasons: ["Fast feedback, reproducible results."],
      consequences: ["FakeLLM must never be mistaken for benchmark evidence (AI-ADR-09)."],
      security: "The safety suites are gates before the demo and before integration.",
      performance: "The unit suite runs in seconds.",
      dependencies: [],
      related: ["AI-ADR-03", "AI-ADR-08", "AI-ADR-09"],
      quests: ["Q1.5", "Q5.1", "Q5.2", "Q5.3"],
      acceptance: ["python run_tests.py passes from a clean checkout without Ollama."],
      history: [["2026-10", "Practice in place since D1/D2."], ["2026-10-25", "Accepted."]]
    },
    {
      id: "AI-ADR-16", title: "Feedback and answer lifecycle management", status: "proposed",
      context: "Generated answers are not trusted by default, and validated answers can become wrong when tickets change.",
      decision: "The answer states and transitions are:\n- New answers start as pending.\n- A pending answer becomes validated or rejected, by a reviewer.\n- A validated answer becomes stale automatically when a source changes or loses approval.\n- A validated answer becomes flagged on negative user feedback.\n- A validated answer becomes retired manually.\n- A stale or flagged answer becomes pending on regeneration or re-review.\n\nOnly validated answers are served. Every transition is written to qa_review_event (who, when, from, to, note).",
      alternatives: [
        ["Validate once, forever", "Answers drift from the tickets."],
        ["Automatic approval above a score", "Contradicts 'do not blindly trust'."]
      ],
      reasons: ["Explicit, auditable trust."],
      consequences: ["A reviewer workload; tooling must make review fast (Q3.7)."],
      security: "Approval is a privileged action (AI-ADR-13).",
      performance: "N/A.",
      dependencies: ["AI-ADR-05"],
      related: ["AI-ADR-04", "AI-ADR-05", "AI-ADR-06"],
      quests: ["Q3.2", "Q3.3", "Q3.7", "Q9.1", "Q9.2"],
      acceptance: ["Tests show illegal transitions are rejected.", "Stale and flagged answers are never served."],
      openQuestions: ["Who the reviewers are and the review SLA."],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-17", title: "Deployment and rollback", status: "proposed",
      context: "Model, prompt and answer data changes must be reversible.",
      decision: "The rules are:\n- The model digest and prompt_version are pinned in config.\n- answers.db is snapshotted with the SQLite backup API before every bulk import or migration.\n- Rollback means reverting the config and restoring the snapshot.\n- When integrated, a feature flag disables the assistant without a redeploy.",
      alternatives: [
        ["Roll back by redeploying", "Slow, and it loses answer data."]
      ],
      reasons: ["Fast, low-risk recovery."],
      consequences: ["The snapshots need disk space and a retention rule."],
      security: "The snapshots contain the answers; protect them like the database.",
      performance: "A snapshot takes seconds.",
      dependencies: ["AI-ADR-05", "AI-ADR-09"],
      related: ["AI-ADR-05", "AI-ADR-12"],
      quests: ["Q8.3", "Q9.5"],
      acceptance: ["The restore drill succeeds and is documented."],
      openQuestions: ["The company change-management requirements."],
      history: [["2026-10-25", "Proposed."]]
    },
    {
      id: "AI-ADR-18", title: "Future scaling and optimization", status: "proposed",
      context: "Several improvements are valuable but premature without measurements.",
      decision: "Each improvement is deferred until its measured trigger:\n- Multilingual embeddings: paraphrase miss rate above 30% (Q4.5).\n- Cross-language answer reuse: duplicated review effort is significant.\n- Query rewriting: cross-language retrieval misses persist.\n- PDF ingestion and feedback tickets: after integration.\n- Pre-computing answers for frequent fallback questions.\n- Company AI platform: only after client validation.",
      alternatives: [
        ["Build them all now", "Complexity without evidence."]
      ],
      reasons: ["Keeps v1 small and measurable."],
      consequences: ["The roadmap is revisited after Q5.4 and Q9.3."],
      security: "Every new component needs its own security review.",
      performance: "N/A.",
      dependencies: ["Metrics from AI-ADR-14"],
      related: ["AI-ADR-06", "AI-ADR-07", "AI-ADR-14"],
      quests: ["Q5.4", "Q9.3"],
      acceptance: ["Each deferred item has a measurable trigger recorded here."],
      openQuestions: ["The trigger thresholds are confirmed after the first system evaluation (Q5.4)."],
      history: [["2026-10-25", "Proposed."]]
    }
  ];
})();

/* Engineering documentation. status: implemented | partial | planned.
   html is trusted, author-written content (rendered as-is). */
(function () {
  const R = (window.RCK = window.RCK || {});
  R.docs = [
    {
      id: "architecture", title: "System architecture", status: "partial",
      html: `
<p>The assistant is a set of small Python modules, independent of RCK, combined by one pipeline. Adapters isolate everything that will change: the ticket source, the model provider and the UI.</p>
<pre class="diagram">
 Ticket source ──► Search index ──► Prompt builder ──► ModelClient ──► Checks
 (JSON | RCK)      (FTS5/BM25)      (versioned)       (Ollama|OpenAI)  (citations,
   approved only                                       FakeLLM=tests     abstention)
        │                                                                   │
        ▼                                                                   ▼
   Ticket hashes ◄──────────────── Answer database (answers.db) ◄──── pending answers
                                    qa_entry · qa_variant · qa_source
                                    qa_review_event · match_log
                                          ▲            │
                       Review CLI ────────┘            ▼
                    (approve/reject/edit)      Matcher (exact → FTS5 → guard → threshold)
                                                       │
                                     ask() ◄───────────┘──► fallback (model | abstain | queue)
</pre>
<table><tr><th>Component</th><th>Module</th><th>State</th></tr>
<tr><td>Ticket source (approved only)</td><td>assistant/sources.py</td><td><span class="pill s-implemented">implemented</span></td></tr>
<tr><td>Keyword search</td><td>assistant/search.py</td><td><span class="pill s-implemented">implemented</span></td></tr>
<tr><td>Prompt, checks, grading</td><td>assistant/prompt.py, checks.py, grading.py</td><td><span class="pill s-planned">planned</span> Q1.5–Q1.7</td></tr>
<tr><td>Model clients and config</td><td>assistant/llm.py, config.py</td><td><span class="pill s-planned">planned</span> Q1.8</td></tr>
<tr><td>Benchmark</td><td>bench/</td><td><span class="pill s-planned">planned</span> Q1.10–Q2.5</td></tr>
<tr><td>Answer database and lifecycle</td><td>assistant/answers_db.py, lifecycle.py</td><td><span class="pill s-planned">planned</span> Q3.1–Q3.3</td></tr>
<tr><td>Matcher, fallback, pipeline</td><td>assistant/matching.py, fallback.py, pipeline.py</td><td><span class="pill s-planned">planned</span> P4</td></tr>
<tr><td>Demo</td><td>demo/</td><td><span class="pill s-planned">planned</span> P6</td></tr></table>`
    },
    {
      id: "dataflow", title: "Data flow", status: "planned",
      html: `
<h4>Ask (runtime)</h4>
<ol><li>Normalize the question and detect its language (EN/DE/RO).</li>
<li><b>Exact match</b> against validated variants in the same language → serve, with no model call.</li>
<li><b>Candidates</b>: FTS5 top-5 over the variants → <b>critical-term guard</b> → <b>threshold</b>. If it passes, serve with no model call.</li>
<li>Otherwise apply the <b>fallback policy</b>:
  <ul><li>model: retrieve tickets → prompt → model → checks → return as "not reviewed" and store as pending.</li>
  <li>abstain: return "Not enough information."</li>
  <li>queue: record the question for a reviewer.</li></ul></li>
<li>Write a <code>match_log</code> row (decision, score, latency).</li></ol>
<h4>Collect (offline)</h4>
<p>Collection questions → selected model → checks → <code>pending</code> entries with provenance → pre-validation flags → human review → <code>validated</code> or <code>rejected</code>.</p>
<h4>Freshness</h4>
<p>Ticket changes or un-approval → hash mismatch → entry becomes <code>stale</code> → no longer served → regenerate → pending again.</p>`
    },
    {
      id: "benchmark", title: "Model benchmark methodology", status: "planned",
      html: `
<table><tr><th>Control</th><th>Setting</th></tr>
<tr><td>Questions</td><td>eval/questions.jsonl (20 now, 40 after Q1.3), synthetic</td></tr>
<tr><td>Evidence</td><td>Frozen top-5 per question (eval/frozen_context.json), identical for both models</td></tr>
<tr><td>Prompt</td><td>One PROMPT_VERSION</td></tr>
<tr><td>Model settings</td><td>Same quantization (Q4_K_M assumed), temperature 0, fixed seed, num_ctx 8192, think=false</td></tr>
<tr><td>Repeats</td><td>3 per question; 1 warm-up call excluded</td></tr>
<tr><td>Grading</td><td>Automatic (grading.py) plus blind manual 0–2</td></tr>
<tr><td>Resources</td><td>Sampled every 0.5 s: VRAM, runner RAM, CPU%, CPU/GPU split</td></tr>
<tr><td>Artefacts</td><td>raw.jsonl, summary.json, summary.md, resources.jsonl, plus hardware and settings</td></tr></table>
<p><b>Decision rule:</b></p>
<ol><li>Gate: 0 unsent citations and at least 5/6 (or the scaled share) correct abstentions.</li>
<li>Then the highest accuracy (manual grade, then auto score).</li>
<li>Then the lowest p95 latency.</li>
<li>Within 1 question of each other, the smaller model wins.</li></ol>
<p class="muted">Caveat: laptop latency for 9B includes CPU offload. Accuracy carries over to the GPU server; latency is re-measured there (Q8.5).</p>`
    },
    {
      id: "metrics", title: "Evaluation metrics", status: "planned",
      html: `
<table><tr><th>Metric</th><th>Definition</th><th>Target</th></tr>
<tr><td>Unsent citations</td><td>Citations of tickets not in the prompt (before checks)</td><td>Reported; 0 after checks</td></tr>
<tr><td>Abstention correct</td><td>Unanswerable questions answered exactly "Not enough information."</td><td>≥ 5/6 (scaled)</td></tr>
<tr><td>False abstention</td><td>Answerable questions where the model abstained</td><td>Lower is better</td></tr>
<tr><td>Fact coverage</td><td>Share of answer_check facts present</td><td>Higher is better</td></tr>
<tr><td>Gold cited</td><td>At least one gold ticket cited</td><td>Higher is better</td></tr>
<tr><td>Language OK</td><td>Answer in the question's language</td><td>100%</td></tr>
<tr><td>Manual grade</td><td>Blind 0–2</td><td>Higher is better</td></tr>
<tr><td>Consistency</td><td>Share of questions with identical verdicts across 3 repeats</td><td>Higher is better</td></tr>
<tr><td>Latency</td><td>p50/p95 total_ms; load_ms separate; tokens/s</td><td>Lower is better</td></tr>
<tr><td>Resources</td><td>Peak VRAM, peak runner RAM, CPU/GPU split</td><td>Reported</td></tr>
<tr><td>DB hit rate (system)</td><td>Asks served from the database / all asks</td><td>Reported (Q5.4)</td></tr>
<tr><td>False matches (system)</td><td>Database answers for a near-miss question</td><td><b>0</b></td></tr>
<tr><td>Inference avoided</td><td>1 − model calls / asks</td><td>Reported</td></tr></table>`
    },
    {
      id: "schema", title: "Database schema", status: "planned",
      html: `
<pre>
schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)

qa_entry(
  id INTEGER PRIMARY KEY, canonical_question TEXT NOT NULL, lang TEXT NOT NULL CHECK(lang IN ('en','de','ro')),
  answer_text TEXT NOT NULL, cited_ticket_ids TEXT NOT NULL,            -- JSON array
  status TEXT NOT NULL CHECK(status IN ('pending','validated','rejected','stale','flagged','retired')),
  critical_terms TEXT, flags TEXT,                                        -- JSON
  provider TEXT, model_name TEXT, model_digest TEXT, prompt_version TEXT, params TEXT,
  response_time_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER,
  created_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT)

qa_variant(id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES qa_entry(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL, normalized_text TEXT NOT NULL, lang TEXT NOT NULL,
  origin TEXT CHECK(origin IN ('canonical','reviewer','user')), created_at TEXT NOT NULL)
qa_variant_fts  -- FTS5(question_text), kept in sync by triggers

qa_source(entry_id INTEGER REFERENCES qa_entry(id) ON DELETE CASCADE, ticket_id TEXT, ticket_hash TEXT,
  PRIMARY KEY(entry_id, ticket_id))

qa_review_event(id INTEGER PRIMARY KEY, entry_id INTEGER REFERENCES qa_entry(id), actor TEXT NOT NULL,
  from_status TEXT, to_status TEXT, note TEXT, previous_answer TEXT, at TEXT NOT NULL)

match_log(id INTEGER PRIMARY KEY, asked_at TEXT, question TEXT, lang TEXT, best_entry_id INTEGER,
  score REAL, decision TEXT CHECK(decision IN ('served','fallback_model','abstained','queued')), latency_ms INTEGER)
</pre>
<p>Only rows with <code>status = 'validated'</code> are servable. Planned later migrations: 002 pending_questions (Q4.6), 003 qa_feedback (Q9.1).</p>`
    },
    {
      id: "retrieval", title: "Retrieval and matching strategy", status: "partial",
      html: `
<h4>Ticket retrieval <span class="pill s-implemented">implemented</span></h4>
<ul><li>SQLite FTS5 with the unicode61 tokenizer (remove_diacritics 2). Trigram is optional.</li>
<li>BM25 with the title weighted 2.0 and the body 1.0.</li>
<li>Every term is quoted and the terms are ORed, which prevents FTS syntax injection.</li>
<li>Measured: same-language top-5 8/8, cross-language 5/6.</li></ul>
<h4>Question matching <span class="pill s-planned">planned</span></h4>
<ol><li><b>Normalize:</b> NFKC, casefold, whitespace, punctuation; codes and versions kept intact.</li>
<li><b>Exact match</b> on the normalized text, same language, servable entries only.</li>
<li><b>Candidates:</b> FTS5/BM25 over qa_variant, top 5.</li>
<li><b>Critical-term guard (hard veto):</b> error codes, versions, numbers, application names and negations must be identical.</li>
<li><b>Threshold:</b> a similarity score calibrated on match_pairs (calibration split) for 0 false matches; verified on the holdout.</li></ol>
<p>Embeddings are deferred (AI-ADR-18). The trigger is a paraphrase miss rate above 30%.</p>`
    },
    {
      id: "citations", title: "Citation and abstention rules", status: "planned",
      html: `
<ul><li>Citations use the format <code>[T-1042]</code>; several may appear.</li>
<li><b>R1</b>: any citation that is not in the set of tickets sent → the answer is replaced by <code>Not enough information.</code> (reason <code>unsent_citation</code>).</li>
<li><b>R2</b>: an answer that is not an abstention and has no valid citation → abstain (<code>no_citation</code>).</li>
<li><b>R3</b>: abstention variants such as "not enough information", "Nicht genügend Informationen." or "Informații insuficiente." → normalized to exactly <code>Not enough information.</code></li>
<li><b>R4</b>: an answer confidently in a language other than the question's → abstain (<code>wrong_language</code>). An unknown language passes.</li>
<li>Answers are given in EN, DE or RO, matching the question.</li></ul>
<p class="muted">The reason codes are finalized in Q1.7.</p>`
    },
    {
      id: "security", title: "Security controls", status: "partial",
      html: `
<table><tr><th>Control</th><th>State</th></tr>
<tr><td>Approved-only ticket source</td><td><span class="pill s-implemented">implemented</span></td></tr>
<tr><td>FTS query quoting (injection-safe)</td><td><span class="pill s-implemented">implemented</span></td></tr>
<tr><td>Model endpoint restricted to localhost unless allow_remote</td><td><span class="pill s-planned">planned</span> Q1.8</td></tr>
<tr><td>Tickets inserted as delimited data; output post-validation</td><td><span class="pill s-planned">planned</span> Q1.6–Q1.7</td></tr>
<tr><td>Only validated answers served; audited transitions</td><td><span class="pill s-planned">planned</span> Q3.2</td></tr>
<tr><td>Prompt-injection and unapproved end-to-end suites</td><td><span class="pill s-planned">planned</span> Q5.1–Q5.2</td></tr>
<tr><td>RCK session and reviewer role on the integrated endpoints</td><td><span class="pill s-planned">planned</span> Q7.4</td></tr>
<tr><td>Local logs, retention purge, no external sinks</td><td><span class="pill s-planned">planned</span> Q9.3</td></tr></table>
<p>Data rules: synthetic data only during development; real data never goes to unapproved services; no secrets in files (environment variables only).</p>`
    },
    {
      id: "config", title: "Configuration", status: "planned",
      html: `
<pre>
# config.toml (planned, Q1.8; config.example.toml is committed, config.toml is local)
[model]
provider     = "ollama"              # ollama | openai_compat | fake (tests only)
base_url     = "http://127.0.0.1:11434"
model        = "<selected-qwen-tag>"
timeout_s    = 300
num_ctx      = 8192
seed         = 42
temperature  = 0
think        = false
allow_remote = false                 # must be true to use a non-localhost base_url
api_key_env  = ""                    # environment variable name, never the key itself

[retrieval]
tokenizer = "unicode61"
k         = 5

[matching]
threshold = 0.0                      # set by Q4.5 calibration

[fallback]
policy = "model"                     # model | abstain | queue

[logging]
retention_days = 90
</pre>
<p>Profiles (Q8.3): <code>[profiles.gpu-server]</code> overrides base_url, provider and allow_remote.</p>`
    },
    {
      id: "setup", title: "Local setup", status: "partial",
      html: `
<ol><li>Python 3.14 and pytest (installed).</li>
<li>Ollama installed and running on 127.0.0.1:11434 (installed, 0.40.9).</li>
<li>Qwen models: <b>not installed yet</b>. Pull after approval (Q0.5).</li>
<li>Working directory: <code>C:\\Users\\benkr\\Projects\\rck-assistant</code>.</li>
<li>Check the data: <code>python validate_dataset.py</code>.</li>
<li>Run the tests: <code>python -m pytest -q</code> (later <code>python run_tests.py</code>).</li>
<li>Questline: <code>python questline\\launch.py</code>.</li></ol>`
    },
    {
      id: "testing", title: "Testing procedures", status: "partial",
      html: `
<ul><li><b>After every change:</b> <code>python -m pytest -q</code>. Only <code>tests/test_search.py</code> exists so far, with 8 tests.</li>
<li><b>Live tests</b> are marked <code>@pytest.mark.ollama</code> and are skipped when Ollama is unreachable (planned in Q1.8).</li>
<li><b>Dataset validation:</b> <code>python validate_dataset.py</code>.</li>
<li><b>Gate:</b> <code>python run_tests.py</code> runs the unit and safety suites, the validator and the 0-false-match holdout check (planned in Q5.3).</li>
<li><b>Benchmarks</b> and evaluations are not tests. They produce reports under <code>results/</code>.</li>
<li><b>FakeLLM</b> is used only in unit tests and in labelled dry runs, never as benchmark evidence.</li>
<li><b>Questline:</b> <code>cd questline; node --test</code>.</li></ul>`
    },
    {
      id: "deployment", title: "Deployment preparation", status: "planned",
      html: `
<ol><li>Requirements derived from the measured benchmark (Q8.1).</li>
<li>Verified cost model and shutdown policy (Q8.2).</li>
<li>Configuration profiles, health check and runbook (Q8.3).</li>
<li><b>Approval gate:</b> nothing is provisioned without explicit written approval and a budget (Q8.4).</li>
<li>Re-benchmark on the server for accuracy parity (Q8.5).</li></ol>
<p>The GPU is not a prerequisite for any local development quest.</p>`
    },
    {
      id: "rollback", title: "Rollback and recovery", status: "planned",
      html: `
<ul><li><b>Before any bulk import or migration:</b> snapshot answers.db with the SQLite backup API to <code>backups/answers-YYYYMMDD-HHMM.db</code>.</li>
<li><b>Model or prompt rollback:</b> revert <code>model</code> and <code>prompt_version</code> in the config. Entries keep their own provenance.</li>
<li><b>Server rollback:</b> switch the profile back to <code>local</code> (runbook) and stop the instance.</li>
<li><b>RCK:</b> the feature flag turns the assistant off without a redeploy.</li>
<li><b>Drill:</b> Q9.5 (timed, documented).</li>
<li><b>Questline progress:</b> Backup view → Export JSON. Snapshots are kept in the browser.</li></ul>`
    }
  ];
})();

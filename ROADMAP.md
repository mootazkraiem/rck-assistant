# RCK Assistant — Roadmap (revised 2026-10-25)

> **Superseded by Questline.** The authoritative roadmap is
> `questline/` (run `python questline\launch.py`), and the generated
> `questline/ROADMAP.md`. This file is kept for history. Steps B0–B7 map to quests
> as described in `questline/README.md`.

Direction: local Qwen models only. Benchmark 4B against 9B, build a reviewed answer
database, and serve known questions from it without calling a model. Moving to a GPU
server later is a configuration change only.

Rules: no external LLM APIs, no paid services, synthetic data only, no waiting on
company infrastructure, modular adapters for the latest RCK. FakeLLM is for unit tests
only and never appears in benchmark results.

## Status of existing work

| Item | Status | Use in new direction |
|---|---|---|
| `data/synthetic_tickets.json` (40 tickets) | done | Knowledge the models answer from |
| `eval/questions.jsonl` (20 Q, EN/DE/RO, 6 unanswerable) | done | Benchmark set (core) |
| `validate_dataset.py` | done | Reused |
| `assistant/sources.py` (approved-only) | done | Reused; context for generation |
| `assistant/search.py` (FTS5/BM25) | done | Reused: ticket retrieval and question-matching candidates |
| Old D3 prompt/citation/abstention | not started | Becomes B1 |
| Old D4 model client | not started | Becomes B2 (Ollama, configurable) |
| Old D5–D7 RCK demo | postponed | After B7 |
| Company AI platform, PDFs, feedback tickets, ADR-10 | postponed | Unchanged |

## Plan (each step only after approval; all steps cost nothing)

| Step | Deliverable | Done when |
|---|---|---|
| B0 | Pull both Qwen models, verify tags and digests, smoke test | Both answer one question locally |
| B1 | Prompt builder, citation check, exact abstention string | Unit tests pass with FakeLLM |
| B2 | Provider interface + Ollama client from `config.toml` | Live call measured; tests pass without Ollama |
| B3 | Benchmark runner, grader, resource sampler; run 4B and 9B | `results/benchmark/<run>/` saved; model recommendation |
| B4 | Answer database + review CLI (approve / reject / edit) | Schema and status rules tested |
| B5 | Collection run: question set → selected model → `pending` rows | Rows stored with full metadata |
| B6 | Question matcher + labelled match set + fallback policy | Zero false matches on the near-miss set |
| B7 | `ask.py`: match → serve validated answer, else fallback | End-to-end tests; match log written |
| Later | GPU server (base_url/model change), RCK adapter, PDFs, company AI platform after client approval | — |

## Benchmark methodology (B3)

- **Same conditions:** same 20 questions, frozen retrieval (identical top-5 tickets in
  every prompt), same prompt version, same quantisation (Q4_K_M), temperature 0, fixed
  seed, `num_ctx` 8192, thinking off. One warm-up call is excluded from timing.
- **Repeats:** 3 runs per question per model (120 calls in total).
- **Speed** (from Ollama's own counters): load time, prompt time, generation time,
  tokens/s, total wall time; p50/p95 per model.
- **Accuracy:** automatic checks plus a blind manual grade.
  - Automatic: `answer_check` facts present, the gold ticket cited, the answer in the
    question's language.
  - Manual: 0–2 scale, model names hidden.
- **Reliability:**
  - Valid output format rate.
  - Count of citations to tickets that were not sent (must be 0).
  - Agreement across the 3 runs.
- **Insufficient information:** exact `Not enough information.` on the 6 unanswerable
  questions, plus the false-abstain rate on the 14 answerable ones.
- **Resources:**
  - Peak RAM of the Ollama runner.
  - VRAM (sampled with `nvidia-smi`).
  - CPU/GPU split (`ollama ps`).
  - CPU %.
- **Saved per run:**
  - `raw.jsonl` (every call), `summary.json` and `summary.md`.
  - Model digest, Ollama version, hardware and settings.
- **Decision rule:**
  1. Gate: 0 unsent citations and at least 5/6 correct abstentions.
  2. Then accuracy.
  3. Then p95 latency.
  4. Within 1 question of each other: the smaller model wins.
- **Limit:** 20 questions detect large differences only. Laptop latency does not predict
  GPU-server latency, but accuracy carries over at the same quantisation.

## Answer database (B4, SQLite `answers.db`)

```
qa_entry    id, canonical_question, lang, answer_text, cited_ticket_ids(json),
            status [pending|validated|rejected|stale], critical_terms(json),
            provider, model_name, model_digest, prompt_version, params(json),
            response_time_ms, tokens_in, tokens_out, created_at,
            reviewed_by, reviewed_at, review_note
qa_variant  id, entry_id -> qa_entry, question_text, normalized_text, lang,
            origin [canonical|reviewer|user], created_at        (+ FTS5 index)
qa_source   entry_id -> qa_entry, ticket_id, ticket_hash
match_log   id, asked_at, question, lang, best_entry_id, score,
            decision [served|fallback_model|abstained|queued], latency_ms
```

- Only `validated` entries are ever served.
- Generated answers start as `pending`. A reviewer approves, rejects or edits them;
  edits are recorded.
- When a cited ticket's hash changes, or the ticket stops being approved, the entry
  becomes `stale` and is no longer served.
- Answers are stored per language. A question is served only in its own language.
  Cross-language reuse is postponed.

## Question matching (B6)

1. **Exact match:** after normalisation (NFKC, lower case, whitespace and punctuation).
2. **Candidates:** FTS5/BM25 over `qa_variant`, top 5.
3. **Critical-term guard:** error codes, versions, numbers, application names and
   negations must be identical, or the match is refused. This catches VAL-217 vs VAL-271.
4. **Similarity threshold:** calibrated on a labelled set of synthetic pairs, about 60
   paraphrases and 60 near-misses.
   - Primary metric: the false-match rate, which must be 0.
   - Secondary metric: the hit rate.
5. **Fallback** (`config.toml`):
   - `model`: generate, then store the answer as `pending`.
   - `abstain`.
   - `queue`: log the question for a reviewer.

   The default is `model`, and that answer is labelled "not reviewed".

Embeddings are added only if lexical matching misses too many paraphrases. The local
`all-minilm` is English-only, so DE/RO would need a multilingual model.

## Open items / blockers

- **No Qwen model is installed yet.** Assumed: Qwen3.5 4B and 9B (Ollama `qwen3.5:4b`,
  `qwen3.5:9b`); the tags are verified in B0. The download is about 10 GB (free) against
  17 GB of free disk space.
- **The 9B model does not fit in the RTX 2050's 4 GB of VRAM.** It will run partly on
  the CPU, so it will be slow on this laptop. Results record this.
- **Thinking mode is off for the benchmark** (latency and output format). A single
  thinking-on run is optional.
- **Representative questions:** for now, the 20 synthetic questions plus about 40 more
  synthetic ones for collection. Real questions and a named reviewer come later.
- **Latest RCK:** the ticket schema and the "last updated" field (needed for staleness)
  are unknown until the code on the company PC is read.

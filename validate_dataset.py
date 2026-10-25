"""Check the synthetic tickets and the 20-question evaluation set for consistency.

Run:  python validate_dataset.py      (exit code 0 = valid, 1 = problems found)
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TICKETS = ROOT / "data" / "synthetic_tickets.json"
QUESTIONS = ROOT / "eval" / "questions.jsonl"

TEXT_FIELDS = {
    "problem_solution": ["title", "error_code", "problem", "root_cause", "solution", "steps"],
    "procedure": ["title", "purpose", "prerequisites", "steps", "warnings"],
    "information": ["title", "topic", "description"],
}
STATUSES = {"approved", "review", "in_progress", "rejected", "cancelled"}
QUESTION_LANGS = {"en", "de", "ro"}
TICKET_LANGS = {"en", "de"}
CATEGORIES = {"same_language", "cross_language", "near_miss", "unapproved_only", "out_of_scope"}

problems = []


def problem(msg):
    problems.append(msg)


def ticket_text(t):
    parts = []
    for field in TEXT_FIELDS[t["type"]]:
        value = t.get(field, "")
        parts.extend(value if isinstance(value, list) else [value])
    return " ".join(parts).lower()


tickets = json.loads(TICKETS.read_text(encoding="utf-8"))["tickets"]
by_id = {}
for t in tickets:
    tid = t.get("id", "?")
    if not re.fullmatch(r"T-\d{4}", tid):
        problem(f"{tid}: id must look like T-1234")
    if tid in by_id:
        problem(f"{tid}: duplicate id")
    by_id[tid] = t
    if t.get("type") not in TEXT_FIELDS:
        problem(f"{tid}: unknown type {t.get('type')!r}")
        continue
    if t.get("status") not in STATUSES:
        problem(f"{tid}: unknown status {t.get('status')!r}")
    if t.get("language") not in TICKET_LANGS:
        problem(f"{tid}: unknown language {t.get('language')!r}")
    for field in TEXT_FIELDS[t["type"]]:
        if field not in t:
            problem(f"{tid}: missing field {field!r}")

questions = [json.loads(line) for line in QUESTIONS.read_text(encoding="utf-8").splitlines() if line.strip()]
seen = set()
for q in questions:
    qid = q["id"]
    if qid in seen:
        problem(f"{qid}: duplicate id")
    seen.add(qid)
    if q["lang"] not in QUESTION_LANGS:
        problem(f"{qid}: unknown lang {q['lang']!r}")
    if q["category"] not in CATEGORIES:
        problem(f"{qid}: unknown category {q['category']!r}")
    for ref in q["gold_ticket_ids"] + q["acceptable_extra_citations"] + q["distractor_ticket_ids"]:
        if ref not in by_id:
            problem(f"{qid}: references missing ticket {ref}")
    for ref in q["gold_ticket_ids"] + q["acceptable_extra_citations"]:
        if ref in by_id and by_id[ref]["status"] != "approved":
            problem(f"{qid}: citable ticket {ref} is not approved")
    if q["answerable"]:
        if not q["gold_ticket_ids"] or not q["key_facts"] or not q["answer_check"]:
            problem(f"{qid}: answerable question needs gold tickets, key facts and answer checks")
        gold_text = " ".join(ticket_text(by_id[g]) for g in q["gold_ticket_ids"] if g in by_id)
        for fact in q["key_facts"]:
            if fact.lower() not in gold_text:
                problem(f"{qid}: key fact {fact!r} not found in its gold ticket(s)")
        if q["category"] == "cross_language":
            gold_langs = {by_id[g]["language"] for g in q["gold_ticket_ids"] if g in by_id}
            if q["lang"] in gold_langs:
                problem(f"{qid}: marked cross_language but question and ticket share a language")
    else:
        if q["gold_ticket_ids"] or q["key_facts"]:
            problem(f"{qid}: unanswerable question must have no gold tickets or key facts")
        if q["expected_answer"] != "Not enough information.":
            problem(f"{qid}: unanswerable expected answer must be exactly 'Not enough information.'")
        if q["category"] == "unapproved_only":
            if not any(by_id.get(d, {}).get("status") != "approved" for d in q["distractor_ticket_ids"]):
                problem(f"{qid}: unapproved_only question needs an unapproved trap ticket")

answerable = sum(q["answerable"] for q in questions)
cats = Counter(q["category"] for q in questions)
targets = [
    (len(questions) == 20, f"20 questions (got {len(questions)})"),
    (answerable == 14, f"14 answerable (got {answerable})"),
    (cats["cross_language"] >= 4, f">= 4 cross-language (got {cats['cross_language']})"),
    (cats["near_miss"] >= 3, f">= 3 near-miss unanswerable (got {cats['near_miss']})"),
    (cats["unapproved_only"] >= 1, f">= 1 unapproved-only trap (got {cats['unapproved_only']})"),
    ({q["lang"] for q in questions} == QUESTION_LANGS, "questions in en, de and ro"),
]
for ok, label in targets:
    if not ok:
        problem(f"target missed: {label}")

status_counts = Counter(t["status"] for t in tickets)
print(f"Tickets: {len(tickets)} | by status {dict(status_counts)} | by language {dict(Counter(t['language'] for t in tickets))} | by type {dict(Counter(t['type'] for t in tickets))}")
print(f"Questions: {len(questions)} | answerable {answerable}, unanswerable {len(questions) - answerable} | by language {dict(Counter(q['lang'] for q in questions))}")
print(f"Categories: {dict(cats)}")
if problems:
    print(f"\nINVALID - {len(problems)} problem(s):")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print("\nVALID - every gold ticket exists and is approved, every key fact appears in its gold ticket, all targets met.")

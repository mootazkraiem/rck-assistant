"""D2 measurement: is the gold ticket in the top k for each answerable question?

Run:  python eval_retrieval.py [k]      (default k = 5; no model involved)
"""
import json
import sys
from pathlib import Path

from assistant.search import TOKENIZERS, build_index, search
from assistant.sources import JsonTicketSource

ROOT = Path(__file__).resolve().parent
K = int(sys.argv[1]) if len(sys.argv) > 1 else 5

tickets = JsonTicketSource(ROOT / "data" / "synthetic_tickets.json").load_approved_tickets()
questions = [json.loads(l) for l in (ROOT / "eval" / "questions.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]

for tokenizer in TOKENIZERS:
    index = build_index(tickets, tokenizer)
    print(f"\n=== tokenizer: {tokenizer} | top-{K} ===")
    scores = {}
    for q in questions:
        hits = [h.ticket_id for h in search(index, q["question"], k=K)]
        if q["answerable"]:
            rank = next((i + 1 for i, h in enumerate(hits) if h in q["gold_ticket_ids"]), None)
            scores.setdefault(q["category"], []).append(rank is not None)
            mark = f"rank {rank}" if rank else "MISS"
        else:
            mark = "(unanswerable - retrieval only feeds the abstain test)"
        print(f"{q['id']} [{q['lang']}, {q['category']}] {mark:8s} -> {hits}")
    for cat, hits in scores.items():
        print(f"  {cat}: {sum(hits)}/{len(hits)} gold ticket in top-{K}")

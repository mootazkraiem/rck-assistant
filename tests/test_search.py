"""D2: approved-only ticket source and FTS5/BM25 search."""
import json
from pathlib import Path

import pytest

from assistant.search import TOKENIZERS, build_index, build_query, search
from assistant.sources import JsonTicketSource

DATA = Path(__file__).resolve().parents[1] / "data" / "synthetic_tickets.json"
ALL = json.loads(DATA.read_text(encoding="utf-8"))["tickets"]
UNAPPROVED = {t["id"] for t in ALL if t["status"] != "approved"}


@pytest.fixture(scope="module")
def tickets():
    return JsonTicketSource(DATA).load_approved_tickets()


def test_source_returns_only_approved(tickets):
    ids = {t.id for t in tickets}
    assert ids and not ids & UNAPPROVED
    assert len(ids) == sum(t["status"] == "approved" for t in ALL)


@pytest.mark.parametrize("tokenizer", list(TOKENIZERS))
def test_unapproved_tickets_are_never_returned(tickets, tokenizer):
    index = build_index(tickets, tokenizer)
    # Questions aimed squarely at the unapproved tickets' own wording.
    for t in ALL:
        if t["id"] in UNAPPROVED:
            for hit in search(index, t["title"], k=40):
                assert hit.ticket_id not in UNAPPROVED


@pytest.mark.parametrize("tokenizer", list(TOKENIZERS))
def test_error_code_ranks_its_ticket_first(tickets, tokenizer):
    index = build_index(tickets, tokenizer)
    assert search(index, "error VAL-217", k=1)[0].ticket_id == "T-1001"
    assert search(index, "VAL-271", k=1)[0].ticket_id == "T-1015"


def test_query_is_quoted_so_fts_syntax_cannot_be_injected():
    q = build_query('VAL-217 OR "x" NEAR(a b) title:secret *')
    assert q.startswith('"VAL-217"')
    for term in q.split(" OR "):
        assert term.startswith('"') and term.endswith('"')


def test_empty_or_symbol_only_question_returns_nothing(tickets):
    index = build_index(tickets)
    assert search(index, "") == []
    assert search(index, "?? !! --") == []


def test_k_limits_results(tickets):
    index = build_index(tickets)
    assert len(search(index, "release package validation", k=3)) <= 3

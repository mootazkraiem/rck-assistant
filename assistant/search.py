"""Keyword search over approved tickets: SQLite FTS5 with BM25 ranking.

The index only ever receives what the ticket source returns (approved
tickets), so search cannot surface anything else.
"""
import re
import sqlite3
from dataclasses import dataclass

TOKENIZERS = {
    # word tokens, case- and accent-insensitive (é = e, ä = a)
    "unicode61": "unicode61 remove_diacritics 2",
    # 3-character fragments: matches inside German compound words and codes
    "trigram": "trigram",
}
TITLE_WEIGHT, BODY_WEIGHT = 2.0, 1.0
_TERM_RE = re.compile(r"[\w]+(?:[-./][\w]+)*", re.UNICODE)


@dataclass
class Index:
    conn: sqlite3.Connection
    tokenizer: str


@dataclass(frozen=True)
class Hit:
    ticket_id: str
    score: float  # BM25: lower (more negative) = better


def build_index(tickets, tokenizer: str = "unicode61") -> Index:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        f"CREATE VIRTUAL TABLE ticket_fts USING fts5("
        f"ticket_id UNINDEXED, title, body, tokenize='{TOKENIZERS[tokenizer]}')"
    )
    conn.executemany(
        "INSERT INTO ticket_fts (ticket_id, title, body) VALUES (?, ?, ?)",
        [(t.id, t.title, f"{' '.join(t.applications)}\n{t.body()}") for t in tickets],
    )
    conn.commit()
    return Index(conn=conn, tokenizer=tokenizer)


def build_query(text: str, tokenizer: str = "unicode61") -> str:
    """Turn a free-text question into a safe FTS5 query: each term quoted
    (so codes like VAL-217 stay one phrase and no FTS5 syntax can be
    injected), joined with OR, and BM25 does the ranking."""
    min_len = 3 if tokenizer == "trigram" else 2
    terms = [m.group(0) for m in _TERM_RE.finditer(text)]
    terms = [t for t in terms if len(t) >= min_len]
    seen, quoted = set(), []
    for t in terms:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            quoted.append('"' + t.replace('"', '""') + '"')
    return " OR ".join(quoted)


def search(index: Index, question: str, k: int = 5) -> list[Hit]:
    query = build_query(question, index.tokenizer)
    if not query:
        return []
    rows = index.conn.execute(
        "SELECT ticket_id, bm25(ticket_fts, 0, ?, ?) AS score FROM ticket_fts "
        "WHERE ticket_fts MATCH ? ORDER BY score LIMIT ?",
        (TITLE_WEIGHT, BODY_WEIGHT, query, k),
    ).fetchall()
    return [Hit(ticket_id=r[0], score=r[1]) for r in rows]

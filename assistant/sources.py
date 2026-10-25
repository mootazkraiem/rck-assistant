"""Where tickets come from.

Everything downstream (search, prompt, checks) depends only on the Ticket
record below. The approval filter lives HERE, in the source, so nothing
unapproved can ever reach the index. On the company PC, a second source
(reading the latest RCK database) replaces JsonTicketSource; nothing else
has to change.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

# Fields searched/sent per ticket type, in display order.
TEXT_FIELDS = {
    "problem_solution": ["error_code", "problem", "root_cause", "solution", "steps"],
    "procedure": ["purpose", "prerequisites", "steps", "warnings"],
    "information": ["topic", "description"],
}


@dataclass(frozen=True)
class Ticket:
    id: str
    type: str
    language: str
    title: str
    applications: tuple = ()
    fields: dict = field(default_factory=dict)  # field name -> text (lists joined)

    def body(self) -> str:
        """All content fields as labelled lines, for search and for the prompt."""
        return "\n".join(f"{name}: {text}" for name, text in self.fields.items() if text)


class JsonTicketSource:
    """Synthetic tickets from a JSON file. Returns APPROVED tickets only."""

    def __init__(self, path):
        self.path = Path(path)

    def load_approved_tickets(self) -> list[Ticket]:
        raw = json.loads(self.path.read_text(encoding="utf-8"))["tickets"]
        tickets = []
        for t in raw:
            if t.get("status") != "approved":
                continue
            fields = {}
            for name in TEXT_FIELDS.get(t["type"], []):
                value = t.get(name, "")
                fields[name] = " ".join(value) if isinstance(value, list) else (value or "")
            tickets.append(Ticket(
                id=t["id"], type=t["type"], language=t.get("language", ""),
                title=t.get("title", ""), applications=tuple(t.get("applications", [])),
                fields=fields,
            ))
        return tickets

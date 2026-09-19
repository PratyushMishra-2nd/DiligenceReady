"""Party resolution: deciding that two names are one supplier.

The purchase register has no GSTIN column. GSTR-2B has nothing but GSTINs.
The bank has neither — only a narration a payment gateway assembled. Every
later comparison depends on this layer getting "ABC Traders", "ABC TRADERS
PRIVATE LIMITED" and "NEFT-N2026...-ABC TRADERS PRIVATE LIMITED-PAYMENT" onto
one party row (Blueprint §08).

Resolution is tried in descending order of certainty, and the method used is
recorded rather than discarded, because "how did you decide these were the
same supplier?" is a question the evidence card has to answer.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from rapidfuzz import fuzz, process
from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine.ingest.documents import stable_id
from diligence_engine.normalise import display_party, norm_gstin, norm_party

# A ledger name has to clear this before a fuzzy match is allowed to stand.
_FUZZY_CUTOFF = 92.0

# Payment-channel noise that sits either side of the trade name in a narration.
_NARRATION_NOISE = re.compile(
    r"\b(?:NEFT|RTGS|IMPS|UPI|ACH|ECS|CHQ|CR|DR|PAYMENT|COLLECTION|TRANSFER|"
    r"INB|MB|BIL|TPT|N\d{8,}|\d{6,})\b"
)


@dataclass
class ResolvedParty:
    party_id: uuid.UUID
    method: str  # gstin | alias | norm_name | fuzzy | narration


@dataclass
class PartyResolver:
    """An in-memory index of one company's parties.

    Built once per ingestion run. Resolving two thousand bank narrations with
    a SQL round trip each is the difference between a demo that runs and a
    demo that waits.
    """

    company_id: uuid.UUID
    by_gstin: dict[str, uuid.UUID] = field(default_factory=dict)
    by_norm_name: dict[str, uuid.UUID] = field(default_factory=dict)
    by_alias: dict[str, uuid.UUID] = field(default_factory=dict)
    # Reverse index, so the purchase register can stamp a supplier GSTIN onto
    # every row without a query per row.
    gstin_of: dict[uuid.UUID, str] = field(default_factory=dict)
    # Longest names first: "SHARMA STEEL" must win over "SHARMA".
    name_index: list[tuple[str, uuid.UUID]] = field(default_factory=list)

    def reindex(self) -> None:
        self.name_index = sorted(
            {**self.by_norm_name, **self.by_alias}.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        )

    # ── writes ──────────────────────────────────────────────────────────

    def upsert(
        self,
        conn: Connection,
        *,
        gstin: str | None,
        name: str,
        kind: str,
    ) -> uuid.UUID:
        """Create or find a party. GSTIN wins when present; the name is the fallback key."""
        clean_gstin = norm_gstin(gstin)
        normalised = norm_party(name)

        if clean_gstin and clean_gstin in self.by_gstin:
            party_id = self.by_gstin[clean_gstin]
        elif not clean_gstin and normalised in self.by_norm_name:
            party_id = self.by_norm_name[normalised]
        else:
            party_id = stable_id("party", self.company_id, clean_gstin or normalised)

        conn.execute(
            text(
                "insert into parties "
                "(id, company_id, gstin, pan, canonical_name, norm_name, kind) "
                "values (:id, :company_id, :gstin, :pan, :canonical_name, :norm_name, :kind) "
                "on conflict (id) do update set "
                "  gstin = coalesce(parties.gstin, excluded.gstin), "
                "  kind = case when parties.kind = excluded.kind then parties.kind "
                "              else 'both' end"
            ),
            {
                "id": party_id,
                "company_id": self.company_id,
                "gstin": clean_gstin,
                "pan": clean_gstin[2:12] if clean_gstin and len(clean_gstin) == 15 else None,
                "canonical_name": display_party(name),
                "norm_name": normalised,
                "kind": kind,
            },
        )

        if clean_gstin:
            self.by_gstin[clean_gstin] = party_id
            self.gstin_of[party_id] = clean_gstin
        if normalised:
            self.by_norm_name.setdefault(normalised, party_id)
        return party_id

    def add_alias(self, conn: Connection, party_id: uuid.UUID, alias: str, source: str) -> None:
        normalised = norm_party(alias)
        if not normalised:
            return
        conn.execute(
            text(
                "insert into party_aliases (id, party_id, alias, norm_alias, source) "
                "values (:id, :party_id, :alias, :norm_alias, :source) "
                "on conflict (id) do nothing"
            ),
            {
                "id": stable_id("alias", party_id, normalised, source),
                "party_id": party_id,
                "alias": display_party(alias),
                "norm_alias": normalised,
                "source": source,
            },
        )
        self.by_alias.setdefault(normalised, party_id)

    # ── reads ───────────────────────────────────────────────────────────

    def resolve_name(self, name: str) -> ResolvedParty | None:
        """A ledger name from the purchase register, which carries no GSTIN."""
        normalised = norm_party(name)
        if not normalised:
            return None
        if normalised in self.by_alias:
            return ResolvedParty(self.by_alias[normalised], "alias")
        if normalised in self.by_norm_name:
            return ResolvedParty(self.by_norm_name[normalised], "norm_name")

        candidates = list(self.by_norm_name)
        if not candidates:
            return None
        best = process.extractOne(
            normalised, candidates, scorer=fuzz.ratio, score_cutoff=_FUZZY_CUTOFF
        )
        if best is None:
            return None
        return ResolvedParty(self.by_norm_name[best[0]], "fuzzy")

    def resolve_narration(self, narration: str) -> ResolvedParty | None:
        """A bank narration: free text with a trade name buried in channel noise."""
        stripped = _NARRATION_NOISE.sub(" ", narration.upper())
        normalised = norm_party(stripped)
        if not normalised:
            return None
        for name, party_id in self.name_index:
            if len(name) >= 4 and name in normalised:
                return ResolvedParty(party_id, "narration")
        return None


def load_resolver(conn: Connection, company_id: uuid.UUID) -> PartyResolver:
    resolver = PartyResolver(company_id=company_id)
    for row in conn.execute(
        text("select id, gstin, norm_name from parties where company_id = :company_id"),
        {"company_id": company_id},
    ):
        if row.gstin:
            resolver.by_gstin[row.gstin] = row.id
            resolver.gstin_of[row.id] = row.gstin
        if row.norm_name:
            resolver.by_norm_name.setdefault(row.norm_name, row.id)

    for row in conn.execute(
        text(
            "select a.party_id, a.norm_alias from party_aliases a "
            "join parties p on p.id = a.party_id where p.company_id = :company_id"
        ),
        {"company_id": company_id},
    ):
        resolver.by_alias.setdefault(row.norm_alias, row.party_id)

    resolver.reindex()
    return resolver

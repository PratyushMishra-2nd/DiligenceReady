"""Synthetic company generator with a known answer key (Blueprint §10)."""

from pathlib import Path

from diligence_engine.seedgen.generate import build_ground_truth
from diligence_engine.seedgen.model import Defect, GroundTruth
from diligence_engine.seedgen.writers import write_feeds

# The demo company, and the second one that proves multi-company is real
# rather than a single tenant with a dropdown.
COMPANIES = (
    {"name": "Acme Industries", "slug": "acme-industries", "seed": 20260819},
    {"name": "Vertex Components", "slug": "vertex-components", "seed": 71104233},
)


def generate_company(name: str, slug: str, seed: int, out_root: Path) -> tuple[GroundTruth, dict]:
    truth = build_ground_truth(name, slug, seed=seed)
    written = write_feeds(truth, out_root)
    return truth, written


__all__ = [
    "COMPANIES",
    "Defect",
    "GroundTruth",
    "build_ground_truth",
    "generate_company",
    "write_feeds",
]

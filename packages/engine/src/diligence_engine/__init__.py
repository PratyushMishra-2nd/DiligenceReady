"""DiligenceReady reconciliation engine.

The architecture principle this package exists to enforce (Blueprint §06):

    Deterministic code decides. The model only extracts and explains.

Code owns arithmetic, aggregation, matching, thresholds, ageing, percentages
and risk creation. The model owns document extraction, party-name
normalisation and natural-language explanation. Nothing in this package
calls a model, by design — the explanation layer lives outside it and is
handed finished risk objects, never raw documents.
"""

__version__ = "0.1.0"

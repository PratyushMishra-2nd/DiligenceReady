"""Ingestion: files in, typed rows out, provenance on every one."""

from diligence_engine.ingest.runner import CompanyIngest, ingest_company

__all__ = ["CompanyIngest", "ingest_company"]

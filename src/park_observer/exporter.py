from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path
from typing import Any

from .analytics import corpus_analytics, data_funnel, evidence_by_park, park_analytics, prepare_public_parks, source_health_summary
from .archive import load_archive
from .reports import write_feasibility_report, write_intelligence_reports
from .utils import PROJECT_ROOT, iso_now, read_csv, read_json, write_json


def _copy_static(static_dir: Path, output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(static_dir, output_dir)


def _copy_data_file(src: Path, dest: Path) -> None:
    if src.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)


def build_dashboard(root: Path, archive: list[dict[str, Any]], assessments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    parks_raw = read_csv(root / "data/park_catalog.csv")
    parks = prepare_public_parks(parks_raw)
    fields = read_csv(root / "data/required_data_fields.csv")
    rules = read_csv(root / "data/standard_rules.csv")
    measures = read_csv(root / "data/technology_guidance.csv")
    sources = read_csv(root / "data/source_registry.csv")
    evidence_rows = read_csv(root / "data/park_public_evidence.csv")
    verified_facts = read_csv(root / "data/verified_public_facts.csv")
    health = read_json(root / "data/source_health.json", {"sources": {}})
    park_stats = park_analytics(parks_raw)
    corpus_stats = corpus_analytics(archive)
    funnel = data_funnel(parks_raw, evidence_rows, verified_facts, archive, assessments)
    latest_date = max((r.get("published_date", "") for r in archive), default=date.today().isoformat())
    return {
        "meta": {
            "generated_at": iso_now(),
            "latest_record_date": latest_date,
            "data_version": latest_date,
            "counts": {
                "domestic_parks": park_stats["domestic_count"],
                "international_cases": park_stats["international_count"],
                "archive_records": len(archive),
                "required_fields": len(fields),
                "technology_measures": len(measures),
                "standard_rules": len(rules),
                "verified_public_facts": len(verified_facts),
                "formal_accounting_ready": funnel[-1]["value"] if funnel else 0,
            },
            "scope_note": "公开信息用于发现事实、比较结构和提出补数任务；正式核算必须使用同一边界、同一年度、可追溯的园区台账。",
        },
        "parks": parks,
        "evidence": evidence_by_park(evidence_rows),
        "fields": fields,
        "rules": rules,
        "measures": measures,
        "source_registry": sources,
        "source_health": source_health_summary(health),
        "verified_facts": verified_facts,
        "updates": archive[:80],
        "analytics": {**park_stats, "corpus": corpus_stats, "funnel": funnel},
    }


def export_site(root: Path = PROJECT_ROOT, output_dir: Path | None = None, *, feasibility_result: dict[str, Any] | None = None) -> dict[str, Any]:
    output_dir = output_dir or root / "site"
    archive = load_archive(root / "data/archive.jsonl")
    if not archive:
        archive = read_json(root / "data/seed_updates.json", []) or []
    _copy_static(root / "static", output_dir)
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")
    data_dir = output_dir / "data"
    reports_dir = output_dir / "reports"
    data_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    dashboard = build_dashboard(root, archive)
    write_json(data_dir / "dashboard.json", dashboard)
    # Publish archive in JSON for browser search and as JSONL for open-data use.
    write_json(data_dir / "archive.json", archive)
    _copy_data_file(root / "data/archive.jsonl", data_dir / "archive.jsonl")
    for name in (
        "park_catalog.csv",
        "required_data_fields.csv",
        "standard_rules.csv",
        "technology_guidance.csv",
        "source_registry.csv",
        "park_public_evidence.csv",
        "verified_public_facts.csv",
        "data_quality_rules.csv",
        "source_health.json",
        "archive_manifest.json",
        "sample_project_scenario.csv",
    ):
        _copy_data_file(root / "data" / name, data_dir / name)
    _copy_data_file(root / "data/assessments/example.json", data_dir / "assessment_example.json")
    report_index = write_intelligence_reports(archive, reports_dir)
    if feasibility_result:
        paths = write_feasibility_report(feasibility_result, reports_dir)
        report_index["reports"].append({"type": "feasibility", "date": feasibility_result.get("baseline_year") or "latest", "html": "reports/feasibility-latest.html", "markdown": "reports/feasibility-latest.md", "json": "reports/feasibility-latest.json", "record_count": 1})
    write_json(data_dir / "report_index.json", report_index)
    manifest = {
        "generated_at": iso_now(),
        "output_dir": str(output_dir),
        "archive_records": len(archive),
        "reports": report_index["reports"],
        "dashboard_counts": dashboard["meta"]["counts"],
    }
    write_json(root / "outputs/build_manifest.json", manifest)
    return manifest

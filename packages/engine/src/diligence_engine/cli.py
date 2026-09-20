"""Engine CLI. The whole pipeline is runnable without the API or the web app.

diligence migrate     apply pending schema migrations
diligence tables      list every table with its row count
diligence seed        generate the synthetic companies and their feeds
diligence ingest      load the generated feeds into typed tables
diligence reconcile   recompute every match
diligence ims         compute the recommended IMS action for every record
diligence rule        enable or disable a rule in the registry
diligence rules       run every enabled rule over every period
diligence evaluate    score the engine against the planted answer key
diligence tally       read a live Tally company over its XML gateway
diligence bedrock     list the Bedrock models this account can invoke
diligence doctor      check every dependency a deployment needs
diligence pipeline    the whole thing, in order
"""

from __future__ import annotations

import json
import uuid

import click
from sqlalchemy import text
from sqlalchemy.engine import Connection

from diligence_engine import migrate as migrations
from diligence_engine.config import settings
from diligence_engine.db import connect
from diligence_engine.eval import evaluate
from diligence_engine.ingest import ingest_company
from diligence_engine.ingest.documents import stable_id
from diligence_engine.matching import reconcile_bank, reconcile_gst
from diligence_engine.matching.ims import recommend as recommend_ims
from diligence_engine.rules import run_rules
from diligence_engine.seedgen import COMPANIES, build_ground_truth, generate_company


@click.group()
def cli() -> None:
    """DiligenceReady engine."""


# ── schema ──────────────────────────────────────────────────────────────────


@cli.command("migrate")
def migrate_cmd() -> None:
    """Apply pending migrations."""
    applied = migrations.run()
    if not applied:
        click.echo("Nothing to apply. Schema is current.")
        return
    for filename in applied:
        click.echo(f"applied  {filename}")
    click.echo(f"\n{len(applied)} migration(s) applied.")


@cli.command("tables")
def tables_cmd() -> None:
    """List every table and its row count."""
    rows = migrations.tables()
    width = max((len(name) for name, _ in rows), default=0)
    for name, count in rows:
        click.echo(f"{name:<{width}}  {count:>8,}")
    click.echo(f"\n{len(rows)} tables.")


# ── data ────────────────────────────────────────────────────────────────────


@cli.command("seed")
@click.option("--company", default=None, help="Slug of a single company to regenerate.")
def seed_cmd(company: str | None) -> None:
    """Generate the synthetic companies, their feeds and the answer key."""
    out = settings().seed_dir
    for spec in _selected(company):
        truth, written = generate_company(spec["name"], spec["slug"], spec["seed"], out)
        click.echo(
            f"{spec['slug']:<20} {len(truth.purchases):>5} purchases  "
            f"{len(truth.sales):>4} sales  {len(truth.bank):>5} bank  "
            f"{len(truth.defects):>3} planted defects  -> {len(written)} files"
        )
    click.echo(f"\nFeeds written under {out}")


@cli.command("ingest")
@click.option("--company", default=None, help="Slug of a single company to ingest.")
def ingest_cmd(company: str | None) -> None:
    """Load the generated feeds into the typed tables."""
    root = settings().seed_dir
    for spec in _selected(company):
        feed_dir = root / spec["slug"] / "feeds"
        if not feed_dir.is_dir():
            raise click.ClickException(f"No feeds at {feed_dir}. Run `diligence seed` first.")

        truth = build_ground_truth(spec["name"], spec["slug"], seed=spec["seed"])
        with connect() as conn:
            outcome = ingest_company(
                conn,
                name=spec["name"],
                slug=spec["slug"],
                gstin=truth.gstin,
                pan=truth.pan,
                fy_start=truth.fy_start,
                feed_dir=feed_dir,
            )

        click.echo(f"\n{spec['name']}  ({len(outcome.periods)} periods)")
        merged: dict[str, int] = {}
        skipped: set[str] = set()
        for result in outcome.results:
            merged[result.kind] = merged.get(result.kind, 0) + result.rows
            if result.skipped:
                skipped.add(result.kind)
        for kind, rows in merged.items():
            note = "  (already ingested)" if kind in skipped and rows == 0 else ""
            click.echo(f"  {kind:<18} {rows:>6} rows{note}")
        click.echo(f"  {'total':<18} {outcome.total_rows:>6} rows")


@cli.command("reconcile")
@click.option("--company", default=None, help="Slug of a single company to reconcile.")
def reconcile_cmd(company: str | None) -> None:
    """Recompute every match. Deterministic, and safe to rerun."""
    for spec in _selected(company):
        with connect() as conn:
            company_id = _company_id(conn, spec["slug"])
            gst = reconcile_gst(conn, company_id)
            bank = reconcile_bank(conn, company_id)

        click.echo(f"\n{spec['name']}")
        click.echo("  GST: purchase register against GSTR-2B")
        for method, count in sorted(gst.by_method.items(), key=lambda item: -item[1]):
            click.echo(f"    {method:<18} {count:>6}")
        click.echo(f"    {'unmatched (PR)':<18} {gst.unmatched_pr:>6}")
        click.echo(f"    {'unmatched (2B)':<18} {gst.unmatched_2b:>6}")
        click.echo(f"    {'duplicate':<18} {gst.duplicates:>6}")
        click.echo(f"    {'late-filed':<18} {gst.late_filed:>6}  matched in a later period's 2B")
        register_rows = gst.pairs + gst.unmatched_pr + gst.duplicates
        coverage = (gst.pairs / register_rows * 100) if register_rows else 0.0
        click.echo(f"    {'coverage':<18} {coverage:>5.1f}%")

        click.echo("  Bank: statement against vouchers")
        for method, count in sorted(bank.by_method.items(), key=lambda item: -item[1]):
            click.echo(f"    {method:<18} {count:>6}")
        click.echo(f"    {'unmatched bank':<18} {bank.unmatched_bank:>6}")
        click.echo(f"    {'unmatched books':<18} {bank.unmatched_books:>6}")


@cli.command("ims")
@click.option("--company", default=None, help="Slug of a single company.")
def ims_cmd(company: str | None) -> None:
    """Compute the recommended accept / reject / pending for every IMS record."""
    for spec in _selected(company):
        with connect() as conn:
            stats = recommend_ims(conn, _company_id(conn, spec["slug"]))

        click.echo(f"\n{spec['name']}")
        click.echo(f"  {stats.total} records on the dashboard")
        for action in ("accept", "reject", "pending"):
            count = stats.by_recommendation.get(action, 0)
            click.echo(f"    recommend {action:<8} {count:>5}")
        click.echo(f"    no recommendation  {stats.no_recommendation:>5}  (supplier has not filed)")
        click.echo(f"  {stats.deemed_accepted} would be deemed accepted if left alone")
        if stats.raises_supplier_liability:
            click.echo(
                f"  {stats.raises_supplier_liability} of the rejections raise the "
                f"supplier's liability - confirm before acting"
            )


@cli.group("rule")
def rule_group() -> None:
    """Turn a rule on or off in the registry."""


@rule_group.command("enable")
@click.argument("codes", nargs=-1, required=True)
def rule_enable(codes: tuple[str, ...]) -> None:
    """Enable rules by code, e.g. `diligence rule enable R9 R10 R11`."""
    _set_enabled(codes, True)


@rule_group.command("disable")
@click.argument("codes", nargs=-1, required=True)
def rule_disable(codes: tuple[str, ...]) -> None:
    """Disable rules by code."""
    _set_enabled(codes, False)


@rule_group.command("list")
def rule_list() -> None:
    """Show the registry."""
    with connect() as conn:
        rows = conn.execute(
            text("select code, domain, title, enabled from rules order by domain, code")
        ).all()
    for row in rows:
        mark = "on " if row.enabled else "off"
        click.echo(f"  [{mark}] {row.code:<4} {row.domain:<11} {row.title}")


def _set_enabled(codes: tuple[str, ...], enabled: bool) -> None:
    with connect() as conn:
        for code in codes:
            result = conn.execute(
                text("update rules set enabled = :enabled where code = :code"),
                {"enabled": enabled, "code": code},
            )
            if result.rowcount == 0:
                raise click.ClickException(f"No rule with code {code!r} in the registry.")
            click.echo(f"{code} {'enabled' if enabled else 'disabled'}")
    click.echo("Run `diligence rules` to recompute.")


@cli.command("rules")
@click.option("--company", default=None, help="Slug of a single company.")
def rules_cmd(company: str | None) -> None:
    """Run every enabled rule over every period."""
    for spec in _selected(company):
        with connect() as conn:
            company_id = _company_id(conn, spec["slug"])
            run = run_rules(conn, company_id)

        click.echo(f"\n{spec['name']}  ({len(run.periods)} periods)")
        for code, count in sorted(run.by_rule.items()):
            click.echo(f"    {code:<5} {count:>5} risks")
        click.echo(f"    {'total':<5} {run.total:>5} risks")
        severities = "  ".join(f"{name} {count}" for name, count in sorted(run.by_severity.items()))
        click.echo(f"    severity: {severities}")
        if run.skipped:
            click.echo(f"    not run (disabled in registry): {', '.join(run.skipped)}")


@cli.command("evaluate")
@click.option("--company", default=None, help="Slug of a single company.")
def evaluate_cmd(company: str | None) -> None:
    """Score the engine against the planted answer key."""
    root = settings().seed_dir
    for spec in _selected(company):
        answers = root / spec["slug"] / "answers" / "planted_defects.json"
        if not answers.exists():
            raise click.ClickException(f"No answer key at {answers}. Run `diligence seed`.")

        with connect() as conn:
            company_id = _company_id(conn, spec["slug"])
            report = evaluate(conn, company_id, spec["name"], answers)

        out = answers.parent / "evaluation.json"
        out.write_text(json.dumps(report.as_dict(), indent=2), encoding="utf-8")

        data = report.as_dict()
        row = data["row_level"]
        period_level = data["period_level"]

        click.echo(f"\n{spec['name']} - seeded evaluation set")
        click.echo(f"  planted            {report.planted:>5}")
        click.echo(f"  detected           {report.detected:>5}")
        click.echo(f"  missed             {report.missed:>5}")
        click.echo(f"  recall             {report.recall:>5.2f}")
        click.echo(
            f"  row-level rules    precision {row['precision']:.2f}  "
            f"({row['detected']}/{row['findings']} findings keyed, "
            f"{len(row['false_positives'])} false positive)"
        )
        click.echo(
            f"  period-level rules {period_level['detected']}/{period_level['planted']} "
            f"planted found; {len(period_level['all_findings'])} period(s) crossed a "
            f"threshold in total"
        )
        click.echo("  by defect type")
        for name, tally in sorted(data["by_defect_type"].items()):
            click.echo(
                f"    {name:<24} {tally['detected']:>2}/{tally['planted']:<2} ({tally['rule']})"
            )
        for item in row["false_positives"]:
            click.echo(f"    FALSE POSITIVE  {item['rule']} {item['period']} {item['risk_key']}")
        for item in data["missed_detail"]:
            click.echo(
                f"    MISSED  {item['defect_type']} {item['period']} ({item['expected_rule']})"
            )
        extended = data.get("extended") or {}
        if extended.get("scored_planted"):
            # Precision only exists where a row-level extended rule ran. With
            # only the period-level ones enabled there is nothing to divide,
            # and printing 0.00 would read as "got them all wrong".
            precision = extended.get("precision")
            measured = (
                f"  precision {precision:.2f}  ({len(extended['false_positives'])} false positive)"
                if precision is not None
                else ""
            )
            click.echo(
                f"  extended key       {extended['detected']}/"
                f"{extended['scored_planted']} found{measured}"
            )
            for name, tally in sorted(extended["by_defect_type"].items()):
                state = "" if tally["rule"] in _enabled_note(extended) else "  [rule off]"
                click.echo(
                    f"    {name:<24} {tally['detected']:>2}/{tally['planted']:<2} "
                    f"({tally['rule']}){state}"
                )
            for rule_code, count in sorted(extended["period_rule_findings"].items()):
                click.echo(f"    {rule_code} fired in {count} period(s), not scored")
        elif extended.get("planted"):
            click.echo(
                f"  extended key       {extended['planted']} defects for rules that are "
                f"off: {', '.join(extended['rules_not_enabled'])}"
            )

        if report.unscored:
            unscored = ", ".join(
                f"{code} ({count})" for code, count in sorted(report.unscored.items())
            )
            click.echo(f"  rules with no planted defects, not scored: {unscored}")
        click.echo(f"  report written to {out}")


@cli.group("tally")
def tally_group() -> None:
    """Read a live Tally company over its XML gateway on port 9000.

    Read-only. Nothing here writes to a client's books.
    """


@tally_group.command("probe")
@click.option("--host", default="localhost", show_default=True)
@click.option("--port", default=9000, show_default=True, type=int)
def tally_probe(host: str, port: int) -> None:
    """List the companies currently open in Tally."""
    from diligence_engine.integrations import tally

    try:
        companies = tally.probe(host=host, port=port)
    except tally.TallyUnavailable as error:
        raise click.ClickException(str(error)) from error

    if not companies:
        click.echo("The gateway answered, but no company is open in Tally.")
        return
    click.echo(f"Tally is answering on {host}:{port}. Companies open:")
    for name in companies:
        click.echo(f"  {name}")


@tally_group.command("export")
@click.option("--company", required=True, help="Company name exactly as Tally shows it.")
@click.option("--from", "from_date", required=True, help="YYYY-MM-DD")
@click.option("--to", "to_date", required=True, help="YYYY-MM-DD")
@click.option("--voucher-type", default="Purchase", show_default=True)
@click.option("--out", type=click.Path(), default=None, help="Write a CSV here.")
@click.option("--host", default="localhost", show_default=True)
@click.option("--port", default=9000, show_default=True, type=int)
def tally_export(
    company: str,
    from_date: str,
    to_date: str,
    voucher_type: str,
    out: str | None,
    host: str,
    port: int,
) -> None:
    """Export vouchers into the same CSV shape the ingester already reads."""
    import csv as csv_module
    from datetime import date as date_type

    from diligence_engine.integrations import tally

    start = date_type.fromisoformat(from_date)
    end = date_type.fromisoformat(to_date)

    try:
        vouchers = tally.fetch_vouchers(
            company, start, end, voucher_type=voucher_type, host=host, port=port
        )
    except tally.TallyUnavailable as error:
        raise click.ClickException(str(error)) from error

    click.echo(f"{len(vouchers)} {voucher_type} vouchers between {start} and {end}")
    if not vouchers:
        return

    rows = tally.to_purchase_register_rows(vouchers)
    if out is None:
        for row in rows[:10]:
            click.echo("  " + " | ".join(row[:6]))
        if len(rows) > 10:
            click.echo(f"  ... {len(rows) - 10} more. Pass --out to write them all.")
        return

    with open(out, "w", newline="", encoding="utf-8") as handle:
        writer = csv_module.writer(handle)
        writer.writerow(tally.PURCHASE_REGISTER_HEADER)
        writer.writerows(rows)
    click.echo(f"Written to {out}")


@cli.group("user")
def user_group() -> None:
    """Create and list the people who can sign in."""


@user_group.command("create")
@click.option("--email", required=True)
@click.option("--name", "display_name", required=True)
@click.option("--role", default="member", type=click.Choice(["owner", "member", "readonly"]))
@click.option("--firm", default=None, help="Firm name. Defaults to the only firm present.")
@click.option(
    "--password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="At least 12 characters. Prompted for, so it stays out of shell history.",
)
def user_create(email: str, display_name: str, role: str, firm: str | None, password: str) -> None:
    """Create a user, or reset an existing one's password."""
    from diligence_engine import auth

    with connect() as conn:
        if firm:
            row = conn.execute(
                text("select id, name from firms where name = :name"), {"name": firm}
            ).first()
        else:
            rows = conn.execute(text("select id, name from firms order by name")).all()
            if len(rows) != 1:
                names = ", ".join(repr(entry.name) for entry in rows) or "none"
                raise click.ClickException(f"Pass --firm: there are {len(rows)} firms ({names}).")
            row = rows[0]

        if row is None:
            raise click.ClickException(f"No firm named {firm!r}.")

        try:
            auth.create_user(
                conn,
                firm_id=row.id,
                email=email,
                password=password,
                display_name=display_name,
                role=role,
            )
        except auth.AuthError as error:
            raise click.ClickException(str(error)) from error

    click.echo(f"{email} can now sign in to {row.name} as {role}.")


@user_group.command("list")
def user_list() -> None:
    """Who can sign in, and when they last did."""
    with connect() as conn:
        rows = conn.execute(
            text(
                "select u.email, u.display_name, u.role, u.is_active, u.last_login_at, "
                "       f.name as firm "
                "from users u join firms f on f.id = u.firm_id "
                "order by f.name, u.email"
            )
        ).all()

    if not rows:
        click.echo("No users yet. Create one with `diligence user create`.")
        return
    for row in rows:
        state = "" if row.is_active else "  (disabled)"
        seen = row.last_login_at.strftime("%d %b %Y") if row.last_login_at else "never"
        click.echo(f"  {row.email:<34} {row.role:<9} {row.firm:<22} last seen {seen}{state}")


@cli.command("audit")
@click.option("--limit", default=30, show_default=True)
def audit_cmd(limit: int) -> None:
    """The audit trail, newest first."""
    with connect() as conn:
        rows = conn.execute(
            text(
                "select a.at, a.action, a.object_type, a.object_id, "
                "       u.email, c.name as company "
                "from audit_log a "
                "left join users u on u.id = a.user_id "
                "left join companies c on c.id = a.company_id "
                "order by a.at desc limit :limit"
            ),
            {"limit": limit},
        ).all()

    if not rows:
        click.echo("Nothing recorded yet.")
        return
    for row in rows:
        who = row.email or "-"
        where = row.company or "-"
        click.echo(
            f"  {row.at:%d %b %H:%M}  {row.action:<22} {who:<30} {where:<20} "
            f"{row.object_type or ''} {row.object_id or ''}".rstrip()
        )


@cli.command("pipeline")
@click.pass_context
def pipeline_cmd(ctx: click.Context) -> None:
    """Run the whole thing end to end, in order."""
    ctx.invoke(migrate_cmd)
    ctx.invoke(seed_cmd, company=None)
    ctx.invoke(ingest_cmd, company=None)
    ctx.invoke(reconcile_cmd, company=None)
    ctx.invoke(ims_cmd, company=None)
    ctx.invoke(rules_cmd, company=None)
    ctx.invoke(evaluate_cmd, company=None)


# ── helpers ─────────────────────────────────────────────────────────────────


def _enabled_note(extended: dict) -> set[str]:
    """Rules the extended report actually scored, for labelling the rows."""
    off = set(extended.get("rules_not_enabled", []))
    return {tally["rule"] for tally in extended.get("by_defect_type", {}).values()} - off


def _selected(slug: str | None) -> list[dict]:
    if slug is None:
        return list(COMPANIES)
    chosen = [spec for spec in COMPANIES if spec["slug"] == slug]
    if not chosen:
        known = ", ".join(spec["slug"] for spec in COMPANIES)
        raise click.ClickException(f"Unknown company {slug!r}. Known: {known}")
    return chosen


def _company_id(conn: Connection, slug: str) -> uuid.UUID:
    company_id = stable_id("company", slug)
    row = conn.execute(text("select id from companies where id = :id"), {"id": company_id}).first()
    if row is None:
        raise click.ClickException(
            f"Company {slug!r} has not been ingested yet. Run `diligence ingest` first."
        )
    return row.id


# ── AWS ─────────────────────────────────────────────────────────────────────


@cli.group("bedrock")
def bedrock_group() -> None:
    """Amazon Bedrock: what this account can actually call."""


@bedrock_group.command("models")
@click.option("--region", default=None, help="Defaults to BEDROCK_REGION, then AWS_REGION.")
@click.option("--all", "show_all", is_flag=True, help="Every provider, not just Anthropic.")
def bedrock_models(region: str | None, show_all: bool) -> None:
    """List the models and inference profiles this account can invoke.

    The model id is not guessable and it is not stable across regions: the
    same model is `anthropic.claude-...` in one region, `apac.anthropic....`
    through an APAC inference profile, and simply absent in a third. Hard
    coding one into the application is how a deploy discovers, in front of an
    audience, that the region it landed in does not have it.

    So the deploy asks the account instead, and writes the answer into
    BEDROCK_MODEL_ID. Cross-region inference profiles are listed first
    because they are what a production deployment should use — they fail over
    to another region under load instead of throttling.
    """
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError

    where = region or settings().bedrock_region or settings().aws_region
    if not where:
        raise click.ClickException("No region. Pass --region, or set BEDROCK_REGION or AWS_REGION.")

    client = boto3.client("bedrock", region_name=where)
    click.echo(f"region {where}")

    try:
        profiles = client.list_inference_profiles().get("inferenceProfileSummaries", [])
    except (ClientError, NoCredentialsError) as error:
        raise click.ClickException(
            f"Bedrock refused the request: {error}. Check credentials, the region, "
            "and that model access has been granted in the Bedrock console."
        ) from error

    click.echo("\ncross-region inference profiles (prefer these):")
    found = False
    for profile in profiles:
        identifier = profile.get("inferenceProfileId", "")
        if not show_all and "anthropic" not in identifier:
            continue
        found = True
        click.echo(f"  {identifier:60} {profile.get('status', '')}")
    if not found:
        click.echo("  (none)")

    models = client.list_foundation_models().get("modelSummaries", [])
    click.echo("\non-demand foundation models:")
    found = False
    hidden = 0
    for model in models:
        identifier = model.get("modelId", "")
        if not show_all and not identifier.startswith("anthropic."):
            continue
        if "ON_DEMAND" not in (model.get("inferenceTypesSupported") or []):
            continue
        status = (model.get("modelLifecycle") or {}).get("status", "")
        # LEGACY is Bedrock's word for "announced for retirement", and a
        # legacy id is still returned by this call on the morning it stops
        # answering. One of them was this deployment's configured model on
        # 10 September 2026. Hiding them by default is the difference
        # between choosing a model and being handed one.
        if status != "ACTIVE" and not show_all:
            hidden += 1
            continue
        found = True
        warning = "" if status == "ACTIVE" else "   <- retiring, do not use"
        click.echo(f"  {identifier:60} {status}{warning}")
    if not found:
        click.echo("  (none — grant model access in the Bedrock console first)")
    if hidden:
        click.echo(f"  ({hidden} legacy or retiring model(s) hidden; --all shows them)")

    click.echo("\nSet the chosen id as BEDROCK_MODEL_ID, or leave it unset and let the")
    click.echo("application pick a live id at start-up. Nothing else needs to change.")


@cli.command("doctor")
def doctor_cmd() -> None:
    """Check every dependency this deployment needs, and say which is wrong.

    Written for the five minutes after a deploy, when something returns 503
    and the question is which of six things it is. Each line is independent:
    a failure does not stop the next check, because "the database is down
    AND the bucket is missing" is more useful than the first of the two.
    """
    failures = 0

    def report(name: str, ok: bool, detail: str) -> None:
        nonlocal failures
        if not ok:
            failures += 1
        click.echo(f"  {'ok  ' if ok else 'FAIL'}  {name:22} {detail}")

    config = settings()
    click.echo("configuration")
    click.echo(f"  storage backend       {config.storage_backend}")
    click.echo(f"  region                {config.aws_region or '(unset)'}")
    click.echo(f"  bedrock region        {config.bedrock_region or '(unset)'}")
    click.echo(f"  bedrock model         {config.bedrock_model_id or '(unset)'}")
    click.echo(f"  s3 bucket             {config.s3_bucket or '(unset)'}")

    click.echo("\nchecks")

    try:
        with connect() as conn:
            tables = conn.execute(
                text("select count(*) from information_schema.tables where table_schema = 'public'")
            ).scalar()
            companies = conn.execute(text("select count(*) from companies")).scalar()
        report("database", True, f"{tables} tables, {companies} companies")
    except Exception as error:  # noqa: BLE001 - the message is the output
        report("database", False, f"{type(error).__name__}: {error}")

    try:
        from diligence_engine import authz

        authz.self_test()
        report("cedar policy", True, f"{len(authz.ACTIONS)} actions, self-test passed")
    except Exception as error:  # noqa: BLE001
        report("cedar policy", False, f"{type(error).__name__}: {error}")

    if config.storage_backend == "s3":
        try:
            import boto3

            boto3.client("s3", region_name=config.aws_region or None).head_bucket(
                Bucket=config.s3_bucket
            )
            report("s3 bucket", True, f"{config.s3_bucket} reachable")
        except Exception as error:  # noqa: BLE001
            report("s3 bucket", False, f"{type(error).__name__}: {error}")
    else:
        report("object store", True, f"local disk at {config.storage_local_path}")

    # A real Converse call, not a listing. A retired model is still in the
    # catalogue, still allowed by IAM and still named by /api/health on the
    # morning it stops answering; the only check that catches it is one that
    # asks it something.
    if config.bedrock_model_id:
        try:
            import boto3

            boto3.client("bedrock-runtime", region_name=config.bedrock_region or None).converse(
                modelId=config.bedrock_model_id,
                messages=[{"role": "user", "content": [{"text": "Reply with the word ok."}]}],
                inferenceConfig={"maxTokens": 16, "temperature": 0},
            )
            report("bedrock", True, f"{config.bedrock_model_id} answered")
        except Exception as error:  # noqa: BLE001
            report("bedrock", False, f"{type(error).__name__}: {error}")
            click.echo(
                "        the application falls through to the next model this "
                "account offers; `diligence bedrock models` lists the live ones"
            )
    else:
        report(
            "bedrock",
            True,
            "BEDROCK_MODEL_ID unset - the application discovers a live id at start-up",
        )

    try:
        import strands  # noqa: F401

        report("strands agents", True, "installed")
    except ImportError:
        report("strands agents", False, "not installed; /ask is unavailable")

    if failures:
        raise click.ClickException(f"{failures} check(s) failed")
    click.echo("\neverything this deployment needs is reachable")


if __name__ == "__main__":
    cli()

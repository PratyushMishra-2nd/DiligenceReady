# DiligenceReady

Continuous reconciliation of books, GST and bank data for Indian SMEs, built for the
CA firms who do the work.

An SME's financial truth lives in three systems that never agree: the books (Tally),
the government's record (GSTR-2B), and the money (the bank). Reconciling them is
manual, monthly, done in Excel, and abandoned when it gets hard. This keeps them
agreeing, and keeps the evidence.

## The one architectural rule

**Deterministic code decides. The model only extracts and explains.**

Every rupee on screen is a SQL aggregate over the `matches` table. The model is
handed a finished risk object and writes the sentence explaining it; it never sees a
document, and it cannot produce a number. The boundary is structural rather than
conventional — `diligence_engine` imports no model client at all, and the one place
that calls Claude (`apps/api/.../explain.py`) checks every numeric token in the
generated prose against the numbers that went in, and rejects the prose if it
invented one.

## Running it

Requires Docker, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 20+.

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres on 5544
cp .env.example .env
uv sync

uv run diligence pipeline      # migrate, generate, ingest, reconcile, run rules, evaluate
uv run diligence user create --email you@firm.example --name "Your Name" --role owner

uv run uvicorn diligence_api.main:app --port 8077
cd apps/web && npm install && npm run dev          # http://localhost:3000
```

Sign in with the account you just created. There is no self-service signup,
because there is no self-service client data — a firm owner creates accounts with
`diligence user create`.

`diligence pipeline` is idempotent. Run it as often as you like; documents are keyed
by content hash and risks by a deterministic key, so nothing duplicates.

### The commands individually

| Command | What it does |
| --- | --- |
| `diligence migrate` | Apply pending SQL migrations |
| `diligence tables` | Every table with its row count |
| `diligence seed` | Generate two synthetic companies, their feeds, and the answer key |
| `diligence ingest` | Load the feeds into typed tables with provenance |
| `diligence reconcile` | Recompute every match |
| `diligence ims` | Compute the recommended accept / reject / pending for every IMS record |
| `diligence rule list / enable / disable` | Read or change the rule registry |
| `diligence rules` | Run every enabled rule over every period |
| `diligence evaluate` | Score the engine against the planted answer key |
| `diligence tally probe / export` | Read a live Tally company over its XML gateway |
| `diligence user create / list` | Manage the people who can sign in |
| `diligence audit` | The audit trail, newest first |

## What it found

On the seeded evaluation set, both companies:

```
planted               41
detected              41
recall              1.00
row-level rules    precision 1.00  (35/35 findings keyed, 0 false positives)
period-level rules  6/6 planted found
```

Synthetic and seeded, and disclosed as such. Ground truth lets the engine be
measured instead of asserted — these figures describe a dataset we designed, and
they are not a production accuracy claim.

Precision is measured on row-level rules only, where a finding is a property of one
record and the key is therefore complete by construction. Period-level rules compare
a month's aggregate against a threshold, which baseline data can cross without any
defect being injected, so recall is measured for them and every firing is listed
rather than scored. `seed/<company>/answers/evaluation.json` has the full report.

## Layout

```
packages/engine/           the whole pipeline; no model client anywhere in it
  normalise/               invoice numbers, party names, GSTINs, amounts, dates
  seedgen/                 one ground-truth ledger -> three divergent feeds + answer key
  ingest/                  column resolution, parsers, party resolution, storage
  matching/                GSTN's seven parameters and six categories
  rules/                   R1-R8 across GST, bank and commercial
  eval/                    measurement against the answer key
  reporting.py             every figure the interface shows
  integrations/            Tally XML gateway, read-only
apps/api/                  FastAPI; the only place a model is called
apps/web/                  Next.js dashboard, evidence drill-down, landing page
migrations/sql/            the schema, applied in order and hash-tracked
```

## Design decisions worth knowing before reading the code

**Typed financial tables, no EAV.** An entity-attribute-value store turns every rupee
into a string and makes each query a self-join — unacceptable in a system whose
entire output is arithmetic.

**Provenance on every row.** Every financial record carries `source_document_id` and
`source_row`; every risk carries evidence rows. Click a figure, land on the line of
the original file that produced it. That is not a feature, it is the product.

**Matching looks across periods.** An invoice missing from August's 2B often appears
in September's — the supplier filed late. A matcher confined to one period reports
every late filing as lost credit, and a CA who sees that once stops trusting the
tool. The seed data contains late-filed invoices deliberately, and they are
deliberately absent from the answer key: a matcher that cannot see across periods
will report them and the harness will show it as lost precision.

**GSTR-2B is sixteen tables, not one.** B2B, its amendments, credit and debit
notes, ISD credit, imports keyed on a bill of entry with no supplier at all, and
Sec 9(5) e-commerce supplies are each read with their own shape. Only B2B and B2BA
are matched against the purchase register — a credit note corrects an earlier
document rather than being one, and ISD credit never matches an invoice — and an
amendment supersedes the original it corrects, so neither becomes a phantom orphan.
The rest is reported separately as *other credit in this 2B*, because a credit note
that reduces the claim and is silently dropped makes the system overstate credit,
which is the one direction of error that costs a client money rather than time.

**Rule 37A is read, not inferred.** GSTR-2B carries a reversal amount GSTN computes
from the periods a supplier has not filed for. A heuristic that disagrees with the
government's own figure is a bug, not a feature.

**Severity ages.** One period unmatched is a watch item; two means chase the vendor;
three or more, or approaching the Sec 16(4) cut-off, is genuinely at risk. Severity
is never taken from a single month's snapshot.

**Money never touches a float**, in Python or in TypeScript. Amounts cross the API as
strings and the interface formats them without parsing them back.

**Column resolution, not per-vendor parsers.** A parser asks for a logical field and
`ingest/columns.py` finds it: `Voucher No`, `Bill No`, `Invoice Number` and
`invoice_no` are one column. Exact match first, then a case- and
punctuation-insensitive match, then failure — there is no fuzzy fallback, because
deciding that `Amount` means the taxable value rather than the invoice value is
exactly the silent wrong number this product exists to avoid. A header the layer does
not recognise raises an error naming the field it wanted, the spellings it tried, the
file's actual headers, and the file to add a synonym to.

That is what makes §09's "adapter, not rewrite" checkable. Tally, Busy, Marg, Zoho
and Vyapar purchase-register shapes, and HDFC, ICICI, SBI, Axis and Kotak statement
shapes, are covered by tests — as plausible reconstructions, not a verified
compatibility matrix. Week one is running real exports from three friendly CA firms
through it, and every layout that fails adds a name to a tuple and a case to the
suite.

## Access control

§14 week two, and the blueprint calls it non-negotiable: this is client financial
data. A firm sees its own clients and nothing else.

- **Sessions** are random tokens; only their sha256 is stored, so a database dump is
  a set of useless hashes rather than working credentials. Passwords are scrypt from
  the standard library, with cost parameters stored beside each digest so they can be
  raised later without a forced reset.
- **Firm scoping is a parameter, not a convention.** `reporting.firm_dashboard` takes
  a `firm_id` and every company lookup goes through `company_or_404`. A handler that
  forgets does not compile.
- **Another firm's company returns 404, not 403.** A 403 confirms the company exists,
  which is enough to enumerate a competitor's client list one guess at a time.
- **Login says one thing.** The same message for an unknown address, a wrong password
  and a disabled account, so the endpoint is not an account-existence oracle.
- **Roles**: owner, member, readonly. Reads are open to all three; uploads, decisions
  and explanations require write access.
- **The audit log is append-only** and records who did what to which company: sign in
  and out, uploads, decisions, generated explanations, and every time someone opens a
  client's raw document. It never stores a token, a password or document contents — a
  trail that leaks what it audits is worse than none.

Twelve tests cover this against the real app, including a second firm with its own
company so that "scoped correctly" can be distinguished from "not scoped at all".
Breaking the scope makes them fail; that was checked by breaking it.

**Not done, and not implied:** rate limiting on login, multi-factor, password reset,
and encryption at rest. The last is a deployment property — an encrypted volume or a
managed Postgres with encryption on — and the local object store writes plaintext
files to disk in development.

## Getting data in

```
POST /api/companies/{id}/documents     multipart: kind + file
```

Or from the company page in the app. Six kinds: purchase register, sales register,
receipts and payments, bank statement, GSTR-2B, IMS dashboard.

Periods are created from the file's own dates rather than assumed, because a row
silently dropped for belonging to an undeclared period is the kind of quiet data loss
that makes a figure wrong without making it look wrong. Re-uploading the same export
is a no-op: documents are content-addressed.

When a file cannot be read, the error names the column that was missing, the
spellings that were tried, the headers the file actually has, and the file to add a
synonym to. That message is the product surface for anyone whose export is unusual,
so it is passed through to the interface verbatim rather than replaced with "upload
failed".

## Continuous integration

`.github/workflows/ci.yml` runs lint, the full pipeline against a real Postgres, the
test suite, and the IMS domain switched on. It **asserts** the evaluation result
rather than printing it: a build that goes green while recall quietly drops from 1.00
is worse than no build at all.

## The IMS domain

The Invoice Management System went live on the GST portal in October 2024, and the
thing that matters about it is that **inaction is acceptance**. Whatever a supplier
files flows into the client's return unreviewed unless someone looks. For one company
with thirty invoices that is fine; for a firm carrying fifty clients it is the entire
problem, on a portal that displays a thousand rows at a time.

So the output is not a list of mismatches:

```
1806 records on the dashboard
  recommend accept    1715
  recommend reject       6
  recommend pending      8
  no recommendation     77  (supplier has not filed)
1590 would be deemed accepted if left alone
```

Four constraints from GSTN's advisory are enforced in the engine rather than left to
the interface: pending is barred on original credit notes and on certain amendments,
so it is never recommended; rejecting a credit note raises the supplier's liability
visibly and that warning travels with the recommendation; a record that is saved but
not filed is not yet actionable; and a credit note is resolved through the document
it corrects, never against a register row of its own — a recommender that expects one
would reject every legitimate purchase return in the file.

**The IMS rules ship disabled.** §15 names a practising CA reviewing the GST rule set
as the one outstanding dependency this project has, and IMS is where the statutory
detail is thickest. The code is written, tested and switched off:

```bash
uv run diligence rule list
uv run diligence rule enable R9 R10 R11 R13 R4b
uv run diligence rules
```

With them on, the extended answer key scores 13/13 at precision 1.00. That key is
kept separate from the forty-one on purpose — a number quoted on a slide should not
move when a domain is toggled.

R12 (filing chain blocked) stays silent on the seeded data, deliberately: its trigger
is a period whose prior GSTR-3B is unfiled, and the generator produces a complete
filing chain. Faking the flag to make a rule fire would be a lie told to a demo.

## Reading Tally directly

```bash
uv run diligence tally probe
uv run diligence tally export --company "Acme Industries" --from 2026-08-01 --to 2026-08-31
```

Read-only, over the XML gateway on port 9000 that Tally Prime exposes when "Act as
Server" is enabled. Describe it that way: there is no first-party Tally MCP server,
and calling it one gets caught. Output is shaped to match the purchase-register CSV
the ingester already reads, so a firm that connects Tally and a firm that uploads an
export go down the same normalisation, matching and evidence path.

The parser is covered by fixture tests, so it is verifiable with no Tally installed.
It has not been run against a live gateway here — there is no Tally on this machine,
and that is stated rather than implied.

## Scope

Eight rules run by default: R1–R4 (GST), R5–R6 (bank), R7–R8 (commercial). Six more
are implemented and disabled — the IMS domain (R9–R13) and the Rule 37A reclaim
(R4b), covered above.

Deliberately not built: vector database, knowledge graph, agent framework, generic
chatbot, contract analysis, MCA scraping, live GST API dependency, mobile app,
model-reported "confidence".

## Tests

```bash
uv run pytest        # 160 tests
uv run ruff check . && uv run ruff format --check .
cd apps/web && npx tsc --noEmit && npm run build
```

Some are integration tests that need an ingested database and skip without one; run
`uv run diligence pipeline` first to exercise them.

The normaliser suite is the load-bearing one: 40 cases pinning `norm_invoice_no`
against the spellings a Tally voucher series and a GSTR-2B use for the same document,
plus the traps — a genuine invoice number that looks like a financial year, and a
credit note that must never normalise into the invoice of the same number.

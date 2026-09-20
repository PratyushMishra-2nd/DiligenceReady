# DiligenceReady

**Continuous reconciliation of books, GST and bank data for Indian SMEs — built for the CA firms who do the work.**

[![CI](https://github.com/PratyushMishra-2nd/DiligenceReady/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
&nbsp;![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-1B2A2F)
&nbsp;![Next.js 14](https://img.shields.io/badge/next.js-14-1B2A2F)
&nbsp;![AWS](https://img.shields.io/badge/AWS-App%20Runner%20%C2%B7%20Lambda%20%C2%B7%20Bedrock-FF9900)
&nbsp;![License MIT](https://img.shields.io/badge/license-MIT-1B2A2F)

---

An SME's financial truth lives in three systems that never agree: the books (Tally),
the government's record (GSTR-2B), and the money (the bank). Reconciling them is
manual, monthly, done in Excel, and abandoned when it gets hard.

The consequence is a number. On the two seeded companies in this repository,
**₹16,25,635.64** of input tax credit has been paid to suppliers and cannot yet be
claimed, because the supplier's filing and the client's books disagree.
**₹5,17,412.74** of it sits on invoices whose Section 16(4) window closes on
30 November. After that date it stops being a receivable and becomes a cost.

DiligenceReady keeps the three sources agreeing, keeps the evidence, and puts a
deadline on the money.

## The one architectural rule

> **Deterministic code decides. The model only extracts and explains.**

Every rupee on screen is a SQL aggregate over the `matches` table. The model is
handed a finished risk object and writes the sentence explaining it; it never sees
a document and it cannot produce a number.

The boundary is structural rather than conventional, and it is enforced three ways:

| Enforcement | How |
| --- | --- |
| **Structural** | `diligence_engine` imports no model client at all. No rule, matcher or aggregate can reach one, even by accident. |
| **By input** | The model receives the finished finding — the figures the engine already computed. It has nothing to count. |
| **By output** | Every numeric token in generated prose is checked against the numbers that went in. A figure the model invented, or rounded differently, is rejected and the deterministic sentence is shown instead. |

That last check is [`numeric_guard.py`](apps/api/src/diligence_api/numeric_guard.py),
and it has no waiver. "About 4.8 lakh" for ₹4,82,000 fails. A total of two supplied
figures fails — because a sum nobody computed in SQL is a sum the accountant cannot
trace to a document.

## Who it is for

A CA firm, not an SME. An SME owner does not reconcile anything; their chartered
accountant does, monthly, and is already paid for it. One firm carries thirty to
eighty companies. The first screen is therefore the **firm's**, not a company's.

## Where AWS fits

Deployed on the **Ship It** stack. Every service below is load-bearing — nothing is
here to be counted.

```
  Amplify Hosting              App Runner                     RDS Postgres 17
  ┌────────────────┐          ┌──────────────────┐           ┌──────────────┐
  │  Next.js 14    │ ───────► │  FastAPI         │ ────────► │  private     │
  │  dashboard     │   HTTPS  │  + Cedar policy  │           │  subnets     │
  └────────────────┘          └────────┬─────────┘           └──────▲───────┘
                                       │                            │
                        ┌──────────────┼───────────────┐            │
                        ▼              ▼               ▼            │
                  S3 (documents)  Bedrock        Secrets Manager    │
                  gateway VPCe    Claude         (DB password)      │
                                  + Strands agent                   │
                                                                    │
  EventBridge ──► Step Functions ──► Lambda × 4 ────────────────────┘
   Scheduler       migrate → reconcile → ims → rules
   01:00 IST       (the same container image App Runner runs)
```

| Service | What it does here | Why this one |
| --- | --- | --- |
| **App Runner** | Serves the FastAPI engine | Long-lived process keeps a Postgres connection pool; no cold start mid-demo; one Dockerfile, no adapter |
| **Lambda** (container) | The four nightly pipeline stages | Runs minutes a night and scales to zero between — the opposite workload to the API, and the same image |
| **Step Functions** | Orchestrates the stages | Stages fail for different reasons; a retry should redo the failed stage, not the month. The execution history is the run log |
| **EventBridge Scheduler** | Fires it at 01:00 IST | The word "continuous" in the first sentence |
| **Amazon Bedrock** | Claude, for explanations and the agent | The only model path. No second provider |
| **Strands Agents SDK** | "Ask the ledger" | AWS's open-source agent SDK, over read-only engine tools |
| **Cedar** | The tenant boundary | AWS's open-source policy language. See below |
| **RDS Postgres 17** | Every figure | The product's claim is that each rupee is a SQL aggregate. DynamoDB cannot make that claim |
| **S3** | Content-addressed documents | Evidence drill-down needs the original bytes, forever |
| **Secrets Manager** | The database password | Generated and rotated by RDS; it appears in no template and no environment variable |
| **ECR** | The image | One image, two entry points |
| **CloudWatch** | Logs for both surfaces | Lambda and state-machine execution data |

### Why the nightly run finds anything

This is the part that justifies the schedule, and it is not "new files arrived".
The government's copy changes underneath you:

- A supplier files GSTR-1 on the 13th for an invoice dated the 2nd. It appears in
  next month's GSTR-2B, and an invoice that was unmatched yesterday is matched
  today. **On the seeded set, 12 invoices per company match only this way.**
- GSTN recomputes Rule 37A reversals as suppliers file — or fail to file — GSTR-3B.
- An IMS record nobody actioned moves one day closer to being deemed accepted.

A monthly reconciliation cannot see any of that until it is too late to act on it.

### Two AWS open-source projects, used for real

**Cedar** owns authorisation. [`policies.cedar`](packages/engine/src/diligence_engine/authz/policies.cedar)
is not documentation of a rule that lives elsewhere in Python — it *is* the rule,
evaluated on every request:

```cedar
permit (principal, action in [DR::Action::"ViewCompany", ...], resource)
when { resource has firm && resource.firm == principal.firm };
```

Deny-by-default, so a route added without a policy is refused rather than allowed.
The whole role × tenant matrix is
[tested](packages/engine/tests/test_authz_cedar.py) against the real evaluator with
no database and no HTTP. The API refuses to start if the policy fails to load.

**Strands Agents** powers *Ask the ledger*. A CA types a question; the agent chooses
which of the engine's read-only aggregates to call; the engine answers them. Then the
same numeric guard runs over the reply. Three things hold the line, none of them a
sentence in a prompt:

1. The company is a **closure, not a parameter** — no tool accepts a company id, so
   no prompt reaches another firm's books.
2. Tools return the **engine's own aggregates**, the same ones the dashboard shows.
3. Every number in the answer must appear in a tool result, or the answer is
   **refused and shown as refused**.

## What it found

On the seeded evaluation set, both companies:

```
planted               41
detected              41
recall              1.00
row-level rules    precision 1.00   (35/35 findings keyed, 0 false positives)
period-level rules  6/6 planted found
```

Synthetic and seeded, and disclosed as such. Ground truth lets the engine be
*measured* instead of asserted — these figures describe a dataset we designed, and
they are not a production accuracy claim. CI fails the build if recall drops.

Precision is measured on row-level rules only, where a finding is a property of one
record and the key is complete by construction. Period-level rules compare a month
against a threshold, so a firing the key does not list is a judgement call, not a
false positive; every firing is printed instead.

### Why synthetic data is the point, not a shortcut

Nobody hands a weekend project a real firm's ledgers. So the data is generated — and
because it is generated, **every defect in it is known in advance**: 41 per company,
planted deliberately, each with a type, a period and an expected rupee value.

That turns "does the engine work?" from an opinion into a number. It also caught real
bugs. One planted bank-timing gap was not detected, and the investigation found the
rule was right and the answer key was wrong — the plant was immaterial against a
₹9 crore month. The fix was to size the plant against the same base the rule uses,
not to lower the rule's threshold to make a test pass.

## The domain, taken seriously

| | |
| --- | --- |
| **GSTR-2B is sixteen tables, not one** | Modelling it as a flat invoice list flags legitimate amendments as duplicates and drops ISD, imports and e-commerce supplies entirely. The [reading order](packages/engine/src/diligence_engine/ingest/gstr2b_shape.py) lives in one place, walked by both the ingester and the drill-down |
| **Matching has seven parameters** | GSTIN, document type, number, date, taxable value and the four tax heads — with a per-head tolerance of 0 to 10 |
| **IMS went live in October 2024** | Inaction is now an action: an untouched record is *deemed accepted* when GSTR-3B is filed. The dashboard reports what that is worth in rupees — **₹3.03 Cr** on one seeded company |
| **Rejecting a credit note is a commercial act** | It raises the supplier's liability, and the supplier can see who did it. Any recommendation to reject carries that warning |
| **Never recommend what the portal refuses** | Pending is barred for original credit notes. A database CHECK enforces it, so an impossible recommendation cannot be stored |
| **Section 16(4)** | Credit lapses on 30 November following the financial year. The clock runs from the invoice date, not the month you noticed |
| **Money is `Decimal`, always** | `ROUND_HALF_UP`, never a float, and amounts cross the API as strings so JavaScript cannot round them |

## Running it locally

No AWS account required. Without Bedrock configured, explanations fall back to the
deterministic template — correct, just plainer — and the interface says which it is
showing.

Requires Docker, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 20+.

```bash
docker compose -f infra/docker-compose.yml up -d    # Postgres on 5544
cp .env.example .env
uv sync

uv run diligence pipeline      # migrate, generate, ingest, reconcile, rules, evaluate
uv run diligence user create --email you@firm.example --name "Your Name" --role owner

uv run uvicorn diligence_api.main:app --host :: --port 8077
cd apps/web && npm install && npm run dev           # http://localhost:3000
```

> `--host ::` is not optional. Node resolves `localhost` to `::1` first and does not
> fall back to IPv4, so an API bound only to `127.0.0.1` is reachable from the browser
> and **not** from Next's server components: sign-in works and every page then reports
> that the engine is not answering.

There is no self-service signup, because there is no self-service client data — a
firm owner creates accounts with `diligence user create`.

`diligence pipeline` is idempotent. Run it as often as you like; documents are keyed
by content hash and risks by a deterministic key, so nothing duplicates.

### The commands

| Command | What it does |
| --- | --- |
| `diligence migrate` | Apply pending SQL migrations (hash-checked) |
| `diligence tables` | Every table with its row count |
| `diligence seed` | Generate two synthetic companies, their feeds, and the answer key |
| `diligence ingest` | Load the feeds into typed tables with provenance |
| `diligence reconcile` | Recompute every match |
| `diligence ims` | Compute the recommended accept / reject / pending for every IMS record |
| `diligence rule list / enable / disable` | Read or change the rule registry |
| `diligence rules` | Run every enabled rule over every period |
| `diligence evaluate` | Score the engine against the planted answer key |
| `diligence doctor` | Check every dependency a deployment needs, and say which is wrong |
| `diligence bedrock models` | List the Bedrock models this AWS account can invoke |
| `diligence tally probe / export` | Read a live Tally company over its XML gateway |
| `diligence user create / list` | Manage the people who can sign in |
| `diligence audit` | The audit trail, newest first |
| `diligence pipeline` | The whole thing, in order |

## Deploying to AWS

```bash
aws configure                 # or: aws sso login
./infra/aws/deploy.sh         # ~15 minutes on a cold account
./infra/aws/teardown.sh       # deletes everything, including the NAT gateway
```

The script is idempotent: run it again after a code change and it rebuilds, pushes
and waits for the rollout. It discovers a Bedrock model id by asking the account
rather than hard-coding one, because the id differs by region and a wrong guess
fails at the worst possible moment.

Postgres has no route in from outside the VPC. That is the right call for other
people's books, and it also means there is no psql session from a laptop — so the
demo bootstrap runs *inside* the VPC, in the same container image, as a one-off
Lambda invoke.

Roughly **$2–3/day** while it is up. The two line items that bill whether or not
anyone visits are the NAT gateway and the RDS instance; `teardown.sh` removes both.

## Layout

```
packages/engine/     the reconciliation engine. Imports no model client, by design
  normalise/         GSTIN, invoice number and party-name normalisation
  ingest/            typed loaders with row-level provenance; S3 or local disk
  matching/          GST, bank and IMS matchers; the scoring function
  rules/             the rule registry — R1..R13, each toggleable
  authz/             Cedar policy. The tenant boundary, as policy
  eval/              scores the engine against the planted answer key
  seedgen/           the synthetic firm, and the ground truth
  aws_lambda.py      the pipeline as Step Functions stages
apps/api/            FastAPI. The only place a model is called
  explain.py         one finding, through Bedrock
  agent.py           "Ask the ledger", on Strands
  numeric_guard.py   the rule both of them obey
apps/web/            Next.js 14 dashboard, server components
migrations/sql/      hash-tracked schema migrations
infra/aws/           CloudFormation, deploy and teardown
```

~12,200 lines of Python, ~2,400 of TypeScript, ~730 of SQL, **228 tests**.

## Security

- **scrypt** password hashing (stdlib), session tokens stored as sha256 only
- Cedar-enforced firm scoping on every endpoint, deny-by-default
- A company in another firm returns **404, not 403** — a 403 confirms the company
  exists, which is enough to enumerate a competitor's client list one guess at a time
- Append-only audit log: who read which client's raw documents, and when. It stores
  no tokens, no passwords and no document contents, and its action list is an
  allow-list a [test](packages/engine/tests/test_audit_actions.py) keeps honest
- Failed logins are recorded, and recorded on their own connection so the refusal's
  rollback cannot discard them
- Login is constant-time against unknown addresses (measured 1.01×, previously ~40×)
- S3: TLS enforced by bucket policy, SSE-AES256, public access blocked
- Encryption at rest is a deployment property. RDS and S3 are encrypted by the
  templates here; the application does not claim to provide it

## Contributors

- **Dhruv Sharma** — [@Spiritsfuse](https://github.com/Spiritsfuse)
- **Anushika Chauhan** — [@Anushika06](https://github.com/Anushika06)
- **Pratyush Mishra** — [@PratyushMishra-2nd](https://github.com/PratyushMishra-2nd)

Built for the [WeMakeDevs × AWS First Commit](https://www.wemakedevs.org/aws) hackathon.

## Contributing

`docs/demo-script.md` walks the product end to end. Before opening a pull request:

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest
cd apps/web && npx tsc --noEmit && npm run build
```

CI runs all of it against a real Postgres, plus the full pipeline, and fails if the
evaluation's recall drops below 1.00. Tests that need a database skip silently
without one, which is precisely why CI provides one — a green tick that skipped the
tests that matter is worse than no CI at all.

## Licence

MIT. See [LICENSE](LICENSE).

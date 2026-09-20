# DiligenceReady

**Continuous reconciliation of books, GST and bank data for Indian SMEs — built for the CA firms who do the work.**

[![CI](https://github.com/PratyushMishra-2nd/DiligenceReady/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
&nbsp;![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-1B2A2F)
&nbsp;![Next.js 14](https://img.shields.io/badge/next.js-14-1B2A2F)
&nbsp;![AWS](https://img.shields.io/badge/AWS-EC2%20%C2%B7%20Lambda%20%C2%B7%20Bedrock-FF9900)
&nbsp;![License MIT](https://img.shields.io/badge/license-MIT-1B2A2F)

## Open it

### → **[main.d2iuitbi6z0hry.amplifyapp.com](https://main.d2iuitbi6z0hry.amplifyapp.com)**

| | |
| --- | --- |
| **Email** | `ca@mehta.example` |
| **Password** | `b5Lsnz0Hcj2hXKtq3UX3c1GF` |

That signs you into **Mehta & Associates**, a sample firm carrying two client
companies — Acme Industries and Vertex Components — with twelve months of books,
GST returns and bank statements behind each. The records are generated rather than
real, and [that is deliberate](#why-generated-books-are-the-point-not-a-shortcut):
it is the only way to know in advance what the engine is supposed to find.

---

An SME's financial truth lives in three systems that never agree: the books (Tally),
the government's record (GSTR-2B), and the money (the bank). Reconciling them is
manual, monthly, done in Excel, and abandoned when it gets hard.

The consequence is a number. Across the two companies in that workspace,
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

There is no self-service signup, because there is no self-service client data. A
firm owner creates each account, and every account belongs to exactly one firm.

## What you can do in it

| Screen | What it answers |
| --- | --- |
| **Firm dashboard** | Which of my clients needs attention this month, and how much money is on the line for each |
| **Company → Readiness** | How much of the purchase register reconciles against GSTR-2B and the bank, and what does not |
| **Findings** | Every exception the rule engine raised, by severity and by rupee value, each with the calculation behind it |
| **Evidence drill-down** | The original file, the row inside it, and the match that produced the figure |
| **IMS decisions** | Accept, reject or leave pending — and what "leave pending" is worth in rupees if GSTR-3B is filed first |
| **Ask the ledger** | A question in English, answered from the engine's own aggregates, with the queries it ran shown beside the answer |
| **Upload** | Drop a Tally, GSTR-2B or bank export in and the same pipeline reads it |
| **Lender package** | The whole month as one printable document |

## Where AWS fits

Every service below is load-bearing — nothing is here to be counted.

```
  Amplify Hosting (HTTPS)        EC2 (in-VPC API)            RDS Postgres 17
  ┌───────────────────────┐      ┌──────────────────────┐   ┌──────────────┐
  │  Next.js 14 Dashboard │───►  │  EC2 t3.small        │──►│  private     │
  │  SSR Rewrite Proxy    │ HTTP │  FastAPI + Cedar     │   │  subnets     │
  └───────────────────────┘      └──────────┬───────────┘   └──────▲───────┘
                                            │                      │
                             ┌──────────────┼───────────────┐      │
                             ▼              ▼               ▼      │
                       S3 (documents)    Bedrock       Secrets Manager
                       gateway VPCe      Claude        (DB password)
                                         + Strands
                                                                   │
  EventBridge ──► Step Functions ──► Lambda × 4 ───────────────────┘
   Scheduler       migrate → reconcile → ims → rules
   01:00 IST       (the same container image the EC2 runs)
```

| Service | What it does here | Why this one |
| --- | --- | --- |
| **EC2 + Next.js proxy** | Serves the FastAPI engine and the dashboard | EC2 runs inside the VPC, so the database socket is direct and needs no connector; Next.js on Amplify proxies `/api/*` server-side, so the browser only ever speaks HTTPS to Amplify and no TLS certificate is needed on the API host |
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
  today. **On this data set, 12 invoices per company match only this way.**
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

### The model layer is allowed to be absent

Bedrock retired the model this deployment was configured with on 10 September 2026,
which is a thing that will happen again. The application now resolves a live model
id at start-up rather than trusting one chosen at deploy time, drops a model that
returns a permanent error and takes the next, and reports what Bedrock actually
said rather than the class of the exception —
[`bedrock.py`](apps/api/src/diligence_api/bedrock.py).

When no model is reachable at all, explanations fall back to the deterministic
template, the interface says so in those words, and every figure on the page is
unaffected, because no figure ever came from a model.

## What it found

On the evaluation set, both companies:

```
planted               41
detected              41
recall              1.00
row-level rules    precision 1.00   (35/35 findings keyed, 0 false positives)
period-level rules  6/6 planted found
```

Generated and disclosed as such. Ground truth lets the engine be *measured* instead
of asserted — these figures describe a data set we designed, and they are not a
production accuracy claim. CI fails the build if recall drops.

Precision is measured on row-level rules only, where a finding is a property of one
record and the key is complete by construction. Period-level rules compare a month
against a threshold, so a firing the key does not list is a judgement call, not a
false positive; every firing is printed instead.

### Why generated books are the point, not a shortcut

Nobody hands a new product a real firm's ledgers. So the data is generated — and
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
| **IMS went live in October 2024** | Inaction is now an action: an untouched record is *deemed accepted* when GSTR-3B is filed. The dashboard reports what that is worth in rupees — **₹3.03 Cr** on one company in the sample workspace |
| **Rejecting a credit note is a commercial act** | It raises the supplier's liability, and the supplier can see who did it. Any recommendation to reject carries that warning |
| **Never recommend what the portal refuses** | Pending is barred for original credit notes. A database CHECK enforces it, so an impossible recommendation cannot be stored |
| **Section 16(4)** | Credit lapses on 30 November following the financial year. The clock runs from the invoice date, not the month you noticed |
| **Money is `Decimal`, always** | `ROUND_HALF_UP`, never a float, and amounts cross the API as strings so JavaScript cannot round them |

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
- Postgres has no route in from outside the VPC
- S3: TLS enforced by bucket policy, SSE-AES256, public access blocked
- Encryption at rest is a deployment property. RDS and S3 are encrypted by the
  templates here; the application does not claim to provide it

## Layout

```
packages/engine/     the reconciliation engine. Imports no model client, by design
  normalise/         GSTIN, invoice number and party-name normalisation
  ingest/            typed loaders with row-level provenance; S3 or local disk
  matching/          GST, bank and IMS matchers; the scoring function
  rules/             the rule registry — R1..R13, each toggleable
  authz/             Cedar policy. The tenant boundary, as policy
  eval/              scores the engine against the planted answer key
  seedgen/           the generated firm, and the ground truth
  aws_lambda.py      the pipeline as Step Functions stages
apps/api/            FastAPI. The only place a model is called
  explain.py         one finding, through Bedrock
  agent.py           "Ask the ledger", on Strands
  bedrock.py         which model id to call, resolved at run time
  numeric_guard.py   the rule all of them obey
apps/web/            Next.js 14 dashboard, server components
migrations/sql/      hash-tracked schema migrations
infra/aws/           CloudFormation, deploy and teardown
```

~12,400 lines of Python, ~2,400 of TypeScript, ~730 of SQL, **246 tests**.

CI runs ruff, the full test suite against a real Postgres, the whole pipeline, and a
TypeScript build, and fails if the evaluation's recall drops below 1.00. Tests that
need a database skip silently without one, which is precisely why CI provides one —
a green tick that skipped the tests that matter is worse than no CI at all.

## Contributors

- **Dhruv Sharma** — [@Spiritsfuse](https://github.com/Spiritsfuse)
- **Anushika Chauhan** — [@Anushika06](https://github.com/Anushika06)
- **Pratyush Mishra** — [@PratyushMishra-2nd](https://github.com/PratyushMishra-2nd)

## Licence

MIT. See [LICENSE](LICENSE).

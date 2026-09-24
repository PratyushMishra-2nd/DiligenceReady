# Demo script — the full walkthrough

Every figure below was read off the running system, not copied from a plan.
Re-run `uv run diligence pipeline` and they reproduce exactly; the generator is
seeded.

Last synced 24 September 2026 against the committed answer keys and the current
web app. The firm-level figures, the Sec 16(4) amount and the evaluation counts
are confirmed — `scripts/build_landing_aggregates.py` re-run over `seed/`
reproduces them byte for byte. The per-period figures marked *read it off the
screen* below could not be re-confirmed, because neither the deployed API
(`13.202.108.124:8080`) nor a local one answered on that day. Start the stack and
check them before you walk anyone through this.

This is the long version, for walking someone through the product. It runs
about four minutes and covers every screen.

---

## Before you start

```bash
docker compose -f infra/docker-compose.yml up -d
uv run diligence pipeline
uv run uvicorn diligence_api.main:app --host :: --port 8077
cd apps/web && npm run dev
```

`--host ::` matters. Node resolves `localhost` to `::1` first and does not fall
back to IPv4, so an API bound only to `127.0.0.1` is reachable from the browser
and not from Next's server components — sign-in works and every page then says
the engine is not answering.

Open `http://localhost:3000`. Press the demo button on the landing page — it
POSTs `/demo`, signs in as the seeded firm and lands on `/app`, so no password is
typed in front of anyone. Do not open a company first; the firm screen is the
point.

Set the theme before you start. The toggle is fixed in the bottom-left corner and
reads AUTO · LIGHT · DARK; `Auto` is the default and follows the machine's OS, so a
laptop in dark mode shows a dark product to a room that did not ask for one.

Against the deployed stack, skip all of the above and open the Amplify URL.

---

## 0:00 — The firm, not the company

**On screen:** Mehta & Associates. Two client companies, both closing August 2026.

> "This is a CA firm's dashboard, not a company's. That distinction is the whole
> go-to-market. An SME owner does not reconcile anything — their CA does, monthly,
> and already gets paid for it. One firm carries thirty to eighty companies."

**Point at the headline: ₹16,25,635.64**, under *Input tax credit with no GSTR-2B
counterpart*.

> "That is input tax credit these two businesses have already paid to suppliers
> and cannot yet claim, because the supplier's filing and the client's books
> disagree. ₹5,17,412.74 of it sits on invoices whose Sec 16(4) window closes on
> 30 November — sixty-seven days from now, across six findings. After that date it
> stops being a receivable and becomes a cost."

The day count is the screen's arithmetic, not the script's: the dashboard prints
"N days away" and recomputes it each load. Sixty-seven is 24 September. Say what is
on the screen.

That sentence is the pitch. It converts a data-hygiene problem into a rupee
figure with a deadline.

---

## 0:30 — Open Acme Industries, August 2026

**On screen:** the readiness card.

| Reconciled | | Exposed | |
| --- | --- | --- | --- |
| Purchase register against GSTR-2B | **96.1%** (146 of 152) | Input tax credit with no 2B counterpart | **₹2.59 L** |
| Bank statement against vouchers | **98.4%** (182 of 185) | Bank and books variance | **₹22,16,169.40** |
| | | Rule 37A reversal, reported by GSTN | **₹49,410.00** |
| | | Revenue with the top three customers | **60.99%** |

*Read it off the screen.* These are the figures the video script verified live on
20 September; the ITC-with-no-2B cell is the one nobody has re-read since. Two
controls sit in the header beside them and neither belongs in the walkthrough: a
sparkline of open findings per period, and a **period range**. Asking for a span of
months replaces this card with a range summary and takes the findings list, the IMS
panel and the other-ITC section off the page — every screen below is one month's.

> "Coverage on the left, exposure on the right, deliberately never on the same
> scale. Ninety-six per cent reconciled is good news. Twenty-two lakh unexplained
> is not. Putting them in one bar chart invites exactly the misreading a CA cannot
> afford."

---

## 1:00 — Click a finding

Open **Maruthi Electricals and Co · BILL3707**, ₹1,29,661.02, no 2B counterpart.
*Read the supplier, the document number and the amount off the list rather than
from this page — this one has not been re-read since 19 September, and the firm
headline from that run has moved since.* The safe alternative, verified and used by
the video script, is `DUPLICATE_PURCHASE — ₹2,97,827.28` in the same period. Do not
click the top row: `RECEIVABLES_AGEING` is period-level, has no single source row
and opens nothing.

**On screen:** the evidence panel.

> "The arithmetic first: CGST 64,830.51 plus SGST 64,830.51 equals 1,29,661.02 of
> credit with nothing behind it on the portal."

Point at the match score.

> "GSTIN: exact, 0.45. Document number: no candidate, zero. This supplier files —
> we match their other invoices — but the portal has no record of this document.
> That is a specific claim, and it is a deterministic score, not a probability.
> We never call it confidence, and the components always ship with the number."

---

## 1:40 — The drill-down

Scroll the panel to **Source document**.

**On screen:** `tally_purchase_register.csv · row 1754`, sha256 shown, the row
highlighted in the file with its neighbours above and below. (Row 1769 if you took
the duplicate instead — that pairing, ₹2,97,827.28 → row 1769, is the verified one.)

> "That is not a log entry saying we read the file. That is the file. Row 1754,
> the line the figure came from, with the hash of the document it lives in.
> Every financial row in this system carries its document and row number. That
> is not a feature — it is the product."

This is the moment the demo becomes real. Give it a beat.

---

## 2:10 — Explain this finding

Click **Explain this finding**.

> "The model didn't find this. A SQL query over the match table found it. The
> model only wrote that paragraph."

Then the part worth saying out loud:

> "And it cannot write a number. It is handed the finished finding — never a
> document, never a table — and every numeric token it produces is checked against
> the numbers that went in. If it rounds 4,82,000 to 'about 4.8 lakh', that fails
> the check and you see the deterministic text instead. You don't have to trust
> the model for the number."

---

## 2:40 — The bank variance

Open the **Bank and books do not agree for this period** finding.

**On screen:** the decomposition, in the shape
`books net … − bank net … = −22,16,169.40 [timing … | unidentified deposits … |
unidentified withdrawals … | unmatched book entries … | RESIDUAL 0.00]`.

*Read the buckets off the screen.* The total is the verified ₹22,16,169.40; the
split across the four named buckets was last written down against an earlier
generation and is not worth quoting from memory. The only part to say out loud
before you have looked is that the residual is zero.

> "The variance is decomposed into named buckets, and the residual is what we
> cannot attribute. Here it is zero — every rupee of the gap is accounted for by
> deposits nobody can identify and book entries the bank has not seen. When it is
> not zero, it says so. We label what we cannot explain instead of inventing a
> fourth category."

---

## 3:00 — The evaluation

Show `seed/acme-industries/answers/evaluation.json`, or read it out:

```
planted               41
detected              41
recall              1.00
row-level rules    precision 1.00  (35/35 findings keyed, 0 false positives)
period-level rules  6/6 planted found
```

> "Forty-one defects planted into the data before the feeds existed, from one
> ground-truth ledger. The engine found all forty-one and invented nothing.
>
> Say the next part plainly: this is synthetic and seeded, and we disclose it.
> Ground truth lets us measure the engine instead of manufacturing a success
> story. It proves the engine works on data we designed. It does not prove it
> works in production — week one after this exists for exactly that."

If a technical judge presses on precision:

> "Precision is measured on row-level rules only, where a finding is a property of
> one record so the key is complete by construction. Period-level rules compare a
> month's aggregate against a threshold, and baseline data can cross a threshold
> without any defect being injected — that is the rule working. We report those
> separately and list every firing rather than fold them into a ratio."

There is one more thing in that data worth mentioning unprompted:

> "The feeds also contain twelve invoices the supplier filed a month late. Those
> are deliberately **not** in the answer key. An invoice missing from August's 2B
> often appears in September's, and a tool that reports every late filing as lost
> credit gets closed after one use. Our matcher looks across periods and catches
> them; if it stopped looking, the harness would show it as lost precision."

---

## 3:15 — The domain that is switched off

Only if you have the time, and only in front of a judge who knows GST. This is
the strongest credibility beat in the deck and it costs thirty seconds.

```bash
uv run diligence rule list
```

**On screen:** six rules marked `off` — the IMS domain and the Rule 37A reclaim.

> "The Invoice Management System went live in October 2024, and inaction on it is
> deemed acceptance — whatever your supplier filed goes into your client's return
> unreviewed. That is the wedge, not the threat. We compute the recommended
> accept, reject or pending for every record: for August, 156 records, accept 140,
> reject 3, pending 4, and one that needs a person.
>
> Those rules are written, tested, and switched off. A practising CA reviewing the
> GST rule set is the one dependency we have not closed, and IMS is where the
> statutory detail is thickest — pending alone is prohibited in four distinct
> cases. Turning it on is this:"

```bash
uv run diligence rule enable R9 R10 R11 R13 R4b
```

> "Not a rewrite. A flag. And when it runs, its own answer key scores thirteen out
> of thirteen — kept separate from the forty-one, because a number on a slide
> should not move when you toggle a domain."

Turn it back off before the next rehearsal:
`uv run diligence rule disable R9 R10 R11 R13 R4b`

---

## 3:20 — Ask the ledger, and watch it refuse

Scroll to the **Ask the ledger** panel — it sits below the findings, the other-ITC
section, the IMS panel and the upload panel — and click a suggested question.
*"Why is the bank variance so high?"* is the one the video uses; the panel offers
four.

> "This is a Strands agent — AWS's open-source agent SDK. It chose
> which queries to run. It did not compute anything. Every figure in that
> sentence came out of one of the queries listed underneath it."

On which model answers, be precise: it runs on Bedrock where the account is allowed
to call one, and on a model hosted on the same EC2 instance where it is not — this
account is still under the new-account Bedrock hold, so `/api/health` should read
`ollama:qwen2.5:3b`. Same agent, same guard, either way, and answers take 15 to 50
seconds on two vCPUs. Talk over the wait rather than cutting to silence.

Now type the question that matters:

```
what is the combined total of the ITC at risk and the bank variance?
```

The panel refuses, and says why.

> "That sum is correct arithmetic, and it is still refused — because no query
> returned it, so I cannot trace it to a document. The model explains, the
> engine computes, and when the model strays the answer does not reach the
> accountant at all."

The same guard governs **Explain**. It is one module, `numeric_guard.py`, and
both paths obey it.

---

## 3:25 — Where AWS fits

Open the Step Functions console on a succeeded execution.

> "It reconciles every night at one in the morning: four Lambda stages under
> Step Functions, on an EventBridge schedule. It finds things not because new
> files arrived, but because the government's copy changed — a supplier files
> GSTR-1 late and the invoice lands in next month's 2B. On this dataset twelve
> invoices per company match only that way."

> "The API is a container on EC2 inside the VPC, so it holds a Postgres
> connection pool and the database has no route in from the internet. The
> nightly job is Lambda, so it scales to zero. Same container image, two entry
> points — so the overnight run and the dashboard cannot disagree about a
> rounding rule."

Cedar is worth thirty seconds if the audience is technical:

> "Authorisation is not Python scattered through the handlers. It is twenty
> lines of Cedar policy, AWS's open-source policy language, evaluated on every
> request and deny-by-default. A route added without a policy is refused, not
> allowed. The whole role-by-tenant matrix is tested without a database."

---

## 3:30 — The close

> "Month one this is reconciliation. Month eighteen it's a verified financial
> history no competitor can backfill — and when the lender asks, the package
> already exists."

Show the greyed-out **Generate lender-ready package** control. Labelled next, not
faked.

---

## 3:50 — Competitor honesty, unprompted

> "Clear owns GST against books. Perfios owns bank to lender, once, at
> application. Nobody joins all three continuously inside a CA's workspace. And
> to be straight about it: every one of them sits one integration away from
> closing that gap. The defence is not the engine — it is eighteen months of
> reconciled history per company, which cannot be backfilled. Month eighteen is
> the moat. Month one is not."

---

## Newer surfaces, if the walkthrough has room

None of these is load-bearing; each is thirty seconds at most.

- **Cmd/Ctrl-K, inside the findings list.** Every finding, period and client
  company reachable by typing three characters. A firm carries thirty to eighty
  companies, which is the argument for it.
- **The upload panel**, above Ask the ledger. It takes the client's own files and
  hands out a template per feed kind, so the answer to "what shape does my export
  have to be" is a download and not an email.
- **A span of months.** The period control in the company header sums a range —
  twelve months of readiness in one figure instead of a month at a time. Return to
  a single period before touching the findings.
- **`/tools/section-16-4`.** One rule, as a free utility with no signup: invoice
  date in, statutory cut-off out, on a URL that can be pasted into the group chat
  it was asked in. It is the engine's own rule, not a second copy of it.

---

## Questions you should expect

**"Why should I trust your AI?"**
> You don't have to. The number is a SQL aggregate over a match table. The model
> writes the sentence and is checked against the finding before you see it.

**"What about IMS?"**
> Live since October 2024, and it is the wedge rather than the threat — deemed
> acceptance means whatever the supplier filed flows into the client's return
> unreviewed. Five IMS rules are implemented and switched off, because a
> practising CA reviewing the GST rule set is the one dependency we have not
> closed. Turning them on is a flag, not a rewrite. The one place we were careful:
> a credit note is matched through the document it corrects, never against a
> register row of its own. A recommender that expects one would reject every
> legitimate purchase return — and rejecting a credit note raises your supplier's
> liability where they can see it.

**"Is the Tally integration real or a CSV upload?"**
> Both paths exist and they converge. `diligence tally probe` opens the XML gateway
> on port 9000 that Tally Prime exposes when Act as Server is on, and the export
> comes back in the same shape as the register CSV, so there is one ingestion path
> rather than two. It is read-only by choice — nothing writes to a client's books.
> Being straight: the parser is covered by fixture tests, and it has not been run
> against a live gateway on this machine because there is no Tally on it.

**"GSTN ships a free matching tool."**
> It does, and we built on its specification — the same seven parameters, six
> categories and per-head tolerance, using its vocabulary. It is also a desktop
> .exe needing admin rights, one profile per GSTIN, no multi-company view, and a
> rigid import template no real Tally export satisfies. A firm with fifty clients
> cannot use it. That gap is the product.

**"Could an SME build this with AI in a weekend?"**
> The naive matcher, yes — it is about two thousand lines. Not the hundred GST
> edge cases, not a normaliser hardened against real invoice chaos across
> thousands of vendors, and not the judgment about which mismatches resolve
> themselves. Depth is the defence.

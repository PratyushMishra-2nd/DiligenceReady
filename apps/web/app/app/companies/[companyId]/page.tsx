import Link from "next/link";
import { notFound } from "next/navigation";

import { EngineOffline } from "../../page";

import { AskLedger } from "../../../components/AskLedger";
import { Findings } from "../../../components/Findings";
import { ImsPanel } from "../../../components/ImsPanel";
import { LenderPackage } from "../../../components/LenderPackage";
import { OtherItc } from "../../../components/OtherItc";
import { PeriodRange } from "../../../components/PeriodRange";
import { RangeSummary } from "../../../components/RangeSummary";
import { ReadinessCard } from "../../../components/ReadinessCard";
import { Sparkline } from "../../../components/Sparkline";
import { UploadPanel } from "../../../components/UploadPanel";
import type {
  Company,
  CompanyCard,
  ImsSummary,
  OtherItcSummary,
  RangeSummary as Range,
  Readiness,
  Risk,
  SessionUser,
} from "../../../lib/api";
import { requireData } from "../../../lib/session";
import { periodLabel } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  // Next hands every search param as `string | string[]`, because a query
  // string is allowed to repeat a key. `app/sign-in/page.tsx` says this in as
  // many words — "declaring it `string` here would be a type that lies… the
  // first string method called on it throws" — and this file was written as
  // though it did not apply. It did: `?period=A&period=B` reached
  // `periodLabel(period)` with an array and threw `period.split is not a
  // function` out of the server render.
  searchParams: {
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
  };
}) {
  let company: Company;
  try {
    company = await requireData<Company>(`/api/companies/${params.companyId}`);
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    // Both digests, for the same reason the other three sites rethrow both:
    // neither is a failure of this fetch. `requireData` does not currently
    // throw NEXT_NOT_FOUND, but a guard that is right only by coincidence is
    // the kind that stops being right quietly.
    if (digest?.startsWith("NEXT_REDIRECT") || digest?.startsWith("NEXT_NOT_FOUND")) throw error;
    // Only 404 when the engine actually said so. Every other failure —
    // connection refused, a 500, a timeout, a proxy's HTML error page — used
    // to land here too, so an engine that was merely down rendered "Nothing is
    // filed at that address… Nothing has failed", which is false in exactly
    // that case and sends a CA hunting for a typo instead of restarting the
    // API.
    if ((error as { status?: number }).status === 404) notFound();
    return <EngineOffline />;
  }

  if (company.periods.length === 0) {
    notFound();
  }

  // Periods arrive newest first. The default is the newest one that has a
  // GSTR-2B, not simply the newest: 2B for month M generates on the 14th of
  // M+1, so a CA opening this on 20 September is working on August. A period
  // row appears as soon as any feed carries a date in it, and a couple of
  // bank value-dates spilling into the new month were enough to land the
  // page on an empty September showing 0.0% coverage.
  const reconciled = company.periods.filter((entry) => entry.gstr2b_generated);
  const fallback = reconciled[0]?.period ?? company.periods[0].period;

  // A span asked for in the URL, clamped to the months this company has. Both
  // ends must be present and well-formed: half a range is a mangled link, and
  // guessing the missing end would answer a question nobody asked. A span of
  // one month is not a span — it is the single-month page, which already has
  // a URL of its own.
  // One normalisation, before anything is read. A repeated key gives an
  // array, and every use below wants a string or nothing.
  const asked = single(searchParams.period);
  const span = spanFrom(
    { from: single(searchParams.from), to: single(searchParams.to) },
    company.periods,
  );

  // Validated, not merely present. The engine answers `where period = :period`
  // for any string at all and returns 200 with zero counts rather than a 404 —
  // so `?period=zzz` did not fail, it rendered a complete readiness card for a
  // month that does not exist, headed "undefined zzz". On a product whose
  // whole claim is provenance, inventing a month is worse than refusing one.
  const wanted = asked && PERIOD.test(asked) ? asked : undefined;
  const period = span ? span.to : (wanted ?? fallback);
  const chosenForYou = !span && !wanted && reconciled[0]?.period === period;

  const base = `/api/companies/${company.company_id}/periods/${period}`;
  /* `readiness` and `risks` carry no catch of their own, and they should not:
   * without them there is no page to render. What they were missing was
   * somewhere for the failure to LAND. An unreachable engine threw straight
   * out of the server render here and the reader got the bare "an error
   * occurred in the Server Components render" — while the firm dashboard, one
   * route up, has always caught exactly this and shown the engine-offline
   * screen with the commands to start it.
   *
   * Same treatment, same screen. `NEXT_REDIRECT` and `NEXT_NOT_FOUND` are
   * rethrown: `requireData` signals a lapsed session with the first and this
   * page signals an unknown company with the second, and neither is the
   * engine being down. */
  let range: Range | null;
  let readiness: Readiness;
  let risks: Risk[];
  let ims: ImsSummary | null;
  let other: OtherItcSummary | null;
  let firm: { companies: CompanyCard[] };
  let user: SessionUser | null;

  try {
    [range, readiness, { risks }, ims, other, firm, user] = await Promise.all([
      // The only fetch on this page that fires from a control rather than on
      // load, and the only one that had no catch on it — so a range the API
      // could not answer did not degrade the summary, it threw out of the
      // server render and took the whole page with it: readiness, findings,
      // evidence, the lot. Selecting a date span was the one way to reach it,
      // which is exactly when it was reported.
      //
      // A span summary is supplementary. Losing it falls back to the single
      // period view, which every branch below already handles, and the reader
      // is told rather than left wondering why the range they picked did
      // nothing. `NEXT_REDIRECT` still has to escape: `requireData` signals a
      // lapsed session by throwing one, and swallowing it here would replace a
      // sign-in with a silent empty panel.
      span
        ? requireData<Range>(
            `/api/companies/${company.company_id}/range?from=${span.from}&to=${span.to}`,
          ).catch((error: unknown) => {
            const digest = (error as { digest?: string }).digest;
            if (digest?.startsWith("NEXT_REDIRECT") || digest?.startsWith("NEXT_NOT_FOUND")) {
              throw error;
            }
            return null;
          })
        : Promise.resolve(null),
        requireData<Readiness>(`${base}/readiness`),
        requireData<{ risks: Risk[] }>(`${base}/risks`),
        soft(requireData<ImsSummary>(`${base}/ims`), null),
        soft(requireData<OtherItcSummary>(`${base}/other-itc`), null),
      // The command palette jumps between clients, so it needs the firm's book.
      // Fetched on the server beside everything else rather than by the browser
      // after paint: it is one more query on a page already making four.
        soft(requireData<{ companies: CompanyCard[] }>("/api/firm/dashboard"), {
        companies: [] as CompanyCard[],
      }),
        soft(requireData<SessionUser>("/api/me"), null),
    ]);
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (digest?.startsWith("NEXT_REDIRECT") || digest?.startsWith("NEXT_NOT_FOUND")) throw error;
    return <EngineOffline />;
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10 sm:px-10">
      {/* The way back up, and the only line on this page that names who the
          paper belongs to. The firm's name alone was already a link here, but
          a name is not an exit — nothing about it said that clicking it leaves
          this company, and a reader who came in from the dashboard had no
          visible route back to it. The destination is now spelled out in the
          link's own text rather than in an aria-label, so the mouse and the
          screen reader are told the same thing.

          Not `no-print`: the firm's name is the only attribution the filed
          sheet carries. The chevron is the part that is a control rather than
          a fact, so that is the part that comes off on paper. */}
      <nav aria-label="Breadcrumb" className="text-caption-13 text-ink-muted">
        <Link href="/app" className="group inline-flex items-center gap-2">
          <svg
            viewBox="0 0 8 10"
            aria-hidden
            className="no-print h-2.5 w-2 shrink-0 text-ink-subtle group-hover:text-ink"
          >
            <path d="M6 1L1 5l5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="mark-verb underline decoration-hairline underline-offset-4 group-hover:decoration-ink">
            {company.firm_name}
          </span>
          <span className="text-ink-subtle">· all client companies</span>
        </Link>
      </nav>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h1 className="leading-trim font-sans text-head-2 font-semibold leading-none text-ink">
            {company.name}
          </h1>
          <p className="mt-1 font-mono text-caption-13 text-ink-muted">
            {company.gstin} · PAN {company.pan}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {/* Thirteen open-finding counts, as a shape. Whether a book is
              getting better or worse is the firm's actual question about a
              client, and no single period answers it. */}
          <div className="flex items-center gap-2 text-ink-muted">
            <Sparkline
              points={[...company.periods]
                .reverse()
                .map((entry) => ({ period: entry.period, value: entry.open_risks }))}
            />
            <span className="text-caption-13 text-ink-subtle">open findings</span>
          </div>
          <PeriodRange
            companyId={company.company_id}
            periods={company.periods}
            from={span ? span.from : period}
            to={span ? span.to : period}
          />
        </div>
      </header>

      {/* Which month this is was decided for the reader, and nothing on the
          page used to say so. On 20 September these are August's figures
          because September's 2B does not exist yet, and a CA who assumes
          otherwise is reading the wrong month. One sentence, no pixels of
          permanent furniture. */}
      <p className="mt-6 max-w-[70ch] text-caption-13 text-ink-muted">
        Financial readiness ·{" "}
        {span ? `${periodLabel(span.from)} to ${periodLabel(span.to)}` : periodLabel(period)}
        {chosenForYou && (
          <span className="text-ink-subtle">
            {" "}
            (the latest period with a generated GSTR-2B; a month&rsquo;s 2B generates on
            the 14th of the month after it)
          </span>
        )}
      </p>

      {range ? (
        <RangeSummary range={range} companyId={company.company_id} />
      ) : (
        <div className="mt-3">
          {/* A span was asked for and could not be summed. Said plainly,
              because the alternative is a reader picking twelve months,
              getting one back, and having to work out for themselves whether
              the control is broken or the answer really is one month. */}
          {span && (
            <p className="mb-3 border-l-2 border-exposure bg-exposure-wash px-3 py-2 text-caption-13 text-exposure-deep">
              The engine could not sum {periodLabel(span.from, true)} to{" "}
              {periodLabel(span.to, true)}. Showing {periodLabel(period)} on its own.
            </p>
          )}
          <ReadinessCard readiness={readiness} />
        </div>
      )}

      {/* The findings are the work. Everything below them is context, a write
          path, or an aspiration, and each of those used to sit above the list
          — putting the only surface a CA acts on about four viewports down,
          behind a button that by design does nothing. */}
      {/* The working surfaces below are a month's, not a span's. A decision on
          a finding is taken with that month's GSTR-2B in front of you, the
          other-ITC sections and the IMS dashboard are both per-return, and an
          upload lands in the period its own dates put it in. In a span they
          would each be answering for a month the reader did not choose, so
          the span shows its index and sends them into the month instead. */}
      {!range && (
        <Findings
          risks={risks}
          period={period}
          company={company.name}
          companyId={company.company_id}
          periods={company.periods}
          companies={firm.companies}
          /* Unknown means no. `/api/me` is fetched softly, so a partial
             outage leaves `user` null — and defaulting to `true` there handed
             the write UI to a reader whose permissions could not be read.
             They press a decision and collect a 403 nobody warned them about.
             A reader wrongly shown read-only asks; a reader wrongly shown
             write is told no by the server. */
          canWrite={user?.can_write ?? false}
        />
      )}

      <div className="mt-10 border-t border-ink-subtle">
        {!range && other && <OtherItc other={other} />}

        {!range && ims && <ImsPanel ims={ims} />}

        {/* Not collapsed, and not grouped with the rest. A company with no
            documents has no findings, and this is the control that fixes
            that — it cannot be the thing hidden inside a closed drawer. */}
        <UploadPanel companyId={company.company_id} />

        <div className="no-print border-b border-ink-subtle py-8">
          <AskLedger companyId={company.company_id} />
        </div>

        {reconciled.length > 0 && (
          <LenderPackage
            periodsReconciled={reconciled.length}
            earliest={reconciled[reconciled.length - 1].period}
            latest={reconciled[0].period}
          />
        )}
      </div>
    </main>
  );
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A failure this page can carry on without.
 *
 * Returns `fallback` for anything environmental, and rethrows the two digests
 * that are not failures at all: `requireData` signals a lapsed session by
 * throwing `NEXT_REDIRECT`, and this page signals an unknown company with
 * `NEXT_NOT_FOUND`. A plain `.catch(() => null)` swallows both — which turns a
 * sign-in into an empty panel and a 404 into a half-rendered page.
 */
function soft<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((error: unknown) => {
    const digest = (error as { digest?: string }).digest;
    if (digest?.startsWith("NEXT_REDIRECT") || digest?.startsWith("NEXT_NOT_FOUND")) {
      throw error;
    }
    return fallback;
  });
}

/**
 * A search param as the one value the page can use.
 *
 * A query string may repeat a key, so Next types every param `string |
 * string[]`. Taking the last occurrence rather than the first matches how a
 * browser treats a repeated form field, and returning `undefined` for an empty
 * array keeps every caller on one shape.
 */
function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[value.length - 1];
  return value;
}

/**
 * The span the URL is asking for, or null for the ordinary one-month page.
 *
 * Every rejection here lands on the single-month view rather than on an error,
 * because each one describes a link that is wrong rather than a reader who is:
 *
 * *   **One end missing.** `?from=` alone does not mean "to the end of time";
 *     it means the link lost half of itself in a chat client.
 * *   **Not a period.** These reach a `between` in SQL. The API validates them
 *     too — this is the copy that keeps a mangled link from becoming a 400 on
 *     a page a reader is already looking at.
 * *   **Reversed.** April to January is not a span.
 * *   **Outside the books.** Clamped to the months this company has rather
 *     than refused, so a range pasted between two clients still resolves to
 *     the overlapping part instead of to an empty table.
 * *   **One month wide.** That is not a range, it is the page this already is,
 *     and it has a shorter URL.
 */
function spanFrom(
  searchParams: { from?: string; to?: string },
  periods: { period: string }[],
): { from: string; to: string } | null {
  const { from, to } = searchParams;
  if (!from || !to) return null;
  if (!PERIOD.test(from) || !PERIOD.test(to)) return null;
  if (from > to) return null;

  // Periods arrive newest first.
  const newest = periods[0].period;
  const oldest = periods[periods.length - 1].period;
  const start = from < oldest ? oldest : from;
  const end = to > newest ? newest : to;

  if (start > end) return null;
  if (start === end) return null;
  return { from: start, to: end };
}

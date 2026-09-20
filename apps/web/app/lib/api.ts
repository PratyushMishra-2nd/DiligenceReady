/**
 * Every figure the interface shows comes from the engine, unchanged.
 *
 * Amounts arrive as strings on purpose: a rupee that passes through a
 * JavaScript number has been rounded by a float, and this product's whole
 * claim is that its arithmetic is exact. Nothing here parses them back.
 */

/**
 * Where the engine answers.
 *
 * In production (Amplify): NEXT_PUBLIC_API_BASE is set to "" (empty string).
 * API calls go to the same Amplify origin (https://main.xxx.amplifyapp.com/api/...)
 * and Next.js rewrites() proxies them server-side to the EC2 HTTP backend.
 * The browser never talks directly to EC2, so there is no mixed-content issue.
 *
 * In local development: leave NEXT_PUBLIC_API_BASE unset; it defaults to
 * http://localhost:8077 (what `uv run uvicorn ... --port 8077` listens on).
 *
 * `NEXT_PUBLIC_*` is substituted at build time, not read at runtime, so a
 * deployment has to set it before `next build`. Setting it in the runtime
 * environment afterwards does nothing.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE &&
  process.env.NEXT_PUBLIC_API_BASE !== "/" &&
  process.env.NEXT_PUBLIC_API_BASE !== "same-origin"
    ? process.env.NEXT_PUBLIC_API_BASE
    : (process.env.NODE_ENV === "production" ? "" : "http://localhost:8077");

export type CompanyCard = {
  company_id: string;
  name: string;
  gstin: string;
  firm_name: string;
  period: string;
  gst_coverage_pct: string;
  bank_coverage_pct: string;
  open_risks: number;
  high_risks: number;
  itc_at_risk: string;
  next_sec_16_4_deadline: string | null;
  itc_before_next_deadline: string;
  findings_before_next_deadline: number;
  bank_variance: string;
  period_open_risks: number;
};

export type PeriodSummary = {
  period: string;
  status: string;
  gstr2b_generated: boolean;
  gstr3b_filed: boolean;
  gstr2b_stale: boolean;
  filing_frequency: string;
  open_risks: number;
};

export type Company = {
  company_id: string;
  name: string;
  gstin: string;
  pan: string;
  fy_start: string;
  firm_name: string;
  periods: PeriodSummary[];
};

export type Readiness = {
  period: string;
  gst_coverage_pct: string;
  gst_matched: number;
  gst_total: number;
  bank_coverage_pct: string;
  bank_matched: number;
  bank_total: number;
  itc_at_risk: string;
  itc_mismatch: string;
  itc_reversal_37a: string;
  bank_variance: string;
  unidentified_deposits: string;
  concentration_pct: string | null;
  receivables_aged_pct: string | null;
  open_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
};

export type OtherItcGroup = {
  section: string;
  label: string;
  note_type: string | null;
  documents: number;
  taxable: string;
  tax: string;
};

export type OtherItcSummary = {
  period: string;
  groups: OtherItcGroup[];
  net_note_adjustment: string;
  /**
   * What these sections do to the claim, taken together and signed: credit
   * notes reduce it, debit notes increase it, everything else adds.
   *
   * The engine computes it. Summing `groups[].tax` here instead is off by
   * twice the credit-note tax, in the direction that overstates available
   * credit.
   */
  claimable_tax: string;
};

export type ImsSummary = {
  period: string;
  total: number;
  accept: number;
  reject: number;
  pending: number;
  decide: number;
  not_filed: number;
  deemed_accepted: number;
  deemed_accepted_value: string;
  reject_raises_liability: number;
  pending_barred: number;
};

export type Risk = {
  risk_id: string;
  rule_code: string;
  title: string;
  domain: string;
  risk_key: string;
  severity: "high" | "medium" | "low" | "info";
  headline_amount: string | null;
  headline_pct: string | null;
  calculation: string;
  rule_text: string;
  explanation: string | null;
  status: string;
  metrics: Record<string, unknown>;
  evidence_count: number;
};

export type EvidenceItem = {
  evidence_id: string;
  record_type: string;
  record_id: string;
  document_id: string | null;
  filename: string | null;
  source_row: number | null;
  note: string | null;
};

export type MatchBreakdown = {
  match_score: string | null;
  match_method: string;
  status: string;
  score_breakdown: Record<string, number> | null;
  amount_delta: string | null;
  date_delta_days: number | null;
};

export type RiskDetail = {
  risk: Risk & { company_name: string; period: string; thresholds: Record<string, unknown> };
  match: MatchBreakdown | null;
  evidence: EvidenceItem[];
};

export type SourceLine = {
  filename: string;
  sha256: string;
  kind: string;
  source_row: number;
  header?: string;
  line: string;
  context: { row: number; text: string; is_target: boolean }[];
  error?: string;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail ?? `${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Wait for a job the API started on our behalf.
 *
 * The model runs on the API instance now, so an explanation is tens of
 * seconds and a ledger question is often a minute. The Amplify rewrite
 * proxy that carries every /api call closes a request at about thirty, so
 * the slow endpoints hand back a job id instead of an answer and this polls
 * for it. Each hop is a few milliseconds; only the wall clock is long.
 *
 * `onWait` is how the panel can say how long it has been, because a minute
 * with no feedback reads as broken.
 */
type Started = { job_id: string; status: string };

async function settle<T>(
  started: Started,
  onWait?: (seconds: number) => void,
): Promise<T> {
  // Two seconds is the compromise: a 20-second answer is seen within 10% of
  // when it landed, and a 3-minute one costs 90 requests, all of them a
  // dictionary lookup on the API side.
  const every = 2000;
  const ceiling = 6 * 60 * 1000;
  const began = Date.now();

  for (;;) {
    const state = await get<
      Started & { elapsed_seconds?: number; error?: string } & Record<string, unknown>
    >(`/api/jobs/${started.job_id}`);

    if (state.status === "done") return state as unknown as T;
    if (state.status === "failed") {
      throw new Error(state.error ?? "The engine could not complete that.");
    }
    if (Date.now() - began > ceiling) {
      throw new Error("The model is taking longer than six minutes. Ask again.");
    }

    onWait?.(Math.round((Date.now() - began) / 1000));
    await new Promise((resume) => setTimeout(resume, every));
  }
}

export const api = {
  base: API_BASE,
  firmDashboard: () => get<{ companies: CompanyCard[] }>("/api/firm/dashboard"),
  company: (id: string) => get<Company>(`/api/companies/${id}`),
  readiness: (id: string, period: string) =>
    get<Readiness>(`/api/companies/${id}/periods/${period}/readiness`),
  risks: (id: string, period: string) =>
    get<{ risks: Risk[] }>(`/api/companies/${id}/periods/${period}/risks`),
  otherItc: (id: string, period: string) =>
    get<OtherItcSummary>(`/api/companies/${id}/periods/${period}/other-itc`),
  ims: async (id: string, period: string): Promise<ImsSummary | null> => {
    // A period with no IMS dashboard is an ordinary state, not an error: the
    // domain is off, or the feed predates October 2024.
    const response = await fetch(`${API_BASE}/api/companies/${id}/periods/${period}/ims`, {
      cache: "no-store",
      credentials: "include",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`ims returned ${response.status}`);
    return response.json() as Promise<ImsSummary>;
  },
  signIn: (email: string, password: string) =>
    post<{ token: string; user: { display_name: string; role: string } }>(
      "/api/session",
      { email, password },
    ),
  signOut: () => post<{ status: string }>("/api/session/end"),
  setRiskStatus: (riskId: string, status: string, note?: string) =>
    post<{ risk_id: string; status: string; previous: string }>(
      `/api/risks/${riskId}/status`,
      { status, note: note ?? null },
    ),
  riskDetail: (riskId: string) => get<RiskDetail>(`/api/risks/${riskId}`),
  ask: async (
    companyId: string,
    question: string,
    onWait?: (seconds: number) => void,
  ): Promise<LedgerAnswer> => {
    const started = await post<Started>(`/api/companies/${companyId}/ask`, { question });
    return settle<LedgerAnswer>(started, onWait);
  },
  evidenceSource: (evidenceId: string) =>
    get<SourceLine>(`/api/evidence/${evidenceId}/source`),
  explain: async (riskId: string, onWait?: (seconds: number) => void) => {
    const response = await fetch(`${API_BASE}/api/risks/${riskId}/explain`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error(`explain returned ${response.status}`);
    const started = (await response.json()) as Started;
    return settle<{
      explanation: string;
      source: "model" | "template";
      model: string | null;
      rejected_reason: string | null;
    }>(started, onWait);
  },
};

/**
 * What the Strands agent returned, and whether it was allowed through.
 *
 * `refused` is not an error state. It means the agent produced a figure no
 * query returned - usually a total it computed itself - and the API stopped
 * it. The interface shows that as prominently as an answer, because the
 * reader needs to know the guard exists and fired.
 */
export type LedgerAnswer = {
  answer: string;
  source: "agent" | "refused" | "unavailable";
  model: string | null;
  tools_called: string[];
  rejected_reason: string | null;
};

export type SessionUser = {
  email: string;
  display_name: string;
  role: string;
  firm: string;
  can_write: boolean;
};

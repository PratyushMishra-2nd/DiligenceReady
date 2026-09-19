/**
 * Presentation only. Every value arriving here was computed by the engine and
 * is formatted as a string — never parsed into a number, never rounded, never
 * recomputed. A display layer that does arithmetic is a second source of truth.
 */

/** Indian digit grouping: 4,82,000.00, not 482,000.00. */
export function inr(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";

  const negative = amount.trim().startsWith("-");
  const [whole, fraction = "00"] = amount.replace("-", "").split(".");

  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const tail = whole.slice(-3);
    let head = whole.slice(0, -3);
    const parts: string[] = [];
    while (head.length > 2) {
      parts.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) parts.unshift(head);
    grouped = [...parts, tail].join(",");
  }

  return `${negative ? "−" : ""}₹${grouped}.${fraction}`;
}

/** Lakh and crore, for figures a person reads rather than reconciles. */
export function inrShort(amount: string | null | undefined): string {
  if (!amount) return "—";
  const value = Math.abs(Number(amount));
  if (!Number.isFinite(value)) return inr(amount);
  const sign = amount.trim().startsWith("-") ? "−" : "";
  if (value >= 1_00_00_000) return `${sign}₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `${sign}₹${(value / 1_00_000).toFixed(2)} L`;
  return inr(amount);
}

/**
 * Add decimal strings without going through a float. Paise as BigInt, back to
 * a string. The one place the interface does arithmetic, and it is exact.
 */
export function sumInr(values: (string | null | undefined)[]): string {
  let paise = 0n;
  for (const value of values) {
    if (!value) continue;
    const negative = value.trim().startsWith("-");
    const [whole, fraction = ""] = value.replace("-", "").trim().split(".");
    const amount = BigInt(whole || "0") * 100n + BigInt((fraction + "00").slice(0, 2));
    paise += negative ? -amount : amount;
  }
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function pct(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}%`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** '2026-08' reads as 'August 2026' to a person and sorts as a string to a machine. */
export function periodLabel(period: string, short = false): string {
  const [year, month] = period.split("-");
  const name = MONTHS[Number(month) - 1] ?? month;
  return short ? `${name} ${year.slice(2)}` : `${name} ${year}`;
}

export function severityTone(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-exposure-wash text-exposure border-exposure/30";
    case "medium":
      return "bg-[#FBF3E2] text-[#8A5A16] border-[#8A5A16]/25";
    case "low":
      return "bg-paper text-ink-soft border-rule-strong";
    default:
      return "bg-paper text-ink-faint border-rule";
  }
}

/**
 * What a finding is *about*, in the words a CA would use to find it again.
 *
 * The rule sentence explains the rule and reads identically on every instance
 * of it; five duplicate findings in a row all saying "same supplier and
 * document number booked more than once" is a wall, not a list. The supplier
 * and the document are what someone scans for, so they lead.
 */
export function subject(risk: {
  rule_code: string;
  metrics: Record<string, unknown>;
  rule_text: string;
}): string {
  const metrics = risk.metrics ?? {};
  const supplier = (metrics.supplier_name as string) ?? "";
  const document = (metrics.invoice_no as string) ?? "";

  switch (risk.rule_code) {
    case "R1":
    case "R2":
    case "R3":
    case "R4":
      return [supplier, document].filter(Boolean).join(" · ") || risk.rule_text;
    case "R5":
      return "Bank and books do not agree for this period";
    case "R6": {
      const narration = (metrics.narration as string) ?? "";
      return narration ? `Unattributed credit — ${narration}` : "Unattributed bank credit";
    }
    case "R7":
      return "Revenue concentrated in the top three customers";
    case "R8":
      return "Receivables have aged past the 90-day bucket";
    case "R9":
      return "Records on the dashboard nobody has actioned";
    case "R10":
    case "R13":
      return [supplier, document].filter(Boolean).join(" · ") || risk.rule_text;
    case "R11":
      return "GSTR-2B needs recomputing before these figures are current";
    case "R12":
      return "The previous period's GSTR-3B is unfiled";
    case "R4b":
      return [supplier, document].filter(Boolean).join(" · ") || risk.rule_text;
    default:
      return risk.rule_text;
  }
}

/** One short phrase naming the problem, for the severity row. */
export const RULE_LABEL: Record<string, string> = {
  R1: "No 2B counterpart",
  R2: "Value differs from 2B",
  R3: "Booked twice",
  R4: "Rule 37A reversal",
  R4b: "Reversal reclaimable",
  R5: "Bank variance",
  R6: "Unidentified deposit",
  R7: "Customer concentration",
  R8: "Receivables ageing",
  R9: "IMS action required",
  R10: "Recommend reject",
  R11: "GSTR-2B stale",
  R12: "Filing chain blocked",
  R13: "Blocked credit, Sec 17(5)",
};

export const DOMAIN_LABEL: Record<string, string> = {
  gst: "GST and input tax credit",
  bank: "Bank against books",
  commercial: "Commercial",
  ims: "Invoice Management System",
};

/** What the filter chip says. A chip is three or four characters of room. */
export const DOMAIN_CHIP: Record<string, string> = {
  gst: "GST",
  bank: "Bank",
  commercial: "Commercial",
  ims: "IMS",
};

/**
 * A statutory date is never derived here. The engine reads each invoice's
 * Sec 16(4) cut-off onto the finding, and the interface only formats it and
 * counts the days left. Two places deriving the same deadline is two places
 * for it to be wrong, and the wrong one would be the one on screen.
 */
export function deadline(iso: string | null | undefined, today = new Date()) {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return {
    label: `${day} ${MONTHS[month - 1]} ${year}`,
    days: Math.round((date.getTime() - midnight.getTime()) / 86_400_000),
  };
}

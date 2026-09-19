"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { API_BASE } from "../lib/api";

/**
 * Upload an export.
 *
 * Until this existed, the only way to get data into the system was the
 * seed generator — which made it a demo rather than a tool.
 *
 * The important part is the failure. A CA's first upload is very often the
 * wrong file or the right file from a package we have not seen, and the API
 * answers that with a message naming the column it wanted, the headers the
 * file actually has, and where a synonym goes. That message is shown here
 * in full rather than replaced with "Upload failed", because it is the only
 * thing that tells someone what to do next.
 */

const KINDS = [
  { value: "purchase_register", label: "Purchase register", accept: ".csv" },
  { value: "gstr2b", label: "GSTR-2B", accept: ".json" },
  { value: "bank_stmt", label: "Bank statement", accept: ".csv" },
  { value: "sales_ledger", label: "Sales register", accept: ".csv" },
  { value: "ledger", label: "Receipts and payments", accept: ".csv" },
  { value: "ims", label: "IMS dashboard", accept: ".json" },
];

type Outcome = {
  ok: boolean;
  message: string;
  detail?: string;
};

export function UploadPanel({ companyId }: { companyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(KINDS[0].value);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const accept = KINDS.find((entry) => entry.value === kind)?.accept ?? ".csv";

  async function send(file: File) {
    setBusy(true);
    setOutcome(null);

    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/api/companies/${companyId}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setOutcome({
          ok: false,
          message:
            response.status === 403
              ? "This account has read-only access."
              : "That file could not be read.",
          detail: body.detail,
        });
        return;
      }

      setOutcome({
        ok: true,
        message: body.already_present
          ? `${body.filename} was already ingested — nothing changed.`
          : `${body.filename}: ${body.rows} rows across ${body.periods.join(", ")}.`,
        detail: body.already_present
          ? "Documents are keyed by content, so uploading the same export twice is a no-op."
          : "Re-run reconcile and the rules to see what changed.",
      });
      router.refresh();
    } catch (error) {
      setOutcome({
        ok: false,
        message: "Could not reach the engine.",
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="border-b border-rule-strong py-8">
      <h2 className="text-data font-semibold">Add a document</h2>
      <p className="mt-2 max-w-[70ch] text-body leading-relaxed text-ink-soft">
        A register from Tally, Busy, Marg, Zoho or Vyapar, a GSTR-2B download, or a bank
        statement. Column names differ between packages and are resolved on the way in;
        if one cannot be, the error says which and what the file calls it instead.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-body">
          <span className="sr-only">Document type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="border border-rule-strong bg-sheet px-3 py-2 text-body focus:border-ink focus:outline-none"
          >
            {KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
          className="text-body file:mr-3 file:cursor-pointer file:border file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:text-body file:font-medium hover:file:bg-ink hover:file:text-paper"
        />

        {busy && <span className="text-micro text-ink-soft">Reading…</span>}
      </div>

      {outcome && (
        <div
          role="status"
          className={`mt-4 border px-4 py-3 text-data leading-relaxed ${
            outcome.ok
              ? "border-reconciled/30 bg-reconciled-wash text-ink"
              : "border-exposure/30 bg-exposure-wash text-ink"
          }`}
        >
          <p className="font-medium">{outcome.message}</p>
          {outcome.detail && (
            <p className="mt-1.5 whitespace-pre-wrap text-ink-soft">{outcome.detail}</p>
          )}
        </div>
      )}
    </section>
  );
}

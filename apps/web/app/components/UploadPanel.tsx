"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { API_BASE } from "../lib/api";

/**
 * Upload an export.
 *
 * Until this existed, the only way to get data into the system was the
 * seed generator — which made it an exhibit rather than a tool.
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

/**
 * What one kind of upload is supposed to look like, as the engine describes
 * itself.
 *
 * Fetched rather than written here on purpose. The required-column list and
 * the header row of the file behind `download` are both generated from
 * `ingest/columns.py`, so a column renamed there is renamed in this panel
 * without anyone remembering to come back. A copy kept in this file would be
 * a second source of truth about the one thing a first upload turns on, and
 * it would be wrong the first time a synonym was added.
 */
type TemplateInfo = {
  kind: string;
  filename: string;
  required: string[];
  notes: string[];
  download: string;
};

export function UploadPanel({ companyId }: { companyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(KINDS[0].value);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [templates, setTemplates] = useState<Record<string, TemplateInfo>>({});

  const accept = KINDS.find((entry) => entry.value === kind)?.accept ?? ".csv";
  const template = templates[kind];

  // One request for all six, on mount. If it fails the panel loses the
  // column list and keeps everything else: the download link below is built
  // from the kind rather than from this response, so it still resolves.
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/api/templates`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { templates?: TemplateInfo[] } | null) => {
        if (!live || !body?.templates) return;
        setTemplates(
          Object.fromEntries(body.templates.map((entry) => [entry.kind, entry])),
        );
      })
      .catch(() => {
        // Nothing to say. The picker works without this.
      });
    return () => {
      live = false;
    };
  }, []);

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
          ? `${body.filename} was already ingested. Nothing changed.`
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
    <section className="border-b border-graphite-soft py-8">
      <h2 className="text-ident font-semibold">Add a document</h2>
      <p className="mt-2 max-w-[70ch] text-prose leading-relaxed text-graphite">
        A register from Tally, Busy, Marg, Zoho or Vyapar, a GSTR-2B download, or a bank
        statement. Column names differ between packages and are resolved on the way in;
        if one cannot be, the error says which and what the file calls it instead.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-prose">
          <span className="sr-only">Document type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="border border-graphite-soft bg-sunk px-3 py-2 text-prose focus:border-agreed"
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
          className="text-prose file:mr-3 file:cursor-pointer file:border file:border-agreed file:bg-transparent file:px-3 file:py-1.5 file:text-prose file:font-medium hover:file:bg-agreed hover:file:text-stock"
        />

        {/* The answer to "what am I supposed to choose?", beside the control
            that asks it. A file picker on its own is a question with the
            answer printed nowhere: this kind's example is one click away and
            is itself a valid upload, so the shortest path to a working file
            is download, replace the rows, send it back. */}
        <a
          href={`${API_BASE}/api/templates/${kind}/file`}
          download
          className="border border-agreed px-3 py-1.5 font-mono text-stub uppercase tracking-[0.06em] text-agreed transition-colors hover:bg-agreed hover:text-stock"
        >
          Download template
        </a>

        {busy && <span className="text-ident text-graphite">Reading…</span>}
      </div>

      {template && (
        <div className="mt-4 max-w-[70ch] border-l-2 border-hairline pl-4">
          <p className="text-ident text-graphite">
            <span className="font-mono text-stub uppercase text-graphite-soft">
              Columns required
            </span>{" "}
            {/* Named rather than counted, because the failure this prevents is
                a file missing exactly one of them. The list is what
                `resolve()` looks for first; a file calling a column something
                else is still read, and the error says so by name if it is
                not. */}
            <span className="font-mono text-agreed">{template.required.join(", ")}</span>
          </p>
          {template.notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-ident leading-relaxed text-graphite">
              {template.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {outcome && (
        <div
          role="status"
          className={`mt-4 border px-4 py-3 text-ident leading-relaxed ${
            outcome.ok
              ? "border-agreed/30 bg-agreed-wash text-agreed"
              : "border-statute/30 bg-statute-wash text-agreed"
          }`}
        >
          <p className="font-medium">{outcome.message}</p>
          {outcome.detail && (
            <p className="mt-1.5 whitespace-pre-wrap text-graphite">{outcome.detail}</p>
          )}
        </div>
      )}
    </section>
  );
}

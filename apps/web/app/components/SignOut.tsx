"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../lib/api";

/** Who is signed in, and the way out. */
export function SignOut({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <span className="no-print flex items-baseline gap-3 text-caption-13 text-ink-muted">
      <span>
        {name}
        {role !== "member" && <span className="ml-1.5 text-ink-subtle">({role})</span>}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="mark-verb underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50"
      >
        Sign out
      </button>
    </span>
  );
}

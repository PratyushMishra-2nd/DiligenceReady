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
      router.push("/sign-in");
      router.refresh();
    }
  }

  return (
    <span className="no-print flex items-baseline gap-3 text-micro text-ink-soft">
      <span>
        {name}
        {role !== "member" && <span className="ml-1.5 text-ink-faint">({role})</span>}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink disabled:opacity-50"
      >
        Sign out
      </button>
    </span>
  );
}

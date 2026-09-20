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
    <span className="no-print flex items-baseline gap-3 text-ident text-graphite">
      <span>
        {name}
        {role !== "member" && <span className="ml-1.5 text-graphite-soft">({role})</span>}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="underline decoration-graphite-soft underline-offset-4 hover:decoration-agreed disabled:opacity-50"
      >
        Sign out
      </button>
    </span>
  );
}

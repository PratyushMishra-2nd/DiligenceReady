"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../lib/api";

/**
 * Sign in.
 *
 * Two things this page deliberately does not do. It does not tell you
 * whether an address exists — the API returns one message for every kind of
 * failure and this repeats it verbatim, because a friendlier error here is
 * a way to enumerate a firm's staff. And it does not keep the token in
 * JavaScript-reachable storage: the API sets an httpOnly cookie and the
 * browser handles it from there, so a script injected into this page has
 * nothing to steal.
 */
export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email, password);
      router.push("/");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[27rem] px-6 py-24">
      <h1 className="text-lg font-semibold tracking-tight">DiligenceReady</h1>
      <p className="mt-1 text-sm text-ink-soft">Sign in to your firm&rsquo;s workspace.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {error && (
          <p role="alert" className="border border-exposure/30 bg-exposure-wash px-3 py-2 text-[13px] text-exposure">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full border border-ink bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-transparent hover:text-ink disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-8 max-w-[38ch] text-micro leading-relaxed text-ink-faint">
        No account yet? A firm owner creates one with{" "}
        <span className="font-mono text-ink-soft">diligence user create</span>. There is no
        self-service signup, because there is no self-service client data.
      </p>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="text-micro font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border border-rule-strong bg-sheet px-3 py-2 text-sm focus:border-ink focus:outline-none"
      />
    </label>
  );
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_MAX_AGE } from "../../lib/demo";
import { destination } from "../../lib/next-path";
import { SERVER_API_BASE } from "../../lib/session";

export const dynamic = "force-dynamic";

/**
 * Signing in without JavaScript.
 *
 * The form was `<form onSubmit={submit}>` with no `action` and no `method`,
 * and its fields carried no `name`. Submitted with scripting off, or before
 * hydration, or after the bundle failed to arrive, it posted nothing anywhere
 * and the page sat there. Meanwhile `press/DemoButton.tsx` — the secondary
 * call to action — is a real `<form action="/demo" method="post">`, and its
 * own comment argues that it "still degrades without JavaScript, which matters
 * more here than it usually does: this is the one control on the page that has
 * to work." That is true of the demo button and truer of authentication.
 *
 * So this is the demo route's sibling: same 303, same relative `Location` for
 * the same Amplify reason, same cookie set from the returned token rather than
 * forwarded from an upstream-scoped `Set-Cookie`. The difference is that this
 * one takes input, so `next` goes through the same guard the page uses and the
 * body is read as form encoding rather than JSON.
 *
 * The enhanced path is unchanged. `SignInForm` still calls `preventDefault`
 * and posts through `api.signIn`, which keeps the error copy, the focus move
 * and the in-flight rule. This runs only when that did not happen.
 */
function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const next = destination(form?.get("next")?.toString());
  const email = form?.get("email")?.toString() ?? "";
  const password = form?.get("password")?.toString() ?? "";

  // Which sentence the page should print when it renders again. Two codes and
  // not the API's message: a `Location` is a URL, and putting server prose in
  // one means it is quoted back into the page from the address bar. The page
  // owns the wording; this says only which of the two happened.
  const back = (why: "credentials" | "engine") =>
    seeOther(`/sign-in?next=${encodeURIComponent(next)}&failed=${why}`);

  if (!email || !password) return back("credentials");

  let token: string;
  try {
    const response = await fetch(`${SERVER_API_BASE}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    // A 401 is the account; anything else is us. The API returns one message
    // for every kind of credential failure so that this form cannot be used to
    // enumerate a firm's staff, and that property is preserved by not looking
    // at the body at all.
    if (response.status === 401) return back("credentials");
    if (!response.ok) return back("engine");
    const body = (await response.json()) as { token?: string };
    if (!body.token) return back("engine");
    token = body.token;
  } catch {
    return back("engine");
  }

  (await cookies()).set("dr_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return seeOther(next);
}

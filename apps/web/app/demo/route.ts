import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { DEMO_EMAIL, DEMO_PASSWORD, SESSION_MAX_AGE } from "../lib/demo";
import { SERVER_API_BASE } from "../lib/session";

export const dynamic = "force-dynamic";

/**
 * A redirect to a path on whatever host the reader is actually on.
 *
 * `NextResponse.redirect()` needs an absolute URL, and the only origin
 * available to build one from inside a route handler is `request.url`. On
 * Amplify that is the origin of the *internal* request the platform makes to
 * the Next.js server — `http://localhost:3000` — not the https host in the
 * reader's address bar. So the demo button signed the reader in correctly and
 * then sent their browser to localhost.
 *
 * A `Location` of `/app` sidesteps the whole question: a relative reference is
 * valid in `Location` (RFC 7231 §7.1.2) and every browser resolves it against
 * the URL it asked for, which is the deployed one. Nothing about the current
 * host has to be known here, guessed from a forwarded header a proxy may or
 * may not set, or written into configuration.
 */
function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * One click into the demo.
 *
 * This is the route the landing page's primary call to action should always
 * have pointed at. It used to point at `/sign-in`, which renders an empty
 * email and password box, prefills nothing, and — read end to end — never uses
 * the word "demo" once. So the highest-intent visitor on the page, the one who
 * pressed the largest button on the first screen, arrived at a cold password
 * wall for an account they had no reason to think they had, with the
 * credentials that would have rescued the click printed somewhere further down
 * the page they had just left. There is no version of that which is not a lost
 * reader.
 *
 * What happens here: the server signs in as the seeded demo firm, sets the
 * session cookie the API handed back, and sends the reader to the dashboard.
 * No form, no typing, no twenty-four character random string to copy.
 *
 * Why this is not a hole. The account is a generated firm on generated data;
 * its password is printed on the landing page, in the README and in this
 * repository, and the only thing behind it is two invented companies. Nothing
 * here takes user input, so there is no parameter to tamper with and no
 * redirect to open. A reader who wants a real account still goes through the
 * form, and the form is unchanged.
 *
 * It is a POST and not a GET because it creates a session, and a GET that
 * changes state is a GET a link prefetch or a crawler will fire on its own.
 * `robots.txt` disallows it as well, and the links that reach it are forms.
 */
export async function POST() {
  const failed = seeOther("/sign-in?next=/app&demo=1");

  let token: string;
  try {
    const response = await fetch(`${SERVER_API_BASE}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      cache: "no-store",
    });
    if (!response.ok) return failed;
    const body = (await response.json()) as { token?: string };
    if (!body.token) return failed;
    token = body.token;
  } catch {
    // The engine is unreachable. The form can at least say so, and a reader
    // who has credentials of their own can still use it.
    return failed;
  }

  // Set from the token rather than by forwarding the API's own `Set-Cookie`:
  // in deployment the API is reached through a server-side rewrite, so its
  // cookie is scoped to an upstream host the browser never sees.
  (await cookies()).set("dr_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    // On any TLS deployment this must be set, and Amplify is TLS. It is off
    // locally so the cookie survives plain http on localhost, which is the
    // same trade the API makes for the same reason.
    secure: process.env.NODE_ENV === "production",
  });

  return seeOther("/app");
}

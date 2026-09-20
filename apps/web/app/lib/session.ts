import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { API_BASE } from "./api";

/**
 * Server-side data fetching, with the caller's session attached.
 *
 * A server component runs on the Next process, not in the browser, so the
 * session cookie does not travel with its fetches automatically. It has to be
 * read from the incoming request and forwarded. Forgetting is not subtle —
 * every page 401s — but it is the kind of thing that gets patched with a
 * public endpoint rather than a forwarded cookie, so it lives in one function.
 *
 * URL resolution:
 *   In deployment, NEXT_PUBLIC_API_BASE is "" (empty) so browser calls go to
 *   the same Amplify origin and Next.js rewrites() proxy them to EC2.
 *   Server components cannot use relative URLs with Node fetch(), so we use
 *   NEXT_PUBLIC_API_UPSTREAM (the EC2 HTTP URL) when running server-side,
 *   falling back to API_BASE for local development.
 */

/**
 * The upstream URL for server-side API calls.
 *
 * In deployment: NEXT_PUBLIC_API_UPSTREAM = http://<ec2-dns>:8080
 * In local dev:  falls back to API_BASE (http://localhost:8077)
 *
 * This is NEXT_PUBLIC_ so it is available in both server and client bundles
 * at build time. Server components read it from process.env directly.
 */
const SERVER_API_BASE =
  process.env.NEXT_PUBLIC_API_UPSTREAM || API_BASE || "http://localhost:8077";

export class Unauthorized extends Error {}

export async function serverGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const session = jar.get("dr_session")?.value;

  const response = await fetch(`${SERVER_API_BASE}${path}`, {
    cache: "no-store",
    headers: session ? { cookie: `dr_session=${session}` } : {},
  });

  if (response.status === 401) {
    throw new Unauthorized(path);
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** Fetch, or send the person to sign in. Used by every page that shows data. */
export async function requireData<T>(path: string): Promise<T> {
  try {
    return await serverGet<T>(path);
  } catch (error) {
    if (error instanceof Unauthorized) {
      redirect("/sign-in");
    }
    throw error;
  }
}

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get("dr_session")?.value);
}

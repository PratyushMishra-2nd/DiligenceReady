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
 */

export class Unauthorized extends Error {}

export async function serverGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const session = jar.get("dr_session")?.value;

  const response = await fetch(`${API_BASE}${path}`, {
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

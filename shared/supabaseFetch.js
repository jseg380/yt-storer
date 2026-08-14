import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const AUTH_KEY = "ytStorerAuth";

/**
 * @typedef {object} SyncAuth
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresAt - unix seconds
 */

/** @returns {Promise<SyncAuth|null>} */
export async function getAuth() {
  const result = await browser.storage.local.get(AUTH_KEY);
  return result[AUTH_KEY] ?? null;
}

/** @param {SyncAuth} auth */
export async function setAuth(auth) {
  await browser.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth() {
  await browser.storage.local.remove(AUTH_KEY);
}

export async function isConnected() {
  return (await getAuth()) !== null;
}

async function refreshIfNeeded(auth) {
  const nowSeconds = Date.now() / 1000;
  if (auth.expiresAt - nowSeconds > 60) return auth;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: auth.refreshToken }),
  });
  if (!response.ok) {
    await clearAuth();
    throw new Error("Sync session expired — reconnect the extension from the options page.");
  }

  const body = await response.json();
  const refreshed = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
  await setAuth(refreshed);
  return refreshed;
}

/**
 * Authenticated fetch against Supabase's REST (PostgREST) or Auth (GoTrue)
 * endpoints. `path` is relative to SUPABASE_URL, e.g. "/rest/v1/videos".
 */
export async function authedFetch(path, options = {}) {
  const auth = await getAuth();
  if (!auth) {
    throw new Error("Not connected to an account.");
  }
  const fresh = await refreshIfNeeded(auth);

  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${fresh.accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

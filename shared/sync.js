import { authedFetch, setAuth, clearAuth, isConnected } from "./supabaseFetch.js";

const OUTBOX_KEY = "ytStorerSyncOutbox";
const KINDS = ["tags", "videos", "playlists", "channels"];

/**
 * Pairs this extension install with a web-app account using a short-lived
 * code generated on /dashboard/settings/extension. Mints a real session via
 * the web app's /api/pair/redeem endpoint and stores it locally.
 * @param {string} apiBaseUrl - e.g. "https://your-app.vercel.app"
 * @param {string} code
 * @param {string} [deviceId] - stable per-install id, used for the device list shown in the web app
 * @param {string} [label] - human-readable device label (e.g. "MacIntel · Firefox")
 */
export async function pairWithCode(apiBaseUrl, code, deviceId, label) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/pair/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, deviceId, label }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message ?? "Failed to connect.");
  }
  await setAuth({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  });
}

/**
 * Updates this device's last-synced timestamp in the web app's device list.
 * Best-effort — a failure here shouldn't fail the sync it's reporting on.
 * @param {string} [deviceId]
 */
export async function reportSynced(deviceId) {
  if (!deviceId) return;
  try {
    await authedFetch(`/rest/v1/sync_devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
    });
  } catch {
    // Non-fatal: the sync itself already succeeded.
  }
}

/**
 * @param {string} [deviceId] - if provided, removes this device from the
 * web app's connected-devices list before clearing local credentials.
 */
export async function disconnect(deviceId) {
  if (deviceId) {
    try {
      await authedFetch(`/rest/v1/sync_devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort — proceed with local disconnect regardless.
    }
  }
  await clearAuth();
  await browser.storage.local.remove(OUTBOX_KEY);
}

export { isConnected };

async function getOutbox() {
  const result = await browser.storage.local.get(OUTBOX_KEY);
  return result[OUTBOX_KEY] ?? { videos: {}, playlists: {}, channels: {}, tags: {} };
}

async function setOutbox(outbox) {
  await browser.storage.local.set({ [OUTBOX_KEY]: outbox });
}

/** Queues a create/update for the next flush. Collapses repeated edits to the same item. */
export async function queueUpsert(kind, item) {
  const outbox = await getOutbox();
  outbox[kind][item.id] = { op: "upsert", item };
  await setOutbox(outbox);
}

/** Queues a delete for the next flush; supersedes any pending upsert for the same item. */
export async function queueDelete(kind, sourceId) {
  const outbox = await getOutbox();
  outbox[kind][sourceId] = { op: "delete", sourceId };
  await setOutbox(outbox);
}

function toServerRow(kind, item) {
  if (kind === "tags") {
    return { source_id: item.id, name: item.name, color: item.color };
  }
  return {
    source_id: item.id,
    url: item.url,
    clean_url: item.cleanUrl,
    title: item.title,
    date_added: new Date(item.dateAdded).toISOString(),
    tags: item.tags ?? [],
  };
}

/**
 * Sends everything queued in the outbox. Safe to call repeatedly — entries
 * only clear once the server has acknowledged them, so a suspended
 * background page or a failed request just leaves work for the next flush.
 */
export async function flushOutbox() {
  if (!(await isConnected())) return;

  const outbox = await getOutbox();
  let changed = false;

  for (const kind of KINDS) {
    const entries = Object.values(outbox[kind]);
    if (entries.length === 0) continue;

    const upserts = entries.filter((e) => e.op === "upsert");
    const deletes = entries.filter((e) => e.op === "delete");

    if (upserts.length > 0) {
      const response = await authedFetch(`/rest/v1/${kind}?on_conflict=owner_id,source_id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(upserts.map((e) => toServerRow(kind, e.item))),
      });
      if (response.ok) {
        for (const e of upserts) delete outbox[kind][e.item.id];
        changed = true;
      }
    }

    if (deletes.length > 0) {
      const filter = deletes.map((e) => `"${e.sourceId}"`).join(",");
      const response = await authedFetch(`/rest/v1/${kind}?source_id=in.(${filter})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });
      if (response.ok) {
        for (const e of deletes) delete outbox[kind][e.sourceId];
        changed = true;
      }
    }
  }

  if (changed) await setOutbox(outbox);
}

/**
 * Fetches every row touched since `sinceIso` (or everything, if omitted),
 * tombstones included — the caller decides how to merge them locally.
 * @param {string|null} sinceIso
 */
export async function pullRemoteChanges(sinceIso) {
  const changes = {};
  for (const kind of KINDS) {
    const cutoff = sinceIso ?? "1970-01-01T00:00:00Z";
    const response = await authedFetch(
      `/rest/v1/${kind}?select=*&updated_at=gt.${encodeURIComponent(cutoff)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to pull ${kind} from the server.`);
    }
    changes[kind] = await response.json();
  }
  return changes;
}

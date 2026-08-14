import * as sync from "./sync.js";

const DATA_KEY = "ytStorerData";
const LATEST_SCHEMA_VERSION = 4;

// The ideal structure of our data
const DEFAULT_DATA_STRUCTURE = {
  schemaVersion: LATEST_SCHEMA_VERSION,
  videos: [],
  playlists: [],
  channels: [],
  tags: [],
  settings: {
    pagination: {
      enabled: false,
      pageSize: 50,
    },
    contentVisibility: {
      videos: true,
      playlists: true,
      channels: true,
    },
    sync: {
      enabled: false,
      lastSyncedAt: null,
      apiBaseUrl: null,
      autoSync: true,
      deviceId: null,
    },
  },
};

/**
 * Generates a unique ID for a new tag.
 * @returns {string}
 */
function generateTagId() {
  return `tag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Migrates data from any older schema to the latest version (v4).
 * This function can handle:
 * - v0: An array of videos where `tags` and `dateAdded` are missing.
 * - v1: An array of videos where `tags` is an array of strings.
 * - v2: An object with `tags` as an array of tag objects, and videos referencing tags by ID.
 * - v3: An object with added `playlists` and `channels` arrays.
 * - v4: Adds `updatedAt` to every item/tag and a `settings.sync` block, for cloud sync.
 * @param {any} oldData - The data retrieved from storage or an imported file.
 * @returns {object} Data in the latest schema format.
 */
export function migrateData(oldData) {
  // Case 1: Brand new user or invalid/empty data.
  if (!oldData) {
    return DEFAULT_DATA_STRUCTURE;
  }

  // Case 2: Already on the latest schema. Merge settings to be safe and return.
  if (oldData.schemaVersion && oldData.schemaVersion >= LATEST_SCHEMA_VERSION) {
    const mergedSettings = {
      ...DEFAULT_DATA_STRUCTURE.settings,
      ...oldData.settings,
      contentVisibility: {
        // Ensure new keys exist
        ...DEFAULT_DATA_STRUCTURE.settings.contentVisibility,
        ...(oldData.settings ? oldData.settings.contentVisibility : {}),
      },
      sync: {
        ...DEFAULT_DATA_STRUCTURE.settings.sync,
        ...(oldData.settings ? oldData.settings.sync : {}),
      },
    };
    return { ...DEFAULT_DATA_STRUCTURE, ...oldData, settings: mergedSettings };
  }

  // Start the migration process. We'll modify this object step-by-step.
  let migratedData = oldData;

  // --- Step 1: Migrate legacy array (v0/v1) to a v2 object structure ---
  if (!migratedData.schemaVersion || migratedData.schemaVersion < 2) {
    if (Array.isArray(migratedData)) {
      console.log(
        "YT Storer: Migrating legacy data (v0/v1) to Schema v2 object.",
      );
      const legacyVideos = migratedData;
      const newTags = new Map();
      const newVideos = [];

      // First pass: Discover all unique tags
      legacyVideos.forEach((video) => {
        if (!Array.isArray(video.tags)) video.tags = [];
        video.tags.forEach((tagName) => {
          if (typeof tagName !== "string" || tagName.trim() === "") return;
          const lowerCaseName = tagName.toLowerCase();
          if (!newTags.has(lowerCaseName)) {
            newTags.set(lowerCaseName, {
              id: generateTagId(),
              name: tagName,
              color: "#e2e2e2",
            });
          }
        });
      });

      // Second pass: Update videos
      legacyVideos.forEach((video) => {
        const newVideo = { ...video };
        if (typeof newVideo.dateAdded !== "number") {
          newVideo.dateAdded = Date.now();
        }
        newVideo.tags = video.tags
          .map((tagName) => {
            if (typeof tagName !== "string") return null;
            const tagObj = newTags.get(tagName.toLowerCase());
            return tagObj ? tagObj.id : null;
          })
          .filter((id) => id !== null);
        newVideos.push(newVideo);
      });

      migratedData = {
        schemaVersion: 2, // Explicitly set the intermediate version
        videos: newVideos,
        tags: Array.from(newTags.values()),
        settings: DEFAULT_DATA_STRUCTURE.settings, // Start with default settings
      };
    } else {
      // If it's not an array and has no schema, it's an unknown format.
      console.warn("YT Storer: Unrecognized legacy data format. Resetting.");
      return DEFAULT_DATA_STRUCTURE;
    }
  }

  // --- Step 2: Migrate from Schema v2 to Schema v3 ---
  // This code will now correctly run for both existing v2 users AND users just migrated from v0/v1.
  if (migratedData.schemaVersion < 3) {
    console.log("YT Storer: Migrating data from Schema v2 to v3.");
    migratedData.playlists = [];
    migratedData.channels = [];
    migratedData.settings = {
      ...DEFAULT_DATA_STRUCTURE.settings,
      ...migratedData.settings, // Keep existing settings
    };
    migratedData.schemaVersion = 3;
  }

  // --- Step 3: Migrate from Schema v3 to Schema v4 ---
  // Adds `updatedAt` to every item/tag (needed for last-write-wins sync)
  // and a `settings.sync` block (opt-in cloud sync, off by default).
  if (migratedData.schemaVersion < 4) {
    console.log("YT Storer: Migrating data from Schema v3 to v4.");
    for (const kind of ["videos", "playlists", "channels"]) {
      for (const item of migratedData[kind] ?? []) {
        if (typeof item.updatedAt !== "number") {
          item.updatedAt = item.dateAdded ?? Date.now();
        }
      }
    }
    for (const tag of migratedData.tags ?? []) {
      if (typeof tag.updatedAt !== "number") {
        tag.updatedAt = Date.now();
      }
    }
    migratedData.settings = {
      ...migratedData.settings,
      sync: {
        ...DEFAULT_DATA_STRUCTURE.settings.sync,
        ...migratedData.settings?.sync,
      },
    };
    migratedData.schemaVersion = 4;
  }

  // --- Final Step: Return the fully migrated data ---
  return migratedData;
}

/**
 * Fetches the application's data object from browser.storage.
 * It automatically handles migrating any internally stored legacy data to the latest schema.
 * @returns {Promise<object>} A promise that resolves to the full data object, guaranteed to be in the latest format.
 */
export async function getData() {
  // Check for old separate 'videos' key first for migration
  const oldVideosResult = await browser.storage.local.get("videos");
  const dataResult = await browser.storage.local.get(DATA_KEY);

  let dataToMigrate = dataResult[DATA_KEY];

  // If the new key doesn't exist but the old one does, prioritize the old one for migration.
  if (!dataToMigrate && oldVideosResult.videos) {
    dataToMigrate = oldVideosResult.videos;
  }

  const migratedData = migrateData(dataToMigrate);

  // If the schema was old, save the new structure and remove old keys
  if (
    !dataToMigrate ||
    (typeof dataToMigrate.schemaVersion === "undefined" &&
      !Array.isArray(dataToMigrate)) ||
    (dataToMigrate.schemaVersion || 1) < LATEST_SCHEMA_VERSION
  ) {
    await browser.storage.local.set({ [DATA_KEY]: migratedData });
    await browser.storage.local.remove(["videos", "settings"]); // Cleanup old keys
    console.log("YT Storer: Data migration complete.");
  }

  return migratedData;
}

/**
 * Saves the entire data object to storage.
 * @param {object} data The full data object to save.
 * @returns {Promise<void>}
 */
export async function setData(data) {
  await browser.storage.local.set({ [DATA_KEY]: data });
}

function stamp(item) {
  item.updatedAt = Date.now();
  return item;
}

function syncEnabled(data) {
  return Boolean(data.settings.sync?.enabled);
}

// --- High-level action functions ---

export async function addVideo(newVideo) {
  const data = await getData();
  const isAlreadySaved = data.videos.some((video) => video.id === newVideo.id);
  if (!isAlreadySaved) {
    stamp(newVideo);
    data.videos.push(newVideo);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("videos", newVideo);
  }
}

export async function addPlaylist(newPlaylist) {
  const data = await getData();
  const isAlreadySaved = data.playlists.some((p) => p.id === newPlaylist.id);
  if (!isAlreadySaved) {
    stamp(newPlaylist);
    data.playlists.push(newPlaylist);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("playlists", newPlaylist);
  }
}

export async function addChannel(newChannel) {
  const data = await getData();
  const isAlreadySaved = data.channels.some((c) => c.id === newChannel.id);
  if (!isAlreadySaved) {
    stamp(newChannel);
    data.channels.push(newChannel);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("channels", newChannel);
  }
}

export async function updateVideo(videoId, updates) {
  const data = await getData();
  const videoIndex = data.videos.findIndex((v) => v.id === videoId);
  if (videoIndex !== -1) {
    data.videos[videoIndex] = stamp({ ...data.videos[videoIndex], ...updates });
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("videos", data.videos[videoIndex]);
  }
}

export async function updatePlaylist(playlistId, updates) {
  const data = await getData();
  const itemIndex = data.playlists.findIndex((p) => p.id === playlistId);
  if (itemIndex !== -1) {
    data.playlists[itemIndex] = stamp({ ...data.playlists[itemIndex], ...updates });
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("playlists", data.playlists[itemIndex]);
  }
}

export async function updateChannel(channelId, updates) {
  const data = await getData();
  const itemIndex = data.channels.findIndex((c) => c.id === channelId);
  if (itemIndex !== -1) {
    data.channels[itemIndex] = stamp({ ...data.channels[itemIndex], ...updates });
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("channels", data.channels[itemIndex]);
  }
}

export async function deleteVideosByIds(videoIds) {
  const data = await getData();
  const idsToDelete = new Set(videoIds);
  data.videos = data.videos.filter((video) => !idsToDelete.has(video.id));
  await setData(data);
  if (syncEnabled(data)) {
    for (const id of idsToDelete) await sync.queueDelete("videos", id);
  }
}

export async function deletePlaylistsByIds(playlistIds) {
  const data = await getData();
  const idsToDelete = new Set(playlistIds);
  data.playlists = data.playlists.filter((p) => !idsToDelete.has(p.id));
  await setData(data);
  if (syncEnabled(data)) {
    for (const id of idsToDelete) await sync.queueDelete("playlists", id);
  }
}

export async function deleteChannelsByIds(channelIds) {
  const data = await getData();
  const idsToDelete = new Set(channelIds);
  data.channels = data.channels.filter((c) => !idsToDelete.has(c.id));
  await setData(data);
  if (syncEnabled(data)) {
    for (const id of idsToDelete) await sync.queueDelete("channels", id);
  }
}

export async function createTag(tagName) {
  const data = await getData();
  const lowerCaseName = tagName.toLowerCase();

  // Check if a tag with the same name (case-insensitive) already exists
  const existingTag = data.tags.find(
    (t) => t.name.toLowerCase() === lowerCaseName,
  );
  if (existingTag) {
    return existingTag; // Return the existing tag
  }

  const newTag = stamp({
    id: generateTagId(),
    name: tagName, // Preserve user's casing
    color: "#e2e2e2",
  });
  data.tags.push(newTag);
  await setData(data);
  if (syncEnabled(data)) await sync.queueUpsert("tags", newTag);
  return newTag;
}

export async function updateTag(tagId, updates) {
  const data = await getData();
  const tagIndex = data.tags.findIndex((t) => t.id === tagId);
  if (tagIndex !== -1) {
    data.tags[tagIndex] = stamp({ ...data.tags[tagIndex], ...updates });
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("tags", data.tags[tagIndex]);
  }
}

export async function addTagToVideos(tagId, videoIds) {
  const data = await getData();
  const idsToUpdate = new Set(videoIds);
  const touched = [];
  data.videos.forEach((video) => {
    if (idsToUpdate.has(video.id)) {
      if (!video.tags) video.tags = [];
      if (!video.tags.includes(tagId)) {
        video.tags.push(tagId);
        stamp(video);
        touched.push(video);
      }
    }
  });
  await setData(data);
  if (syncEnabled(data)) {
    for (const video of touched) await sync.queueUpsert("videos", video);
  }
}

export async function removeTagFromVideo(tagId, videoId) {
  const data = await getData();
  const video = data.videos.find((v) => v.id === videoId);
  if (video && video.tags) {
    video.tags = video.tags.filter((tId) => tId !== tagId);
    stamp(video);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("videos", video);
  }
}

export async function addTagToPlaylists(tagId, playlistIds) {
  const data = await getData();
  const idsToUpdate = new Set(playlistIds);
  const touched = [];
  data.playlists.forEach((playlist) => {
    if (idsToUpdate.has(playlist.id)) {
      if (!playlist.tags) playlist.tags = [];
      if (!playlist.tags.includes(tagId)) {
        playlist.tags.push(tagId);
        stamp(playlist);
        touched.push(playlist);
      }
    }
  });
  await setData(data);
  if (syncEnabled(data)) {
    for (const playlist of touched) await sync.queueUpsert("playlists", playlist);
  }
}

export async function removeTagFromPlaylist(tagId, playlistId) {
  const data = await getData();
  const playlist = data.playlists.find((p) => p.id === playlistId);
  if (playlist && playlist.tags) {
    playlist.tags = playlist.tags.filter((tId) => tId !== tagId);
    stamp(playlist);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("playlists", playlist);
  }
}

export async function addTagToChannels(tagId, channelIds) {
  const data = await getData();
  const idsToUpdate = new Set(channelIds);
  const touched = [];
  data.channels.forEach((channel) => {
    if (idsToUpdate.has(channel.id)) {
      if (!channel.tags) channel.tags = [];
      if (!channel.tags.includes(tagId)) {
        channel.tags.push(tagId);
        stamp(channel);
        touched.push(channel);
      }
    }
  });
  await setData(data);
  if (syncEnabled(data)) {
    for (const channel of touched) await sync.queueUpsert("channels", channel);
  }
}

export async function removeTagFromChannel(tagId, channelId) {
  const data = await getData();
  const channel = data.channels.find((c) => c.id === channelId);
  if (channel && channel.tags) {
    channel.tags = channel.tags.filter((tId) => tId !== tagId);
    stamp(channel);
    await setData(data);
    if (syncEnabled(data)) await sync.queueUpsert("channels", channel);
  }
}

export async function updateSettings(newSettings) {
  const data = await getData();
  // Merge (not replace) so this doesn't clobber settings.sync, which this
  // function's caller (the pagination/visibility form) doesn't know about.
  data.settings = { ...data.settings, ...newSettings };
  await setData(data);
}

/**
 * Merges rows pulled from the server (via sync.pullRemoteChanges) into local
 * storage. Last-write-wins by comparing each row's server `updated_at`
 * against the local item's `updatedAt`; a server `deleted_at` removes the
 * item locally regardless of local timestamps, since tombstones are
 * authoritative once synced.
 * @param {{videos: any[], playlists: any[], channels: any[], tags: any[]}} changes
 */
export async function applyRemoteChanges(changes) {
  const data = await getData();

  for (const row of changes.tags ?? []) {
    const idx = data.tags.findIndex((t) => t.id === row.source_id);
    if (row.deleted_at) {
      if (idx !== -1) data.tags.splice(idx, 1);
      continue;
    }
    const remoteUpdatedAt = new Date(row.updated_at).getTime();
    const localUpdatedAt = idx !== -1 ? data.tags[idx].updatedAt ?? 0 : 0;
    if (remoteUpdatedAt <= localUpdatedAt) continue;
    const merged = { id: row.source_id, name: row.name, color: row.color, updatedAt: remoteUpdatedAt };
    if (idx !== -1) data.tags[idx] = merged;
    else data.tags.push(merged);
  }

  for (const kind of ["videos", "playlists", "channels"]) {
    for (const row of changes[kind] ?? []) {
      const list = data[kind];
      const idx = list.findIndex((item) => item.id === row.source_id);
      if (row.deleted_at) {
        if (idx !== -1) list.splice(idx, 1);
        continue;
      }
      const remoteUpdatedAt = new Date(row.updated_at).getTime();
      const localUpdatedAt = idx !== -1 ? list[idx].updatedAt ?? 0 : 0;
      if (remoteUpdatedAt <= localUpdatedAt) continue;
      const merged = {
        id: row.source_id,
        url: row.url,
        cleanUrl: row.clean_url,
        title: row.title,
        dateAdded: new Date(row.date_added).getTime(),
        tags: row.tags ?? [],
        updatedAt: remoteUpdatedAt,
      };
      if (idx !== -1) list[idx] = merged;
      else list.push(merged);
    }
  }

  await setData(data);
}

/**
 * Updates just the `settings.sync` block (enabled flag, last-synced
 * timestamp, connected API URL) without touching the rest of settings.
 * @param {Partial<{enabled: boolean, lastSyncedAt: number|null, apiBaseUrl: string|null}>} patch
 */
export async function updateSyncSettings(patch) {
  const data = await getData();
  data.settings.sync = { ...data.settings.sync, ...patch };
  await setData(data);
  return data.settings.sync;
}

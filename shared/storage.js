const DATA_KEY = "ytStorerData";
const LATEST_SCHEMA_VERSION = 3;

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
 * Migrates data from any older schema to the latest version (v2).
 * This function can handle:
 * - v0: An array of videos where `tags` and `dateAdded` are missing.
 * - v1: An array of videos where `tags` is an array of strings.
 * - v2: An object with `tags` as an array of tag objects, and videos referencing tags by ID.
 * - v3: An object with added `playlists` and `channels` arrays.
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

// --- High-level action functions ---

export async function addVideo(newVideo) {
  const data = await getData();
  const isAlreadySaved = data.videos.some((video) => video.id === newVideo.id);
  if (!isAlreadySaved) {
    data.videos.push(newVideo);
    await setData(data);
  }
}

export async function addPlaylist(newPlaylist) {
  const data = await getData();
  const isAlreadySaved = data.playlists.some((p) => p.id === newPlaylist.id);
  if (!isAlreadySaved) {
    data.playlists.push(newPlaylist);
    await setData(data);
  }
}

export async function addChannel(newChannel) {
  const data = await getData();
  const isAlreadySaved = data.channels.some((c) => c.id === newChannel.id);
  if (!isAlreadySaved) {
    data.channels.push(newChannel);
    await setData(data);
  }
}

export async function updateVideo(videoId, updates) {
  const data = await getData();
  const videoIndex = data.videos.findIndex((v) => v.id === videoId);
  if (videoIndex !== -1) {
    data.videos[videoIndex] = { ...data.videos[videoIndex], ...updates };
    await setData(data);
  }
}

export async function updatePlaylist(playlistId, updates) {
  const data = await getData();
  const itemIndex = data.playlists.findIndex((p) => p.id === playlistId);
  if (itemIndex !== -1) {
    data.playlists[itemIndex] = { ...data.playlists[itemIndex], ...updates };
    await setData(data);
  }
}

export async function updateChannel(channelId, updates) {
  const data = await getData();
  const itemIndex = data.channels.findIndex((c) => c.id === channelId);
  if (itemIndex !== -1) {
    data.channels[itemIndex] = { ...data.channels[itemIndex], ...updates };
    await setData(data);
  }
}

export async function deleteVideosByIds(videoIds) {
  const data = await getData();
  const idsToDelete = new Set(videoIds);
  data.videos = data.videos.filter((video) => !idsToDelete.has(video.id));
  await setData(data);
}

export async function deletePlaylistsByIds(playlistIds) {
  const data = await getData();
  const idsToDelete = new Set(playlistIds);
  data.playlists = data.playlists.filter((p) => !idsToDelete.has(p.id));
  await setData(data);
}

export async function deleteChannelsByIds(channelIds) {
  const data = await getData();
  const idsToDelete = new Set(channelIds);
  data.channels = data.channels.filter((c) => !idsToDelete.has(c.id));
  await setData(data);
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

  const newTag = {
    id: generateTagId(),
    name: tagName, // Preserve user's casing
    color: "#e2e2e2",
  };
  data.tags.push(newTag);
  await setData(data);
  return newTag;
}

export async function updateTag(tagId, updates) {
  const data = await getData();
  const tagIndex = data.tags.findIndex((t) => t.id === tagId);
  if (tagIndex !== -1) {
    data.tags[tagIndex] = { ...data.tags[tagIndex], ...updates };
    await setData(data);
  }
}

export async function addTagToVideos(tagId, videoIds) {
  const data = await getData();
  const idsToUpdate = new Set(videoIds);
  data.videos.forEach((video) => {
    if (idsToUpdate.has(video.id)) {
      if (!video.tags) video.tags = [];
      if (!video.tags.includes(tagId)) {
        video.tags.push(tagId);
      }
    }
  });
  await setData(data);
}

export async function removeTagFromVideo(tagId, videoId) {
  const data = await getData();
  const video = data.videos.find((v) => v.id === videoId);
  if (video && video.tags) {
    video.tags = video.tags.filter((tId) => tId !== tagId);
    await setData(data);
  }
}

export async function addTagToPlaylists(tagId, playlistIds) {
  const data = await getData();
  const idsToUpdate = new Set(playlistIds);
  data.playlists.forEach((playlist) => {
    if (idsToUpdate.has(playlist.id)) {
      if (!playlist.tags) playlist.tags = [];
      if (!playlist.tags.includes(tagId)) {
        playlist.tags.push(tagId);
      }
    }
  });
  await setData(data);
}

export async function removeTagFromPlaylist(tagId, playlistId) {
  const data = await getData();
  const playlist = data.playlists.find((p) => p.id === playlistId);
  if (playlist && playlist.tags) {
    playlist.tags = playlist.tags.filter((tId) => tId !== tagId);
    await setData(data);
  }
}

export async function addTagToChannels(tagId, channelIds) {
  const data = await getData();
  const idsToUpdate = new Set(channelIds);
  data.channels.forEach((channel) => {
    if (idsToUpdate.has(channel.id)) {
      if (!channel.tags) channel.tags = [];
      if (!channel.tags.includes(tagId)) {
        channel.tags.push(tagId);
      }
    }
  });
  await setData(data);
}

export async function removeTagFromChannel(tagId, channelId) {
  const data = await getData();
  const channel = data.channels.find((c) => c.id === channelId);
  if (channel && channel.tags) {
    channel.tags = channel.tags.filter((tId) => tId !== tagId);
    await setData(data);
  }
}

export async function updateSettings(newSettings) {
  const data = await getData();
  data.settings = newSettings;
  await setData(data);
}

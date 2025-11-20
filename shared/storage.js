const DATA_KEY = "ytStorerData";
const LATEST_SCHEMA_VERSION = 2;

// The ideal structure of our data
const DEFAULT_DATA_STRUCTURE = {
  schemaVersion: LATEST_SCHEMA_VERSION,
  videos: [],
  tags: [],
  settings: {
    pagination: {
      enabled: false,
      pageSize: 50,
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
 * - v2: The current structured format.
 * @param {any} oldData - The data retrieved from storage or an imported file.
 * @returns {object} Data in the latest schema format.
 */
export function migrateData(oldData) {
  // Case 1: Brand new user or invalid data.
  if (!oldData) {
    return DEFAULT_DATA_STRUCTURE;
  }

  // Case 2: Already on the latest schema. No migration needed.
  if (oldData.schemaVersion && oldData.schemaVersion >= LATEST_SCHEMA_VERSION) {
    // Merge with defaults to ensure all top-level keys exist.
    return { ...DEFAULT_DATA_STRUCTURE, ...oldData };
  }

  // Case 3: Legacy format (v0 or v1) - data is an array of videos.
  // This block handles both v0 and v1 seamlessly.
  if (Array.isArray(oldData)) {
    console.log("YT Storer: Migrating legacy data (v0/v1) to Schema v2.");
    const legacyVideos = oldData;
    const newTags = new Map(); // Use a map to handle case-insensitivity
    const newVideos = [];

    // First pass: Discover all unique tags and create tag objects
    legacyVideos.forEach((video) => {
      // V0 Compatibility: Ensure `tags` is an array before processing.
      if (!Array.isArray(video.tags)) {
        video.tags = [];
      }

      video.tags.forEach((tagName) => {
        // This check handles cases where tagName might not be a string
        if (typeof tagName !== "string" || tagName.trim() === "") return;

        const lowerCaseName = tagName.toLowerCase();
        if (!newTags.has(lowerCaseName)) {
          newTags.set(lowerCaseName, {
            id: generateTagId(),
            name: tagName, // Preserve original casing
            color: "#e2e2e2",
          });
        }
      });
    });

    // Second pass: Update videos with new fields and tag IDs
    legacyVideos.forEach((video) => {
      const newVideo = { ...video };

      // V0 Compatibility: Ensure `dateAdded` exists and is a number.
      if (typeof newVideo.dateAdded !== "number") {
        newVideo.dateAdded = Date.now();
      }

      // V0 Compatibility: Ensure `tags` is an array. (Already done above, but safe to re-check)
      if (!Array.isArray(newVideo.tags)) {
        newVideo.tags = [];
      }

      // V1 -> V2 Conversion: Replace tag names with tag IDs.
      newVideo.tags = newVideo.tags
        .map((tagName) => {
          if (typeof tagName !== "string") return null;
          const tagObj = newTags.get(tagName.toLowerCase());
          return tagObj ? tagObj.id : null;
        })
        .filter((id) => id !== null); // Remove any nulls

      newVideos.push(newVideo);
    });

    return {
      ...DEFAULT_DATA_STRUCTURE,
      videos: newVideos,
      tags: Array.from(newTags.values()),
    };
  }

  // Fallback for any other unexpected format.
  console.warn(
    "YT Storer: Unrecognized data format encountered. Resetting to default.",
  );
  return DEFAULT_DATA_STRUCTURE;
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

export async function updateVideo(videoId, updates) {
  const data = await getData();
  const videoIndex = data.videos.findIndex((v) => v.id === videoId);
  if (videoIndex !== -1) {
    data.videos[videoIndex] = { ...data.videos[videoIndex], ...updates };
    await setData(data);
  }
}

export async function deleteVideosByIds(videoIds) {
  const data = await getData();
  const idsToDelete = new Set(videoIds);
  data.videos = data.videos.filter((video) => !idsToDelete.has(video.id));
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

export async function updateSettings(newSettings) {
  const data = await getData();
  data.settings = newSettings;
  await setData(data);
}

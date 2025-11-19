/**
 * The default settings.
 */
const DEFAULT_SETTINGS = {
  pagination: {
    enabled: false,
    pageSize: 50,
  },
};

/**
 * Migrates the video data to the latest format.
 * This is the single source of truth for the data model.
 * @param {Array} videos The array of video objects.
 * @returns {{videos: Array, needsUpdate: boolean}}
 */
function migrateData(videos) {
  let needsUpdate = false;

  const updatedVideos = videos.map((video) => {
    let videoModified = false;

    if (typeof video.dateAdded !== "number") {
      video.dateAdded = Date.now();
      videoModified = true;
    }

    if (!Array.isArray(video.tags)) {
      video.tags = [];
      videoModified = true;
    }

    if (videoModified) {
      needsUpdate = true;
    }

    return video;
  });

  return { videos: updatedVideos, needsUpdate };
}

/**
 * Fetches all videos from storage, performing data migration if necessary.
 * @returns {Promise<Array>} A promise that resolves to the array of videos.
 */
export async function getVideos() {
  const result = await browser.storage.local.get({ videos: [] });
  const { videos, needsUpdate } = migrateData(result.videos);

  if (needsUpdate) {
    console.log("YT Storer: Migrating old data to new format.");
    await browser.storage.local.set({ videos });
  }
  return videos;
}

/**
 * Overwrites the entire video list in storage. Use with caution.
 * @param {Array} videos The new array of videos to save.
 * @returns {Promise<void>}
 */
export async function setVideos(videos) {
  await browser.storage.local.set({ videos });
}

/**
 * Adds a single video to the list if it doesn't already exist.
 * @param {object} newVideo The video object to add.
 * @returns {Promise<void>}
 */
export async function addVideo(newVideo) {
  const videos = await getVideos();
  const isAlreadySaved = videos.some((video) => video.id === newVideo.id);

  if (!isAlreadySaved) {
    videos.push(newVideo);
    await setVideos(videos);
    console.log("YT Storer: Video saved successfully!", newVideo);
  } else {
    console.log("YT Storer: Video already exists in the list.");
  }
}

/**
 * Deletes one or more videos from the list by their IDs.
 * @param {string[]} videoIds An array of video IDs to delete.
 * @returns {Promise<void>}
 */
export async function deleteVideosByIds(videoIds) {
  const videos = await getVideos();
  const idsToDelete = new Set(videoIds);
  const updatedVideos = videos.filter((video) => !idsToDelete.has(video.id));
  await setVideos(updatedVideos);
}

/**
 * Updates a specific video's properties.
 * @param {string} videoId The ID of the video to update.
 * @param {object} updates An object containing the fields to update (e.g., { title: 'New Title' }).
 * @returns {Promise<void>}
 */
export async function updateVideo(videoId, updates) {
  const videos = await getVideos();
  const videoIndex = videos.findIndex((v) => v.id === videoId);
  if (videoIndex !== -1) {
    videos[videoIndex] = { ...videos[videoIndex], ...updates };
    await setVideos(videos);
  }
}

/**
 * Adds a tag to multiple videos.
 * @param {string} tagName The tag to add.
 * @param {string[]} videoIds The IDs of the videos to tag.
 * @returns {Promise<void>}
 */
export async function addTagToVideos(tagName, videoIds) {
  const videos = await getVideos();
  const idsToUpdate = new Set(videoIds);
  videos.forEach((video) => {
    if (idsToUpdate.has(video.id) && !video.tags.includes(tagName)) {
      video.tags.push(tagName);
    }
  });
  await setVideos(videos);
}

/**
 * Removes a tag from a single video.
 * @param {string} tagName The tag to remove.
 * @param {string} videoId The ID of the video to modify.
 * @returns {Promise<void>}
 */
export async function removeTagFromVideo(tagName, videoId) {
  const videos = await getVideos();
  const video = videos.find((v) => v.id === videoId);
  if (video) {
    video.tags = video.tags.filter((t) => t !== tagName);
    await setVideos(videos);
  }
}

/**
 * Fetches the user's settings from storage.
 * @returns {Promise<object>} A promise that resolves to the settings object.
 */
export async function getSettings() {
  const result = await browser.storage.local.get({
    settings: DEFAULT_SETTINGS,
  });
  // Merge defaults to ensure new settings are applied for existing users
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

/**
 * Saves the user's settings to storage.
 * @param {object} settings The settings object to save.
 * @returns {Promise<void>}
 */
export async function setSettings(settings) {
  await browser.storage.local.set({ settings });
}

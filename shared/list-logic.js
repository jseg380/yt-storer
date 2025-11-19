// This module exports the core logic for displaying and managing the video list.

/**
 * Normalizes text for searching by making it lowercase, removing punctuation,
 * and standardizing whitespace.
 * e.g., "  Baby, I'm Jealous! " -> "baby im jealous"
 * @param {string} text The text to normalize.
 * @returns {string} The normalized text.
 */
export function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Removes punctuation (keeps letters, numbers, whitespace)
    .replace(/\s+/g, " ") // Collapses multiple spaces into one
    .trim();
}

// This function takes a DOM element (the <ul>) and the data to render.
export function renderList(videoListElement, videos, searchTerm = "") {
  videoListElement.innerHTML = "";
  let filteredVideos = [];

  if (!searchTerm) {
    filteredVideos = [...videos];
  } else {
    const searchTermLower = searchTerm.toLowerCase();

    // --- Stage 1: Fast, exact substring search ---
    let primaryResults = videos.filter((video) =>
      video.title.toLowerCase().includes(searchTermLower),
    );

    if (primaryResults.length > 0) {
      filteredVideos = primaryResults;
    } else {
      // --- Stage 2: Fuzzy search (if Stage 1 fails) ---
      const normalizedQuery = normalizeText(searchTerm);
      const searchTerms = normalizedQuery
        .split(" ")
        .filter((term) => term.length > 0);

      if (searchTerms.length > 0) {
        filteredVideos = videos.filter((video) => {
          const normalizedTitle = normalizeText(video.title);
          return searchTerms.every((term) => normalizedTitle.includes(term));
        });
      }
    }
  }

  // The popup list shows newest first, so we reverse.
  filteredVideos.reverse();

  if (filteredVideos.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-message";
    li.textContent =
      videos.length === 0
        ? "Right-click a YouTube video to store it."
        : `No videos found for "${searchTerm}"`;
    videoListElement.appendChild(li);
    return;
  }

  filteredVideos.forEach((video) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    link.href = video.url;
    link.textContent = video.title;
    link.title = video.title;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      browser.tabs.create({ url: video.url });
    });

    const actionButtons = document.createElement("div");
    actionButtons.className = "action-buttons";

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "✖";
    deleteButton.className = "list-btn delete-btn";
    deleteButton.title = "Delete video";
    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      const result = await browser.storage.local.get({ videos: [] });
      const updatedVideos = result.videos.filter((v) => v.id !== video.id);
      await browser.storage.local.set({ videos: updatedVideos });
    });

    actionButtons.appendChild(deleteButton);
    listItem.appendChild(link);
    listItem.appendChild(actionButtons);
    videoListElement.appendChild(listItem);
  });
}

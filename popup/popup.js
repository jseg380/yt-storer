// Import the shared rendering logic
import { renderList } from "../shared/list-logic.js";

document.addEventListener("DOMContentLoaded", () => {
  const videoListElement = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const manageBtn = document.getElementById("manage-btn");
  let allVideos = [];

  // Central function to update the view
  function updateView() {
    // The popup does NOT have an edit button, so we don't pass an `onEdit` callback
    renderList(videoListElement, allVideos, searchBox.value);
  }

  // Initial load and listen for storage changes
  async function init() {
    const result = await browser.storage.local.get({ videos: [] });
    allVideos = result.videos;
    updateView();
  }

  // When storage changes (e.g., a video is added/deleted), refresh the list
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.videos) {
      allVideos = changes.videos.newValue || [];
      updateView();
    }
  });

  searchBox.addEventListener("input", updateView);

  // Button to open the full management page
  manageBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close(); // Close the popup after opening the options page
  });

  // Kick everything off
  init();
});

import * as storage from "../shared/storage.js";
import { normalizeText } from "../shared/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const videoListElement = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const manageBtn = document.getElementById("manage-btn");
  let allVideos = [];

  // The popup has its own simple renderer now.
  function render() {
    videoListElement.innerHTML = "";
    const searchTerm = searchBox.value;
    let filteredVideos = [];

    if (!searchTerm) {
      filteredVideos = [...allVideos];
    } else {
      const searchTermLower = searchTerm.toLowerCase();
      let primaryResults = allVideos.filter((v) =>
        v.title.toLowerCase().includes(searchTermLower),
      );

      if (primaryResults.length > 0) {
        filteredVideos = primaryResults;
      } else {
        const normalizedQuery = normalizeText(searchTerm);
        const searchTerms = normalizedQuery
          .split(" ")
          .filter((term) => term.length > 0);
        if (searchTerms.length > 0) {
          filteredVideos = allVideos.filter((video) => {
            const normalizedTitle = normalizeText(video.title);
            return searchTerms.every((term) => normalizedTitle.includes(term));
          });
        }
      }
    }

    // Newest first for popup
    filteredVideos.sort((a, b) => b.dateAdded - a.dateAdded);

    if (filteredVideos.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-message";
      li.textContent =
        allVideos.length === 0
          ? "No videos saved yet."
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

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "✖";
      deleteButton.className = "list-btn delete-btn";
      deleteButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        await storage.deleteVideosByIds([video.id]);
      });

      listItem.appendChild(link);
      listItem.appendChild(deleteButton);
      videoListElement.appendChild(listItem);
    });
  }

  async function init() {
    allVideos = await storage.getVideos();
    render();
  }

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.videos) {
      allVideos = changes.videos.newValue || [];
      render();
    }
  });

  searchBox.addEventListener("input", render);
  manageBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  init();
});

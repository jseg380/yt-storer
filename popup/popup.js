import * as storage from "../shared/storage.js";
import { normalizeText } from "../shared/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const videoListElement = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const manageBtn = document.getElementById("manage-btn");

  // View switching elements
  const viewBtns = {
    videos: document.getElementById("view-videos"),
    playlists: document.getElementById("view-playlists"),
    channels: document.getElementById("view-channels"),
  };

  let currentView = "videos"; // 'videos', 'playlists', 'channels'
  let allVideos = [];
  let allPlaylists = [];
  let allChannels = [];
  let allTags = new Map(); // Use a map for quick lookups
  let settings = {};

  // The popup has its own simple renderer now.
  function render() {
    videoListElement.innerHTML = "";
    const searchTerm = searchBox.value;
    let filteredVideos = [];

    // Determine which list to show based on currentView
    let currentList = [];
    if (currentView === "videos") currentList = allVideos;
    else if (currentView === "playlists") currentList = allPlaylists;
    else if (currentView === "channels") currentList = allChannels;

    // Filter by visibility settings if available
    if (settings.contentVisibility && !settings.contentVisibility[currentView]) {
      // If visibility is disabled for this type, show nothing or a message?
      // For now, let's assume the view buttons might be hidden if we were fully reactive, 
      // but here we just show empty or handle it.
      // Actually, let's just show the list. The settings are mostly for the main options page or to hide tabs.
      // But the requirement said "enable disable visibility... so that only the desired ones are shown".
      // We should probably hide the tabs in init() if disabled.
    }

    if (!searchTerm) {
      filteredVideos = [...currentList];
    } else {
      const searchTermLower = searchTerm.toLowerCase();
      let primaryResults = currentList.filter((v) =>
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
          filteredVideos = currentList.filter((item) => {
            const normalizedTitle = normalizeText(item.title);
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
        currentList.length === 0
          ? `No ${currentView} saved yet.`
          : `No ${currentView} found for "${searchTerm}"`;
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
        if (currentView === "videos") {
          await storage.deleteVideosByIds([video.id]);
        } else if (currentView === "playlists") {
          await storage.deletePlaylistsByIds([video.id]);
        } else if (currentView === "channels") {
          await storage.deleteChannelsByIds([video.id]);
        }
      });

      listItem.appendChild(link);
      listItem.appendChild(deleteButton);
      videoListElement.appendChild(listItem);
    });
  }

  async function init() {
    const data = await storage.getData();
    allVideos = data.videos || [];
    allPlaylists = data.playlists || [];
    allChannels = data.channels || [];
    allTags = new Map((data.tags || []).map((tag) => [tag.id, tag]));
    settings = data.settings || {};

    // Handle visibility settings for tabs
    if (settings.contentVisibility) {
      if (!settings.contentVisibility.videos) viewBtns.videos.style.display = 'none';
      if (!settings.contentVisibility.playlists) viewBtns.playlists.style.display = 'none';
      if (!settings.contentVisibility.channels) viewBtns.channels.style.display = 'none';

      // If current view is hidden, switch to the first visible one
      if (settings.contentVisibility[currentView] === false) {
        if (settings.contentVisibility.videos) currentView = 'videos';
        else if (settings.contentVisibility.playlists) currentView = 'playlists';
        else if (settings.contentVisibility.channels) currentView = 'channels';
      }
    }

    updateActiveTab();
    render();
  }

  function updateActiveTab() {
    Object.values(viewBtns).forEach(btn => btn.classList.remove('active'));
    viewBtns[currentView].classList.add('active');
  }

  // Event listeners for view buttons
  viewBtns.videos.addEventListener('click', () => { currentView = 'videos'; updateActiveTab(); render(); });
  viewBtns.playlists.addEventListener('click', () => { currentView = 'playlists'; updateActiveTab(); render(); });
  viewBtns.channels.addEventListener('click', () => { currentView = 'channels'; updateActiveTab(); render(); });

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.ytStorerData) {
      const data = changes.ytStorerData.newValue || {};
      allVideos = data.videos || [];
      allPlaylists = data.playlists || [];
      allChannels = data.channels || [];
      allTags = new Map((data.tags || []).map((tag) => [tag.id, tag]));
      settings = data.settings || {};
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

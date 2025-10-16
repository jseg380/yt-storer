// Import the shared rendering logic
import { renderList } from "../shared/list-logic.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element References ---
  const mainView = document.getElementById("main-view");
  const editView = document.getElementById("edit-view");
  const videoListElement = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const exportBtn = document.getElementById("export-btn");
  const importFile = document.getElementById("import-file");
  const editForm = document.getElementById("edit-form");
  const editTitleInput = document.getElementById("edit-title");
  const editUrlInput = document.getElementById("edit-url");
  const editCleanUrlInput = document.getElementById("edit-cleanUrl");
  const editTagsInput = document.getElementById("edit-tags");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- State Variables ---
  let allVideos = [];
  let currentlyEditingVideoId = null;

  // --- Central function to update the main list view ---
  function updateView() {
    // We pass the `showEditView` function as the onEdit callback
    renderList(videoListElement, allVideos, searchBox.value, showEditView);
  }

  // --- View Switching ---
  function showEditView(video) {
    currentlyEditingVideoId = video.id;
    editTitleInput.value = video.title;
    editUrlInput.value = video.url;
    editCleanUrlInput.value = video.cleanUrl;
    editTagsInput.value = video.tags || "";
    mainView.classList.add("hidden");
    editView.classList.remove("hidden");
  }

  function showMainView() {
    currentlyEditingVideoId = null;
    editForm.reset();
    editView.classList.add("hidden");
    mainView.classList.remove("hidden");
    updateView(); // Re-render the list after closing the edit view
  }

  // --- Form and Data Handling ---
  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!currentlyEditingVideoId) return;
    const videoToUpdate = allVideos.find(
      (v) => v.id === currentlyEditingVideoId,
    );
    if (videoToUpdate) {
      videoToUpdate.title = editTitleInput.value.trim();
      videoToUpdate.url = editUrlInput.value.trim();
      videoToUpdate.cleanUrl = editCleanUrlInput.value.trim();
      videoToUpdate.tags = editTagsInput.value.trim();
    }
    await browser.storage.local.set({ videos: allVideos });
    showMainView();
  }

  function exportList() {
    function formatCompact(date) {
      const pad = (n, w = 2) => String(n).padStart(w, "0");
      const YYYY = date.getFullYear();
      const MM = pad(date.getMonth() + 1);
      const DD = pad(date.getDate());
      const HH = pad(date.getHours());
      const mm = pad(date.getMinutes());
      const ss = pad(date.getSeconds());
      return `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
    }

    if (allVideos.length === 0) {
      alert("Your video list is empty.");
      return;
    }
    const jsonString = JSON.stringify(allVideos, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = formatCompact(new Date());

    a.href = url;
    a.download = `yt-storer-export-${timestamp}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importList(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (
      allVideos.length > 0 &&
      !confirm("This will PERMANENTLY REPLACE your current list. Are you sure?")
    ) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedVideos = JSON.parse(e.target.result);
        if (
          !Array.isArray(importedVideos) ||
          (importedVideos.length > 0 && !importedVideos[0].id)
        ) {
          throw new Error("Invalid file format.");
        }
        await browser.storage.local.set({ videos: importedVideos });
        // The storage listener below will handle the UI update
        alert(`Successfully imported ${importedVideos.length} videos.`);
      } catch (error) {
        alert("Import failed. Please use a valid backup file.");
        console.error("YT Storer: Import error", error);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  // --- Initialization and Event Listeners ---
  async function init() {
    const result = await browser.storage.local.get({ videos: [] });
    allVideos = result.videos;
    updateView();
  }

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.videos) {
      allVideos = changes.videos.newValue || [];
      updateView();
    }
  });

  searchBox.addEventListener("input", updateView);
  exportBtn.addEventListener("click", exportList);
  importFile.addEventListener("change", importList);
  editForm.addEventListener("submit", handleSaveEdit);
  cancelEditBtn.addEventListener("click", showMainView);

  init();
});

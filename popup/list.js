// This script is now only responsible for DISPLAYING and DELETING videos.
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element References ---
  const mainView = document.getElementById("main-view");
  const editView = document.getElementById("edit-view");
  const videoList = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFile = document.getElementById("import-file");

  // Edit Form Elements
  const editForm = document.getElementById("edit-form");
  const editTitleInput = document.getElementById("edit-title");
  const editUrlInput = document.getElementById("edit-url");
  const editCleanUrlInput = document.getElementById("edit-cleanUrl");
  const editTagsInput = document.getElementById("edit-tags");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- State Variables ---
  let allVideos = [];
  let currentlyEditingVideoId = null;

  // ===== VIEW MANAGEMENT =====

  function showEditView(video) {
    currentlyEditingVideoId = video.id;

    // Populate the form with the video's data
    editTitleInput.value = video.title;
    editUrlInput.value = video.url;
    editCleanUrlInput.value = video.cleanUrl;
    editTagsInput.value = video.tags || ""; // Handle cases where tags might not exist

    // Switch views
    mainView.classList.add("hidden");
    editView.classList.remove("hidden");
  }

  function showMainView() {
    currentlyEditingVideoId = null;
    editForm.reset(); // Clear form fields

    // Switch views
    editView.classList.add("hidden");
    mainView.classList.remove("hidden");

    // Re-render the list in case changes were made
    renderList(searchBox.value);
  }

  // ===== DATA & RENDERING =====

  // --- Main Rendering Function ---
  // Renders the video list based on the cached 'allVideos' array
  // and an optional search term.
  function renderList(searchTerm = "") {
    videoList.innerHTML = "";
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    let filteredVideos;

    if (searchTerm !== "") {
      // Filter videos based on the search term
      filteredVideos = allVideos.filter((video) =>
        video.title.toLowerCase().includes(lowerCaseSearchTerm),
      );

      // To show newest first, we reverse the (filtered) array before displaying
      filteredVideos.reverse();
    } else {
      filteredVideos = [...allVideos]; // No filtering, use all videos
    }

    // --- Handle UI for Empty States ---
    if (filteredVideos.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-message";
      li.textContent =
        allVideos.length === 0
          ? "Right-click a YouTube video to store it."
          : `No videos found for "${searchTerm}"`;
      videoList.appendChild(li);
      return;
    }

    // --- Render Filtered Videos ---
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

      const editButton = document.createElement("button");
      editButton.textContent = "✎";
      editButton.className = "list-btn edit-btn";
      editButton.title = "Edit video";
      editButton.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditView(video);
      });

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "✖";
      deleteButton.className = "list-btn delete-btn";
      deleteButton.title = "Delete video";
      deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteVideo(video.id);
      });

      actionButtons.appendChild(editButton);
      actionButtons.appendChild(deleteButton);

      listItem.appendChild(link);
      listItem.appendChild(actionButtons);
      videoList.appendChild(listItem);
    });
  }

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

  // Function to delete a video by its ID
  async function deleteVideo(idToDelete) {
    // We update the master list 'allVideos' first for a snappy UI response
    allVideos = allVideos.filter((video) => video.id !== idToDelete);
    // Then we update the storage in the background
    await browser.storage.local.set({ videos: allVideos });
    // Re-render the list with the current search term
    renderList(searchBox.value);
  }

  // ===== IMPORT / EXPORT =====

  function exportList() {
    // --- Utility function for export filename formattting
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

    console.log(`at the beginning of exportList`);
    if (allVideos.length === 0) {
      alert("Your video list is empty. Nothing to export.");
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
    console.log(`at the beginning of importList`);
    const file = event.target.files[0];
    if (!file) return;

    // --- MODIFIED: Smarter Confirmation Logic ---
    let proceed = false;
    if (allVideos.length > 0) {
      console.log(
        `importing but there are ${allVideos.length} videos stored already`,
      );
      const videoCount = allVideos.length;
      const plural = videoCount === 1 ? "" : "s";
      // This is the new, more specific confirmation message.
      if (
        confirm(
          `You currently have ${videoCount} video${plural} saved.\n\nImporting will PERMANENTLY REPLACE your current list. Export the current list and manually reconcile the lists to avoid data loss. Are you sure you want to continue?`,
        )
      ) {
        proceed = true;
      }
      console.log(`after the confirmation message`);
    } else {
      // If the list is empty, no confirmation is needed.
      proceed = true;
    }

    if (!proceed) {
      event.target.value = ""; // Reset the file input if the user cancels.
      return;
    }
    // --- END MODIFICATION ---

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedVideos = JSON.parse(e.target.result);
        if (
          !Array.isArray(importedVideos) ||
          (importedVideos.length > 0 &&
            (!importedVideos[0].id ||
              !importedVideos[0].title ||
              !importedVideos[0].url))
        ) {
          throw new Error("Invalid file format.");
        }
        allVideos = importedVideos;
        await browser.storage.local.set({ videos: allVideos });
        renderList();
        alert(`Successfully imported ${importedVideos.length} videos.`);
      } catch (error) {
        alert(
          "Import failed. Please make sure you are importing a valid backup file.",
        );
        console.error("YT Storer: Import error", error);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  // ===== INITIALIZATION & EVENT LISTENERS =====

  async function init() {
    const result = await browser.storage.local.get({ videos: [] });
    allVideos = result.videos;
    showMainView();
  }

  // Main View Listeners
  searchBox.addEventListener("input", () => renderList(searchBox.value));
  menuToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle("hidden");
  });
  window.addEventListener("click", () => {
    if (!dropdownMenu.classList.contains("hidden")) {
      dropdownMenu.classList.add("hidden");
    }
  });
  importFile.addEventListener("change", importList);

  exportBtn.addEventListener("click", () => {
    exportList();
    dropdownMenu.classList.add("hidden");
  });
  importBtn.addEventListener("click", () => {
    importFile.click();
    dropdownMenu.classList.add("hidden");
  });

  // Edit View Listeners
  editForm.addEventListener("submit", handleSaveEdit);
  cancelEditBtn.addEventListener("click", showMainView);

  // Global Listener
  browser.storage.onChanged.addListener(init);

  // Kick everything off
  init();
});

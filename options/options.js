import * as storage from "../shared/storage.js";
import { normalizeText, formatCompactTimestamp } from "../shared/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element References ---
  const mainView = document.getElementById("main-view");
  const editView = document.getElementById("edit-view");
  const settingsView = document.getElementById("settings-view");
  const settingsBtn = document.getElementById("settings-btn");
  const backToListBtn = document.getElementById("back-to-list-btn");
  const versionDisplay = document.getElementById("version-display");
  const videoListElement = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  const sortSelect = document.getElementById("sort-select");
  const exportBtn = document.getElementById("export-btn");
  const importFile = document.getElementById("import-file");
  const bulkActionsBar = document.getElementById("bulk-actions-bar");
  const selectionCountSpan = document.getElementById("selection-count");
  const bulkAddTagBtn = document.getElementById("bulk-add-tag-btn");
  const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  const deselectAllBtn = document.getElementById("deselect-all-btn");
  const invertSelectionBtn = document.getElementById("invert-selection-btn");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const tagEditorPopover = document.getElementById("tag-editor-popover");
  const closeTagEditorBtn = document.getElementById("close-tag-editor-btn");
  const tagSearchInput = document.getElementById("tag-search-input");
  const tagSuggestionsList = document.getElementById("tag-suggestions-list");
  const editForm = document.getElementById("edit-form");
  const editTitleInput = document.getElementById("edit-title");
  const editUrlInput = document.getElementById("edit-url");
  const editCleanUrlInput = document.getElementById("edit-cleanUrl");
  const editTagsContainer = document.getElementById("edit-tags-container");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- Central Application State ---
  const appState = {
    allVideos: [],
    allTags: new Set(),
    selectedVideoIds: new Set(),
    searchTerm: "",
    sort: { field: "dateAdded", direction: "desc" },
    currentlyEditingVideoId: null,
    tagEditor: {
      isOpen: false,
      targetVideoIds: [],
      anchorElement: null,
    },
  };

  // ===================================================================
  // VIEW SWITCHING
  // ===================================================================

  function showMainView() {
    appState.currentlyEditingVideoId = null;
    editForm.reset();
    editView.classList.add("hidden");
    settingsView.classList.add("hidden");
    mainView.classList.remove("hidden");
    renderVideoList(); // Always re-render when switching views
  }

  function showSettingsView() {
    mainView.classList.add("hidden");
    editView.classList.add("hidden");
    settingsView.classList.remove("hidden");
  }

  function showEditView(video) {
    appState.currentlyEditingVideoId = video.id;

    // Populate form fields
    editTitleInput.value = video.title;
    editUrlInput.value = video.url;
    editCleanUrlInput.value = video.cleanUrl;

    // Render tags for the video being edited
    editTagsContainer.innerHTML = "";
    video.tags.forEach((tagName) => {
      const tagPill = createTagPill(tagName, video.id);
      editTagsContainer.appendChild(tagPill);
    });
    const addTagBtn = document.createElement("button");
    addTagBtn.className = "add-tag-btn";
    addTagBtn.textContent = "+ Add Tag";
    addTagBtn.type = "button"; // Prevent form submission
    addTagBtn.addEventListener("click", (e) =>
      showTagEditor([video.id], e.currentTarget),
    );
    editTagsContainer.appendChild(addTagBtn);

    mainView.classList.add("hidden");
    settingsView.classList.add("hidden");
    editView.classList.remove("hidden");
  }

  // ===================================================================
  // RENDER LOGIC
  // ===================================================================

  function getVisibleVideos() {
    let videos = [...appState.allVideos];
    const term = appState.searchTerm;

    if (term.toLowerCase().startsWith("tag:")) {
      const tagName = term.substring(4).trim();
      videos = videos.filter((v) => v.tags.includes(tagName));
    } else if (term) {
      const termLower = term.toLowerCase();
      let primaryResults = videos.filter((v) =>
        v.title.toLowerCase().includes(termLower),
      );
      if (primaryResults.length > 0) {
        videos = primaryResults;
      } else {
        const normalizedQuery = normalizeText(term);
        const searchTerms = normalizedQuery
          .split(" ")
          .filter((t) => t.length > 0);
        if (searchTerms.length > 0) {
          videos = videos.filter((v) => {
            const normalizedTitle = normalizeText(v.title);
            return searchTerms.every((t) => normalizedTitle.includes(t));
          });
        } else {
          videos = [];
        }
      }
    }

    videos.sort((a, b) => {
      const { field, direction } = appState.sort;
      const valA = a[field];
      const valB = b[field];
      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;
      return direction === "asc" ? comparison : -comparison;
    });

    return videos;
  }

  function renderVideoList() {
    videoListElement.innerHTML = "";
    const videosToRender = getVisibleVideos();

    if (videosToRender.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-message";
      li.textContent =
        appState.allVideos.length === 0
          ? "Right-click a YouTube video page to store it."
          : `No videos found for "${appState.searchTerm}"`;
      videoListElement.appendChild(li);
      return;
    }

    videosToRender.forEach((video) => {
      const listItem = document.createElement("li");
      listItem.className = appState.selectedVideoIds.has(video.id)
        ? "selected"
        : "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "selection-checkbox";
      checkbox.checked = appState.selectedVideoIds.has(video.id);
      checkbox.addEventListener("change", () =>
        handleSelectionChange(video.id),
      );

      const detailsDiv = document.createElement("div");
      detailsDiv.className = "video-details";

      const titleDiv = document.createElement("div");
      titleDiv.className = "video-title";
      const link = document.createElement("a");
      link.href = video.url;
      link.textContent = video.title;
      link.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (e.button === 1) browser.tabs.create({ url: video.cleanUrl });
        else if (e.button === 0) browser.tabs.create({ url: video.url });
      });
      titleDiv.appendChild(link);

      const tagsContainer = document.createElement("div");
      tagsContainer.className = "tags-container";
      video.tags.forEach((tagName) => {
        tagsContainer.appendChild(createTagPill(tagName, video.id));
      });
      const addTagBtn = document.createElement("button");
      addTagBtn.className = "add-tag-btn";
      addTagBtn.textContent = "+";
      addTagBtn.title = "Add tag";
      addTagBtn.addEventListener("click", (e) =>
        showTagEditor([video.id], e.currentTarget),
      );
      tagsContainer.appendChild(addTagBtn);

      const metaDiv = document.createElement("div");
      metaDiv.className = "video-meta";
      metaDiv.textContent = `Added: ${new Date(video.dateAdded).toLocaleString()}`;

      detailsDiv.appendChild(titleDiv);
      detailsDiv.appendChild(tagsContainer);
      detailsDiv.appendChild(metaDiv);

      const actionButtonsDiv = document.createElement("div");
      actionButtonsDiv.className = "action-buttons";

      const editButton = document.createElement("button");
      editButton.textContent = "✎";
      editButton.className = "list-btn edit-btn";
      editButton.title = "Edit video details";
      editButton.addEventListener("click", () => showEditView(video));

      const deleteButton = document.createElement("button");
      deleteButton.className = "list-btn delete-btn";
      deleteButton.textContent = "✖";
      deleteButton.title = "Delete video";
      deleteButton.addEventListener("click", () => {
        if (confirm(`Are you sure you want to delete "${video.title}"?`)) {
          storage.deleteVideosByIds([video.id]);
        }
      });

      actionButtonsDiv.appendChild(editButton);
      actionButtonsDiv.appendChild(deleteButton);

      listItem.appendChild(checkbox);
      listItem.appendChild(detailsDiv);
      listItem.appendChild(actionButtonsDiv);
      videoListElement.appendChild(listItem);
    });
  }

  function renderBulkActionsBar() {
    const count = appState.selectedVideoIds.size;
    if (count > 0) {
      selectionCountSpan.textContent = `${count} selected`;
      bulkActionsBar.classList.remove("hidden");
    } else {
      bulkActionsBar.classList.add("hidden");
    }

    const visibleIds = getVisibleVideos().map((v) => v.id);
    if (visibleIds.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const allVisibleSelected = visibleIds.every((id) =>
      appState.selectedVideoIds.has(id),
    );
    const someVisibleSelected = visibleIds.some((id) =>
      appState.selectedVideoIds.has(id),
    );

    if (allVisibleSelected) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (someVisibleSelected) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }

  // ===================================================================
  // UI COMPONENT LOGIC (Tags, Selection, etc.)
  // ===================================================================

  function createTagPill(tagName, videoId) {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tagName;
    pill.addEventListener("click", () => filterByTag(tagName));

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-tag-btn";
    removeBtn.textContent = "×";
    removeBtn.title = `Remove tag "${tagName}"`;
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      storage.removeTagFromVideo(tagName, videoId);
    });

    pill.appendChild(removeBtn);
    return pill;
  }

  function filterByTag(tagName) {
    searchBox.value = `tag:${tagName}`;
    appState.searchTerm = `tag:${tagName}`;
    clearSearchBtn.classList.remove("hidden");
    renderVideoList();
    renderBulkActionsBar();
  }

  function handleSelectionChange(videoId) {
    if (appState.selectedVideoIds.has(videoId)) {
      appState.selectedVideoIds.delete(videoId);
    } else {
      appState.selectedVideoIds.add(videoId);
    }
    renderVideoList(); // Re-render to update the 'selected' class on <li>
    renderBulkActionsBar();
  }

  function showTagEditor(videoIds, anchorElement) {
    appState.tagEditor = {
      isOpen: true,
      targetVideoIds: videoIds,
      anchorElement,
    };
    tagSearchInput.value = "";
    tagEditorPopover.classList.remove("hidden");
    renderTagSuggestions(); // Render once to get height

    const rect = anchorElement.getBoundingClientRect();
    const popoverHeight = tagEditorPopover.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < popoverHeight && rect.top > popoverHeight) {
      tagEditorPopover.style.top = `${window.scrollY + rect.top - popoverHeight - 5}px`;
    } else {
      tagEditorPopover.style.top = `${window.scrollY + rect.bottom + 5}px`;
    }
    tagEditorPopover.style.left = `${window.scrollX + rect.left}px`;
    tagSearchInput.focus();
  }

  function hideTagEditor() {
    appState.tagEditor.isOpen = false;
    tagEditorPopover.classList.add("hidden");
  }

  function renderTagSuggestions() {
    tagSuggestionsList.innerHTML = "";
    const query = tagSearchInput.value.toLowerCase().trim();
    const suggestions = [...appState.allTags].filter((tag) =>
      tag.toLowerCase().includes(query),
    );

    suggestions.forEach((tag) => {
      const li = document.createElement("li");
      li.textContent = tag;
      li.addEventListener("click", () => {
        storage.addTagToVideos(tag, appState.tagEditor.targetVideoIds);
        hideTagEditor();
      });
      tagSuggestionsList.appendChild(li);
    });

    if (query && !suggestions.includes(query)) {
      const li = document.createElement("li");
      li.innerHTML = `Create new tag: "<strong>${query}</strong>"`;
      li.addEventListener("click", () => {
        storage.addTagToVideos(query, appState.tagEditor.targetVideoIds);
        hideTagEditor();
      });
      tagSuggestionsList.appendChild(li);
    }
  }

  // ===================================================================
  // DATA ACTIONS & EVENT HANDLERS
  // ===================================================================

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!appState.currentlyEditingVideoId) return;

    const updates = {
      title: editTitleInput.value.trim(),
      url: editUrlInput.value.trim(),
      cleanUrl: editCleanUrlInput.value.trim(),
    };
    await storage.updateVideo(appState.currentlyEditingVideoId, updates);

    const saveBtn = document.getElementById("save-edit-btn");
    saveBtn.textContent = "Saved!";
    setTimeout(() => {
      saveBtn.textContent = "Save";
    }, 1500);
  }

  function handleStateUpdate(videos) {
    appState.allVideos = videos;
    appState.allTags.clear();
    videos.forEach((video) =>
      video.tags.forEach((tag) => appState.allTags.add(tag)),
    );

    // If edit view is open, check if the video still exists
    if (appState.currentlyEditingVideoId) {
      const currentlyEditingVideo = videos.find(
        (v) => v.id === appState.currentlyEditingVideoId,
      );
      if (currentlyEditingVideo) {
        showEditView(currentlyEditingVideo); // Refresh view with new data
      } else {
        showMainView(); // Video was deleted, go back to list
      }
    } else {
      renderVideoList();
      renderBulkActionsBar();
    }
  }

  // Listen for changes from other extension parts (e.g., background script)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.videos) {
      handleStateUpdate(changes.videos.newValue || []);
    }
  });

  // Search and Sort controls
  searchBox.addEventListener("input", () => {
    appState.searchTerm = searchBox.value;
    clearSearchBtn.classList.toggle("hidden", !searchBox.value);
    renderVideoList();
    renderBulkActionsBar();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchBox.value = "";
    appState.searchTerm = "";
    clearSearchBtn.classList.add("hidden");
    searchBox.focus();
    renderVideoList();
    renderBulkActionsBar();
  });

  sortSelect.addEventListener("change", (e) => {
    const [field, direction] = e.target.value.split("_");
    appState.sort = { field, direction };
    renderVideoList();
  });

  // Bulk selection controls
  selectAllCheckbox.addEventListener("change", (e) => {
    const visibleIds = getVisibleVideos().map((v) => v.id);
    if (e.target.checked) {
      visibleIds.forEach((id) => appState.selectedVideoIds.add(id));
    } else {
      visibleIds.forEach((id) => appState.selectedVideoIds.delete(id));
    }
    renderVideoList();
    renderBulkActionsBar();
  });

  deselectAllBtn.addEventListener("click", () => {
    appState.selectedVideoIds.clear();
    renderVideoList();
    renderBulkActionsBar();
  });

  invertSelectionBtn.addEventListener("click", () => {
    const visibleIds = getVisibleVideos().map((v) => v.id);
    visibleIds.forEach((id) => {
      if (appState.selectedVideoIds.has(id)) {
        appState.selectedVideoIds.delete(id);
      } else {
        appState.selectedVideoIds.add(id);
      }
    });
    renderVideoList();
    renderBulkActionsBar();
  });

  // Bulk action buttons
  bulkAddTagBtn.addEventListener("click", (e) => {
    showTagEditor(Array.from(appState.selectedVideoIds), e.currentTarget);
  });

  bulkDeleteBtn.addEventListener("click", () => {
    const count = appState.selectedVideoIds.size;
    if (confirm(`Are you sure you want to delete ${count} selected videos?`)) {
      storage.deleteVideosByIds(Array.from(appState.selectedVideoIds));
      appState.selectedVideoIds.clear(); // Clear selection immediately for UI responsiveness
    }
  });

  // Edit form and Tag Editor controls
  editForm.addEventListener("submit", handleSaveEdit);
  cancelEditBtn.addEventListener("click", showMainView);
  closeTagEditorBtn.addEventListener("click", hideTagEditor);
  tagSearchInput.addEventListener("input", renderTagSuggestions);
  document.addEventListener("click", (e) => {
    if (
      appState.tagEditor.isOpen &&
      !tagEditorPopover.contains(e.target) &&
      e.target !== appState.tagEditor.anchorElement
    ) {
      hideTagEditor();
    }
  });

  // Settings page controls
  settingsBtn.addEventListener("click", showSettingsView);
  backToListBtn.addEventListener("click", showMainView);

  exportBtn.addEventListener("click", () => {
    if (appState.allVideos.length === 0)
      return alert("Your video list is empty.");
    const jsonString = JSON.stringify(appState.allVideos, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yt-storer-export-${formatCompactTimestamp(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (
      appState.allVideos.length > 0 &&
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
        await storage.setVideos(importedVideos);
        alert(`Successfully imported ${importedVideos.length} videos.`);
      } catch (error) {
        alert("Import failed. Please use a valid backup file.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  // ===================================================================
  // INITIALIZATION
  // ===================================================================

  async function init() {
    const manifest = browser.runtime.getManifest();
    versionDisplay.textContent = manifest.version;

    const initialVideos = await storage.getVideos();
    handleStateUpdate(initialVideos);
  }

  init();
});

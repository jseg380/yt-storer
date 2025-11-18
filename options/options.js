document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element References (Fused from both files) ---
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
  const editTagsInput = document.getElementById("edit-tags");
  const editTagsContainer = document.getElementById("edit-tags-container");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- State Variables (Fused from both files) ---
  let allVideos = [];
  let allTags = new Set();
  let selectedVideoIds = new Set();
  let currentlyEditingVideoId = null;
  let currentSort = { field: "dateAdded", direction: "desc" };
  let tagEditorState = {
    isOpen: false,
    targetVideoIds: [],
    anchorElement: null,
  };

  // ===================================================================
  // MIGRATION: Ensure all existing videos have the new data fields.
  // ===================================================================

  async function migrateData(videos) {
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
      if (videoModified) needsUpdate = true;
      return video;
    });

    if (needsUpdate) {
      console.log("YT Storer: Migrating old data to new format.");
      await browser.storage.local.set({ videos: updatedVideos });
      return updatedVideos;
    }
    return videos;
  }

  // ===================================================================
  // MAIN RENDER FUNCTION (The new, powerful version)
  // ===================================================================

  function render() {
    videoListElement.innerHTML = "";

    // 1. Filter
    let videosToRender = [...allVideos];
    const searchTerm = searchBox.value.toLowerCase();

    if (searchTerm.startsWith("tag:")) {
      const tagName = searchTerm.substring(4).trim();
      videosToRender = videosToRender.filter((v) => v.tags.includes(tagName));
    } else if (searchTerm) {
      videosToRender = videosToRender.filter((v) =>
        v.title.toLowerCase().includes(searchTerm),
      );
    }

    // 2. Sort
    videosToRender.sort((a, b) => {
      const field = currentSort.field;
      const valA = a[field];
      const valB = b[field];
      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;
      return currentSort.direction === "asc" ? comparison : -comparison;
    });

    // 3. Render
    if (videosToRender.length === 0) {
      // Correctly handle the empty state without an alert
      const li = document.createElement("li");
      li.className = "empty-message";
      li.textContent =
        allVideos.length === 0
          ? "Right-click a YouTube video page to store it."
          : `No videos found for "${searchTerm}"`;
      videoListElement.appendChild(li);
      return;
    }

    videosToRender.forEach((video) => {
      const listItem = document.createElement("li");
      listItem.className = selectedVideoIds.has(video.id) ? "selected" : "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "selection-checkbox";
      checkbox.checked = selectedVideoIds.has(video.id);
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
        e.preventDefault(); // Prevent default link behavior on all clicks

        if (e.button === 1) {
          // Middle-click
          // Open the "clean" URL in a new background tab
          browser.tabs.create({
            url: video.cleanUrl,
            // active: false, // Opens the tab without switching to it
          });
        } else if (e.button === 0) {
          // Left-click
          // Open the "raw" URL in a new foreground tab
          browser.tabs.create({
            url: video.url,
          });
        }
        // Right-click (e.button === 2) will do nothing and just show the
        // browser's context menu, which is standard expected behavior.
      });

      titleDiv.appendChild(link);

      const tagsContainer = document.createElement("div");
      tagsContainer.className = "tags-container";
      video.tags.forEach((tagName) => {
        const tagPill = createTagPill(tagName, video.id);
        tagsContainer.appendChild(tagPill);
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
      editButton.addEventListener("click", (e) => {
        e.stopPropagation();
        showEditView(video);
      });

      // -- BUTTONS FIX: The individual delete button is restored --
      const deleteButton = document.createElement("button");
      deleteButton.className = "list-btn delete-btn";
      deleteButton.textContent = "✖";
      deleteButton.title = "Delete video";
      deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${video.title}"?`)) {
          deleteVideos([video.id]);
        }
      });

      actionButtonsDiv.appendChild(editButton);
      actionButtonsDiv.appendChild(deleteButton);

      listItem.appendChild(checkbox);
      listItem.appendChild(detailsDiv);
      listItem.appendChild(actionButtonsDiv); // Append the button container to the far right
      videoListElement.appendChild(listItem);
    });
  }

  // ===================================================================
  // VIEW SWITCHING
  // ===================================================================

  function showMainView() {
    currentlyEditingVideoId = null;
    editForm.reset();
    editView.classList.add("hidden");
    settingsView.classList.add("hidden");
    mainView.classList.remove("hidden");
    render();
  }

  function showSettingsView() {
    mainView.classList.add("hidden");
    editView.classList.add("hidden");
    settingsView.classList.remove("hidden");
  }

  function showEditView(video) {
    currentlyEditingVideoId = video.id;
    // Populate text fields
    editTitleInput.value = video.title;
    editUrlInput.value = video.url;
    editCleanUrlInput.value = video.cleanUrl;

    editTagsContainer.innerHTML = ""; // Clear previous tags
    video.tags.forEach((tagName) => {
      const tagPill = createTagPill(tagName, video.id);
      editTagsContainer.appendChild(tagPill);
    });
    const addTagBtn = document.createElement("button");
    addTagBtn.className = "add-tag-btn";
    addTagBtn.textContent = "+ Add Tag";
    addTagBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent form submission
      showTagEditor([video.id], e.currentTarget);
    });
    editTagsContainer.appendChild(addTagBtn);

    mainView.classList.add("hidden");
    settingsView.classList.add("hidden");
    editView.classList.remove("hidden");
  }

  // ===================================================================
  // DATA MODIFICATION FUNCTIONS
  // ===================================================================

  // HANDLE SAVE EDIT
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
    }

    await browser.storage.local.set({ videos: allVideos });

    const saveBtn = document.getElementById("save-edit-btn");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saved!";

    setTimeout(() => {
      saveBtn.textContent = originalText;
    }, 1500);
  }

  async function removeTagFromVideo(tagName, videoId) {
    const video = allVideos.find((v) => v.id === videoId);
    if (video) {
      video.tags = video.tags.filter((t) => t !== tagName);
      await browser.storage.local.set({ videos: allVideos });
    }
  }

  async function addTagToVideos(tagName, videoIds) {
    let changed = false;
    allVideos.forEach((video) => {
      if (videoIds.includes(video.id) && !video.tags.includes(tagName)) {
        video.tags.push(tagName);
        changed = true;
      }
    });
    if (changed) {
      allTags.add(tagName);
      await browser.storage.local.set({ videos: allVideos });
    }

    if (
      !editView.classList.contains("hidden") &&
      videoIds.includes(currentlyEditingVideoId)
    ) {
      const currentVideo = allVideos.find(
        (v) => v.id === currentlyEditingVideoId,
      );
      if (currentVideo) {
        showEditView(currentVideo);
      }
    }
  }

  async function deleteVideos(videoIds) {
    const newVideos = allVideos.filter((v) => !videoIds.includes(v.id));
    await browser.storage.local.set({ videos: newVideos });
    selectedVideoIds.clear();
  }

  // ===================================================================
  // TAGS, SELECTION, AND OTHER HELPERS (From new file)
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
      removeTagFromVideo(tagName, videoId);
    });
    pill.appendChild(removeBtn);
    return pill;
  }

  function filterByTag(tagName) {
    searchBox.value = `tag:${tagName}`;
    render();
  }

  function handleSelectionChange(videoId) {
    if (selectedVideoIds.has(videoId)) {
      selectedVideoIds.delete(videoId);
    } else {
      selectedVideoIds.add(videoId);
    }
    render();
    updateBulkActionsBar();
  }

  function updateBulkActionsBar() {
    const count = selectedVideoIds.size;
    if (count > 0) {
      selectionCountSpan.textContent = `${count} selected`;
      bulkActionsBar.classList.remove("hidden");
    } else {
      bulkActionsBar.classList.add("hidden");
    }

    const visibleIds = getVisibleVideoIds();
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedVideoIds.has(id));
    const someVisibleSelected = visibleIds.some((id) =>
      selectedVideoIds.has(id),
    );

    if (allVisibleSelected) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (someVisibleSelected) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true; // The "mixed" state
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }

  function showTagEditor(videoIds, anchorElement) {
    tagEditorState = { isOpen: true, targetVideoIds: videoIds, anchorElement };

    // By clearing the input's value *before* making the popup visible and
    // rendering suggestions, we guarantee it always opens in a clean state.
    tagSearchInput.value = "";

    // First, make the popover visible so we can measure its dimensions.
    tagEditorPopover.classList.remove("hidden");

    // We must render the suggestions now (even though the list will be full)
    // so that the popover has its proper height for the positioning calculation.
    renderTagSuggestions();

    // This logic decides whether to show the popup above or below the anchor.
    const popupHeight = tagEditorPopover.offsetHeight;
    const rect = anchorElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;

    // Check if there's not enough space below, but there is enough space above.
    if (spaceBelow < popupHeight && rect.top > popupHeight) {
      // Position the popup *above* the anchor element.
      tagEditorPopover.style.top = `${window.scrollY + rect.top - popupHeight - 5}px`;
    } else {
      // Default behavior: position the popup *below* the anchor element.
      tagEditorPopover.style.top = `${window.scrollY + rect.bottom + 5}px`;
    }

    // Horizontal positioning remains the same.
    tagEditorPopover.style.left = `${window.scrollX + rect.left}px`;

    // Finally, focus the input field for immediate typing.
    tagSearchInput.focus();
  }

  function hideTagEditor() {
    tagEditorState.isOpen = false;
    tagEditorPopover.classList.add("hidden");
  }

  function renderTagSuggestions() {
    tagSuggestionsList.innerHTML = "";
    const query = tagSearchInput.value.toLowerCase().trim();
    const suggestions = [...allTags].filter((tag) =>
      tag.toLowerCase().includes(query),
    );
    suggestions.forEach((tag) => {
      const li = document.createElement("li");
      li.textContent = tag;
      li.addEventListener("click", () => {
        addTagToVideos(tag, tagEditorState.targetVideoIds);
        hideTagEditor();
      });
      tagSuggestionsList.appendChild(li);
    });
    if (query && ![...allTags].map((t) => t.toLowerCase()).includes(query)) {
      const li = document.createElement("li");
      li.innerHTML = `Create new tag: "<strong>${query}</strong>"`;
      li.addEventListener("click", () => {
        addTagToVideos(query, tagEditorState.targetVideoIds);
        hideTagEditor();
      });
      tagSuggestionsList.appendChild(li);
    }
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

  // ===================================================================
  // MULTI-SELECTION HANDLING
  // ===================================================================

  function getVisibleVideoIds() {
    // This helper function is crucial. It gets the IDs of only the videos
    // that are currently visible after filtering and searching.
    const searchTerm = searchBox.value.toLowerCase();
    return allVideos
      .filter((video) => {
        if (searchTerm.startsWith("tag:")) {
          const tagName = searchTerm.substring(4).trim();
          return video.tags.includes(tagName);
        } else if (searchTerm) {
          return video.title.toLowerCase().includes(searchTerm);
        }
        return true; // No search term, so it's visible
      })
      .map((video) => video.id);
  }

  function handleSelectAll(shouldSelect) {
    const visibleIds = getVisibleVideoIds();
    if (shouldSelect) {
      // Add all visible IDs to the selection
      visibleIds.forEach((id) => selectedVideoIds.add(id));
    } else {
      // Remove all visible IDs from the selection
      visibleIds.forEach((id) => selectedVideoIds.delete(id));
    }
    render();
    updateBulkActionsBar();
  }

  function handleDeselectAll() {
    selectedVideoIds.clear();
    render();
    updateBulkActionsBar();
  }

  function handleInvertSelection() {
    const visibleIds = getVisibleVideoIds();
    visibleIds.forEach((id) => {
      if (selectedVideoIds.has(id)) {
        selectedVideoIds.delete(id);
      } else {
        selectedVideoIds.add(id);
      }
    });
    render();
    updateBulkActionsBar();
  }

  // ===================================================================
  // INITIALIZATION & EVENT LISTENERS
  // ===================================================================

  async function init() {
    const result = await browser.storage.local.get({ videos: [] });
    const migratedVideos = await migrateData(result.videos);
    allVideos = migratedVideos;
    allTags.clear();
    allVideos.forEach((video) => video.tags.forEach((tag) => allTags.add(tag)));

    const manifest = browser.runtime.getManifest();
    versionDisplay.textContent = manifest.version;

    render();
  }

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.videos) {
      allVideos = changes.videos.newValue || [];
      allTags.clear();
      allVideos.forEach((video) =>
        video.tags.forEach((tag) => allTags.add(tag)),
      );

      if (!editView.classList.contains("hidden") && currentlyEditingVideoId) {
        // If the edit view is open, refresh it.
        const currentVideo = allVideos.find(
          (v) => v.id === currentlyEditingVideoId,
        );
        if (currentVideo) {
          showEditView(currentVideo);
        } else {
          // The video being edited was deleted, so go back to the main list.
          showMainView();
        }
      } else {
        // Otherwise, refresh the main list view.
        render();
        updateBulkActionsBar();
      }
    }
  });

  searchBox.addEventListener("input", render);

  searchBox.addEventListener("input", () => {
    // Show or hide the clear button based on whether the input has text
    if (searchBox.value) {
      clearSearchBtn.classList.remove("hidden");
    } else {
      clearSearchBtn.classList.add("hidden");
    }
    render(); // Call the existing render function
  });

  clearSearchBtn.addEventListener("click", () => {
    searchBox.value = ""; // Clear the input
    clearSearchBtn.classList.add("hidden"); // Hide the button
    searchBox.focus(); // Return focus to the search box
    render(); // Re-render the list
  });

  sortSelect.addEventListener("change", (e) => {
    const [field, direction] = e.target.value.split("_");
    currentSort = { field, direction };
    render();
  });

  exportBtn.addEventListener("click", exportList);

  importFile.addEventListener("change", importList);

  bulkAddTagBtn.addEventListener("click", (e) => {
    showTagEditor(Array.from(selectedVideoIds), e.currentTarget);
  });

  bulkDeleteBtn.addEventListener("click", () => {
    if (
      confirm(
        `Are you sure you want to delete ${selectedVideoIds.size} selected videos?`,
      )
    ) {
      deleteVideos(Array.from(selectedVideoIds));
    }
  });

  closeTagEditorBtn.addEventListener("click", hideTagEditor);

  tagSearchInput.addEventListener("input", renderTagSuggestions);

  document.addEventListener("click", (e) => {
    if (
      tagEditorState.isOpen &&
      !tagEditorPopover.contains(e.target) &&
      e.target !== tagEditorState.anchorElement
    ) {
      hideTagEditor();
    }
  });

  editForm.addEventListener("submit", handleSaveEdit);

  cancelEditBtn.addEventListener("click", showMainView);

  selectAllCheckbox.addEventListener("change", (e) => {
    handleSelectAll(e.target.checked);
  });
  deselectAllBtn.addEventListener("click", handleDeselectAll);
  invertSelectionBtn.addEventListener("click", handleInvertSelection);

  settingsBtn.addEventListener("click", showSettingsView);
  backToListBtn.addEventListener("click", showMainView);

  init();
});

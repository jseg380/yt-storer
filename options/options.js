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
  const paginationControls = document.getElementById("pagination-controls");
  const prevPageBtn = document.getElementById("prev-page-btn");
  const nextPageBtn = document.getElementById("next-page-btn");
  const pageInfoSpan = document.getElementById("page-info");
  const paginationEnabledCheckbox = document.getElementById(
    "pagination-enabled-checkbox",
  );
  const itemsPerPageInput = document.getElementById("items-per-page-input");
  const toggleFilterBtn = document.getElementById("toggle-filter-btn");
  const filterPanel = document.getElementById("filter-panel");
  const selectedFilterTagsContainer = document.getElementById(
    "selected-filter-tags",
  );
  const tagFilterInput = document.getElementById("tag-filter-input");
  const notOperatorToggle = document.getElementById("not-operator-toggle");
  const tagFilterSuggestionsPopover = document.getElementById(
    "tag-filter-suggestions-popover",
  );
  const tagFilterSuggestionsList = document.getElementById(
    "tag-filter-suggestions-list",
  );
  const randomVideoBtn = document.getElementById("random-video-btn");

  // --- Central Application State ---
  const appState = {
    allVideos: [],
    allTags: new Set(),
    selectedVideoIds: new Set(),
    searchTerm: "",
    sort: { field: "dateAdded", direction: "desc" },
    filterTags: new Set(),
    excludeTags: new Set(),
    currentPage: 1,
    settings: {},
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
    renderAll();
  }

  function showSettingsView() {
    mainView.classList.add("hidden");
    editView.classList.add("hidden");
    settingsView.classList.remove("hidden");
  }

  function showEditView(video) {
    appState.currentlyEditingVideoId = video.id;

    editTitleInput.value = video.title;
    editUrlInput.value = video.url;
    editCleanUrlInput.value = video.cleanUrl;

    editTagsContainer.innerHTML = "";
    video.tags.forEach((tagName) => {
      editTagsContainer.appendChild(createTagPill(tagName, video.id));
    });
    const addTagBtn = document.createElement("button");
    addTagBtn.className = "add-tag-btn";
    addTagBtn.textContent = "+ Add Tag";
    addTagBtn.type = "button";
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

  function renderAll() {
    const fullFilteredList = getFilteredAndSortedVideos();
    const paginatedList = getPaginatedVideos(fullFilteredList);

    renderVideoList(paginatedList);
    renderFilterTags();
    renderBulkActionsBar(fullFilteredList);
    renderPaginationControls(fullFilteredList);
  }

  function getFilteredAndSortedVideos() {
    let videos = [...appState.allVideos];
    const term = appState.searchTerm;

    // 1. Filter by included tags (AND logic)
    if (appState.filterTags.size > 0) {
      const filterTagsArray = [...appState.filterTags];
      videos = videos.filter((video) =>
        filterTagsArray.every((tag) => video.tags.includes(tag)),
      );
    }

    // 2. Filter by excluded tags (NOT logic)
    if (appState.excludeTags.size > 0) {
      const excludeTagsArray = [...appState.excludeTags];
      videos = videos.filter(
        (video) => !excludeTagsArray.some((tag) => video.tags.includes(tag)),
      );
    }

    // 3. Filter by title (fuzzy search)
    if (term) {
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

    // 4. Sort the results
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

  function getPaginatedVideos(fullList) {
    if (
      !appState.settings.pagination ||
      !appState.settings.pagination.enabled
    ) {
      return fullList;
    }
    const { pageSize } = appState.settings.pagination;
    const start = (appState.currentPage - 1) * pageSize;
    const end = start + pageSize;
    return fullList.slice(start, end);
  }

  function renderVideoList(videosToRender) {
    videoListElement.innerHTML = "";

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

  function renderBulkActionsBar(fullFilteredList) {
    const count = appState.selectedVideoIds.size;
    bulkActionsBar.classList.toggle("hidden", count === 0);
    if (count > 0) selectionCountSpan.textContent = `${count} selected`;

    const visibleIds = fullFilteredList.map((v) => v.id);
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

    selectAllCheckbox.checked = allVisibleSelected;
    selectAllCheckbox.indeterminate =
      !allVisibleSelected && someVisibleSelected;
  }

  function renderPaginationControls(fullFilteredList) {
    if (
      !appState.settings.pagination ||
      !appState.settings.pagination.enabled
    ) {
      paginationControls.classList.add("hidden");
      return;
    }

    const { pageSize } = appState.settings.pagination;
    const totalItems = fullFilteredList.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalPages <= 1) {
      paginationControls.classList.add("hidden");
      return;
    }

    paginationControls.classList.remove("hidden");
    pageInfoSpan.textContent = `Page ${appState.currentPage} of ${totalPages}`;
    prevPageBtn.disabled = appState.currentPage === 1;
    nextPageBtn.disabled = appState.currentPage === totalPages;
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
    // This function is called when clicking a tag pill on a video item
    if (
      !appState.filterTags.has(tagName) &&
      !appState.excludeTags.has(tagName)
    ) {
      appState.filterTags.add(tagName);
      appState.currentPage = 1;
      if (filterPanel.classList.contains("collapsed")) {
        toggleFilterPanel(); // Open the panel for context
      }
      renderAll();
    }
  }

  function handleSelectionChange(videoId) {
    if (appState.selectedVideoIds.has(videoId)) {
      appState.selectedVideoIds.delete(videoId);
    } else {
      appState.selectedVideoIds.add(videoId);
    }
    // Only need to re-render the list items and bulk bar, not the whole page
    renderVideoList(getPaginatedVideos(getFilteredAndSortedVideos()));
    renderBulkActionsBar(getFilteredAndSortedVideos());
  }

  function showTagEditor(videoIds, anchorElement) {
    appState.tagEditor = {
      isOpen: true,
      targetVideoIds: videoIds,
      anchorElement,
    };
    tagSearchInput.value = "";
    tagEditorPopover.classList.remove("hidden");
    renderTagSuggestions();

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

    if (query && !suggestions.map((s) => s.toLowerCase()).includes(query)) {
      const li = document.createElement("li");
      li.innerHTML = `Create new tag: "<strong>${query}</strong>"`;
      li.addEventListener("click", () => {
        storage.addTagToVideos(query, appState.tagEditor.targetVideoIds);
        hideTagEditor();
      });
      tagSuggestionsList.appendChild(li);
    }
  }

  function toggleFilterPanel() {
    const isExpanded = filterPanel.classList.toggle("collapsed");
    toggleFilterBtn.setAttribute("aria-expanded", !isExpanded);
  }

  function renderFilterTags() {
    selectedFilterTagsContainer.innerHTML = "";
    appState.filterTags.forEach((tag) => {
      const pill = createFilterTagPill(tag, false);
      selectedFilterTagsContainer.appendChild(pill);
    });
    appState.excludeTags.forEach((tag) => {
      const pill = createFilterTagPill(tag, true);
      selectedFilterTagsContainer.appendChild(pill);
    });
  }

  function createFilterTagPill(tagName, isExclude) {
    const pill = document.createElement("span");
    pill.className = `tag-pill ${isExclude ? "exclude-tag" : ""}`;

    // FIX: Wrap the text content in its own span
    const textSpan = document.createElement("span");
    textSpan.textContent = tagName;
    pill.appendChild(textSpan);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-tag-btn";
    removeBtn.textContent = "×";
    removeBtn.title = `Remove filter "${tagName}"`;
    removeBtn.addEventListener("click", () => {
      if (isExclude) {
        appState.excludeTags.delete(tagName);
      } else {
        appState.filterTags.delete(tagName);
      }
      appState.currentPage = 1;
      renderAll();
    });

    pill.appendChild(removeBtn);
    return pill;
  }

  function renderTagFilterSuggestions() {
    const query = tagFilterInput.value.toLowerCase().trim();

    const availableTags = [...appState.allTags].filter(
      (tag) => !appState.filterTags.has(tag) && !appState.excludeTags.has(tag),
    );

    // If query is empty, this will include all available tags.
    // If query has text, it will filter them.
    const suggestions = availableTags.filter((tag) =>
      tag.toLowerCase().includes(query),
    );

    tagFilterSuggestionsList.innerHTML = "";
    if (suggestions.length === 0) {
      tagFilterSuggestionsPopover.classList.add("hidden");
      return;
    }

    suggestions.forEach((tag) => {
      const li = document.createElement("li");
      li.textContent = tag;
      li.addEventListener("click", () => {
        if (notOperatorToggle.checked) {
          appState.excludeTags.add(tag);
        } else {
          appState.filterTags.add(tag);
        }
        tagFilterInput.value = "";
        tagFilterSuggestionsPopover.classList.add("hidden");
        appState.currentPage = 1;
        renderAll();
      });
      tagFilterSuggestionsList.appendChild(li);
    });

    const rect = tagFilterInput.getBoundingClientRect();
    tagFilterSuggestionsPopover.style.left = `${rect.left}px`;
    tagFilterSuggestionsPopover.style.top = `${rect.bottom + 2}px`;
    tagFilterSuggestionsPopover.style.width = `${rect.width}px`;

    tagFilterSuggestionsPopover.classList.remove("hidden");
  }

  // ===================================================================
  // SETTINGS MANAGEMENT
  // ===================================================================

  function populateSettingsForm() {
    const { enabled, pageSize } = appState.settings.pagination;
    paginationEnabledCheckbox.checked = enabled;
    itemsPerPageInput.value = pageSize;
    itemsPerPageInput.disabled = !enabled;
  }

  async function handleSettingsChange() {
    const newSettings = {
      pagination: {
        enabled: paginationEnabledCheckbox.checked,
        pageSize: parseInt(itemsPerPageInput.value, 10) || 50,
      },
    };
    appState.settings = newSettings;
    appState.currentPage = 1;
    populateSettingsForm();
    await storage.setSettings(newSettings);
    renderAll();
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

    if (appState.currentlyEditingVideoId) {
      const currentlyEditingVideo = videos.find(
        (v) => v.id === appState.currentlyEditingVideoId,
      );
      if (currentlyEditingVideo) {
        showEditView(currentlyEditingVideo);
      } else {
        showMainView();
      }
    } else {
      renderAll();
    }
  }

  function handleRandomVideoClick() {
    const visibleVideos = getFilteredAndSortedVideos();

    if (visibleVideos.length === 0) {
      // You could optionally add a subtle notification here, but for now, just do nothing.
      return;
    }

    const randomIndex = Math.floor(Math.random() * visibleVideos.length);
    const randomVideo = visibleVideos[randomIndex];

    // Open the raw URL (with timestamp, etc.) in a new active tab.
    browser.tabs.create({ url: randomVideo.url });
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.videos) {
      handleStateUpdate(changes.videos.newValue || []);
    } else if (area === "local" && changes.settings) {
      appState.settings = changes.settings.newValue;
      populateSettingsForm();
      renderAll();
    }
  });

  searchBox.addEventListener("input", () => {
    appState.searchTerm = searchBox.value;
    appState.currentPage = 1;
    clearSearchBtn.classList.toggle("hidden", !searchBox.value);
    renderAll();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchBox.value = "";
    appState.searchTerm = "";
    appState.currentPage = 1;
    clearSearchBtn.classList.add("hidden");
    searchBox.focus();
    renderAll();
  });

  sortSelect.addEventListener("change", (e) => {
    const [field, direction] = e.target.value.split("_");
    appState.sort = { field, direction };
    appState.currentPage = 1;
    renderAll();
  });

  selectAllCheckbox.addEventListener("change", (e) => {
    const visibleIds = getFilteredAndSortedVideos().map((v) => v.id);
    if (e.target.checked) {
      visibleIds.forEach((id) => appState.selectedVideoIds.add(id));
    } else {
      visibleIds.forEach((id) => appState.selectedVideoIds.delete(id));
    }
    renderAll();
  });

  deselectAllBtn.addEventListener("click", () => {
    appState.selectedVideoIds.clear();
    renderAll();
  });

  invertSelectionBtn.addEventListener("click", () => {
    const visibleIds = getFilteredAndSortedVideos().map((v) => v.id);
    visibleIds.forEach((id) => {
      if (appState.selectedVideoIds.has(id)) {
        appState.selectedVideoIds.delete(id);
      } else {
        appState.selectedVideoIds.add(id);
      }
    });
    renderAll();
  });

  bulkAddTagBtn.addEventListener("click", (e) => {
    showTagEditor(Array.from(appState.selectedVideoIds), e.currentTarget);
  });

  bulkDeleteBtn.addEventListener("click", () => {
    const count = appState.selectedVideoIds.size;
    if (confirm(`Are you sure you want to delete ${count} selected videos?`)) {
      storage.deleteVideosByIds(Array.from(appState.selectedVideoIds));
      appState.selectedVideoIds.clear();
    }
  });

  editForm.addEventListener("submit", handleSaveEdit);
  cancelEditBtn.addEventListener("click", showMainView);
  closeTagEditorBtn.addEventListener("click", hideTagEditor);
  tagSearchInput.addEventListener("input", renderTagSuggestions);

  // Filter Panel Listeners
  toggleFilterBtn.addEventListener("click", toggleFilterPanel);
  tagFilterInput.addEventListener("input", renderTagFilterSuggestions);
  tagFilterInput.addEventListener("focus", renderTagFilterSuggestions);

  document.addEventListener("click", (e) => {
    // Hide tag filter suggestions if click is outside
    if (
      !tagFilterInput.contains(e.target) &&
      !tagFilterSuggestionsPopover.contains(e.target)
    ) {
      tagFilterSuggestionsPopover.classList.add("hidden");
    }
    if (
      appState.tagEditor.isOpen &&
      !tagEditorPopover.contains(e.target) &&
      e.target !== appState.tagEditor.anchorElement
    ) {
      hideTagEditor();
    }
  });

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

  prevPageBtn.addEventListener("click", () => {
    if (appState.currentPage > 1) {
      appState.currentPage--;
      renderAll();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(
      getFilteredAndSortedVideos().length /
        appState.settings.pagination.pageSize,
    );
    if (appState.currentPage < totalPages) {
      appState.currentPage++;
      renderAll();
    }
  });

  paginationEnabledCheckbox.addEventListener("change", handleSettingsChange);
  itemsPerPageInput.addEventListener("change", handleSettingsChange);

  randomVideoBtn.addEventListener("click", handleRandomVideoClick);

  // ===================================================================
  // INITIALIZATION
  // ===================================================================

  async function init() {
    const manifest = browser.runtime.getManifest();
    versionDisplay.textContent = manifest.version;

    appState.settings = await storage.getSettings();
    populateSettingsForm();

    const initialVideos = await storage.getVideos();
    handleStateUpdate(initialVideos);
  }

  init();
});

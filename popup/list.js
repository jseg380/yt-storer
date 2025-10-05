// This script is now only responsible for DISPLAYING and DELETING videos.
document.addEventListener("DOMContentLoaded", () => {
  const videoList = document.getElementById("video-list");
  const searchBox = document.getElementById("search-box");
  let allVideos = []; // A cache for all videos to avoid re-reading from storage

  // --- Main Rendering Function ---
  // Renders the video list based on the cached 'allVideos' array
  // and an optional search term.
  function renderList(searchTerm = "") {
    videoList.innerHTML = "";
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    // Filter videos based on the search term
    const filteredVideos = allVideos.filter((video) =>
      video.title.toLowerCase().includes(lowerCaseSearchTerm),
    );

    // To show newest first, we reverse the (filtered) array before displaying
    filteredVideos.reverse();

    // --- Handle UI for Empty States ---
    if (filteredVideos.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-message";
      if (allVideos.length === 0) {
        li.textContent = "Right-click a YouTube video page to store it.";
      } else {
        li.textContent = `No videos found for "${searchTerm}"`;
      }
      videoList.appendChild(li);
      return;
    }

    // --- Render Filtered Videos ---
    filteredVideos.forEach((video) => {
      const listItem = document.createElement("li");

      const link = document.createElement("a");
      link.href = video.url; // Use original URL to preserve timestamps etc.
      link.textContent = video.title;
      link.title = video.title; // Show full title on hover
      link.target = "_blank";

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "✖";
      deleteButton.className = "delete-btn";
      deleteButton.title = "Delete video";
      deleteButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteVideo(video.id);
      });

      listItem.appendChild(link);
      listItem.appendChild(deleteButton);

      listItem.addEventListener("click", () => {
        browser.tabs.create({ url: video.url });
      });

      videoList.appendChild(listItem);
    });
  }

  // --- Data Handling Functions ---

  // Function to delete a video by its ID
  async function deleteVideo(idToDelete) {
    // We update the master list 'allVideos' first for a snappy UI response
    allVideos = allVideos.filter((video) => video.id !== idToDelete);
    // Then we update the storage in the background
    await browser.storage.local.set({ videos: allVideos });
    // Re-render the list with the current search term
    renderList(searchBox.value);
  }

  // --- Initializer Function ---
  // Fetches all data from storage and triggers the first render
  async function init() {
    const result = await browser.storage.local.get({ videos: [] });
    allVideos = result.videos;
    renderList(); // Initial render with no search term
  }

  // --- Event Listeners ---

  // Listen for typing in the search box
  searchBox.addEventListener("input", () => {
    renderList(searchBox.value);
  });

  // Listen for changes in storage (e.g., a video was added in another window)
  browser.storage.onChanged.addListener(init);

  // Kick everything off
  init();
});

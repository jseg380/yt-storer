// This module exports the core logic for displaying and managing the video list.

// This function takes a DOM element (the <ul>) and the data to render.
// An optional `onEdit` callback can be provided for UIs that support editing.
export function renderList(videoListElement, videos, searchTerm = "", onEdit) {
  videoListElement.innerHTML = "";
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  const filteredVideos = videos.filter((video) =>
    video.title.toLowerCase().includes(lowerCaseSearchTerm),
  );

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

    // Only add an edit button if the onEdit callback is provided
    if (onEdit) {
      const editButton = document.createElement("button");
      editButton.textContent = "✎";
      editButton.className = "list-btn edit-btn";
      editButton.title = "Edit video";
      editButton.addEventListener("click", (e) => {
        e.stopPropagation();
        onEdit(video); // Call the provided function
      });
      actionButtons.appendChild(editButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "✖";
    deleteButton.className = "list-btn delete-btn";
    deleteButton.title = "Delete video";
    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Deletion logic is a global concern, handled via storage events
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

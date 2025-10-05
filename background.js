const CONTEXT_MENU_ID = "SAVE_YT_VIDEO";

// Function to save the video
async function saveVideo(tab) {
  // Ensure we have a tab with a valid youtube video URL
  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    // Use the URL API to safely parse the URL and get the video ID
    const videoUrl = new URL(tab.url);
    const videoId = videoUrl.searchParams.get("v");

    // If for some reason we can't get an ID, stop here
    if (!videoId || videoId.length !== 11) {
      console.error("YT Storer: Could not extract video ID from URL:", tab.url);
      return;
    }

    const newVideo = {
      url: tab.url, // The original URL, with timestamp, playlist, etc
      cleanUrl: `https://www.youtube.com/watch?v=${videoId}`, // The clean URL
      title: tab.title.replace(" - YouTube", ""), // The video title, cleaned up
      id: videoId, // The unique YouTube video ID
    };

    const result = await browser.storage.local.get({ videos: [] });
    let videos = result.videos;

    // Check if this video is already saved
    const isAlreadySaved = videos.some((video) => video.id === newVideo.id);

    if (!isAlreadySaved) {
      videos.push(newVideo);
      await browser.storage.local.set({ videos });
    } else {
      // Notify user if video is already in the list
      // For now, we just silently ignore the duplicate
      console.log("YT Storer: Video already exists in the list.");
    }
  }
}

// Create the context menu item when the extension is installed
browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: CONTEXT_MENU_ID,
    title: "Store this video",
    // Only show the menu on YouTube video pages
    documentUrlPatterns: ["*://*.youtube.com/watch*"],
    contexts: ["page"],
  });
});

// Listen for a click on our context menu item
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    // When clicked, call the function to save the video details from the tab
    saveVideo(tab);
  }
});

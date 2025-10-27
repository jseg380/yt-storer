// Define IDs for our two context menu items
const CONTEXT_MENU_ID_PAGE = "SAVE_YT_VIDEO_PAGE";
const CONTEXT_MENU_ID_LINK = "SAVE_YT_VIDEO_LINK";

// Central function to add a video to storage
// This avoids duplicating the storage logic.
async function addVideoToList(newVideo) {
  const result = await browser.storage.local.get({ videos: [] });
  let videos = result.videos;

  const isAlreadySaved = videos.some(video => video.id === newVideo.id);
  
  if (!isAlreadySaved) {
    videos.push(newVideo);
    await browser.storage.local.set({ videos });
    console.log("YT Storer: Video saved successfully!", newVideo);
  } else {
    console.log("YT Storer: Video already exists in the list.");
  }
}

// Function to fetch a video's title from its URL
// This is necessary when saving from a link, as we don't have the tab's title.
async function fetchVideoTitle(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const htmlText = await response.text();
    
    // Use a simple regex to find the content of the <title> tag.
    const titleMatch = htmlText.match(/<title>(.*?)<\/title>/);
    
    if (titleMatch && titleMatch[1]) {
      // Clean up the title (e.g., "My Awesome Video - YouTube" becomes "My Awesome Video")
      return titleMatch[1].replace(" - YouTube", "").trim();
    }
  } catch (error) {
    console.error("YT Storer: Failed to fetch video title.", error);
  }
  // Return a fallback title if fetching fails
  return "Video (title not found)";
}

// Handles saving from the current page
async function saveVideoFromPage(tab) {
  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    const videoUrl = new URL(tab.url);
    const videoId = videoUrl.searchParams.get("v");

    if (!videoId || videoId.length !== 11) {
      return;
    }

    const newVideo = {
      url: tab.url,
      cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: tab.title.replace(" - YouTube", "").trim(),
      dateAdded: Date.now(),
      tags: [],
      id: videoId
    };

    await addVideoToList(newVideo);
  }
}

// Handles saving from a right-clicked link
async function saveVideoFromLink(info) {
  const linkUrl = info.linkUrl;
  if (linkUrl && linkUrl.includes("youtube.com/watch")) {
    const videoUrl = new URL(linkUrl);
    const videoId = videoUrl.searchParams.get("v");

    if (!videoId || videoId.length !== 11) {
      return;
    }

    // Fetch the title since we're not on the page
    const title = await fetchVideoTitle(linkUrl);

    const newVideo = {
      url: linkUrl, // The link URL is the original URL
      cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: title,
      dateAdded: Date.now(),
      tags: [],
      id: videoId
    };

    await addVideoToList(newVideo);
  }
}

// Create both context menu items on install
browser.runtime.onInstalled.addListener(() => {
  // 1. Menu for when you are on a YouTube page
  browser.menus.create({
    id: CONTEXT_MENU_ID_PAGE,
    title: "Store this video",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/watch*"]
  });

  // 2. Menu for when you right-click a link to a YouTube video
  browser.menus.create({
    id: CONTEXT_MENU_ID_LINK,
    title: "Store this video link",
    contexts: ["link"],
    // This ensures the option only appears for links pointing to YouTube videos
    targetUrlPatterns: ["*://*.youtube.com/watch*"]
  });
});

// Listen for clicks on either menu item
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID_PAGE) {
    saveVideoFromPage(tab);
  } else if (info.menuItemId === CONTEXT_MENU_ID_LINK) {
    saveVideoFromLink(info);
  }
});

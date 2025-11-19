import * as storage from "./shared/storage.js";

// Define IDs for our two context menu items
const CONTEXT_MENU_ID_PAGE = "SAVE_YT_VIDEO_PAGE";
const CONTEXT_MENU_ID_LINK = "SAVE_YT_VIDEO_LINK";

// Safely decodes HTML entities (e.g., &#39; -> ', &amp; -> &)
function decodeHtmlEntities(text) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  return textArea.value;
}

// Function to fetch a video's title from its URL
async function fetchVideoTitle(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const htmlText = await response.text();
    const titleMatch = htmlText.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      const encodedTitle = titleMatch[1].replace(" - YouTube", "").trim();
      return decodeHtmlEntities(encodedTitle);
    }
  } catch (error) {
    console.error("YT Storer: Failed to fetch video title.", error);
  }
  return "Video (title not found)";
}

// Handles saving from the current page
async function saveVideoFromPage(tab) {
  if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
    const videoUrl = new URL(tab.url);
    const videoId = videoUrl.searchParams.get("v");
    if (!videoId || videoId.length !== 11) return;

    const decodedTitle = decodeHtmlEntities(
      tab.title.replace(" - YouTube", "").trim(),
    );
    const newVideo = {
      url: tab.url,
      cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: decodedTitle,
      dateAdded: Date.now(),
      tags: [],
      id: videoId,
    };
    await storage.addVideo(newVideo);
  }
}

// Handles saving from a right-clicked link
async function saveVideoFromLink(info) {
  const linkUrl = info.linkUrl;
  if (linkUrl && linkUrl.includes("youtube.com/watch")) {
    const videoUrl = new URL(linkUrl);
    const videoId = videoUrl.searchParams.get("v");
    if (!videoId || videoId.length !== 11) return;

    const title = await fetchVideoTitle(linkUrl);
    const newVideo = {
      url: linkUrl,
      cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: title,
      dateAdded: Date.now(),
      tags: [],
      id: videoId,
    };
    await storage.addVideo(newVideo);
  }
}

// Create context menu items on install
browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: CONTEXT_MENU_ID_PAGE,
    title: "Store this video",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/watch*"],
  });
  browser.menus.create({
    id: CONTEXT_MENU_ID_LINK,
    title: "Store this video link",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/watch*"],
  });
});

// Listen for clicks on menu items
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID_PAGE) {
    saveVideoFromPage(tab);
  } else if (info.menuItemId === CONTEXT_MENU_ID_LINK) {
    saveVideoFromLink(info);
  }
});

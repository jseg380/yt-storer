import * as storage from "./shared/storage.js";
import * as sync from "./shared/sync.js";

const SYNC_ALARM_NAME = "yt-storer-sync";

async function ensureSyncAlarm(autoSyncOn) {
  if (autoSyncOn) {
    const existing = await browser.alarms.get(SYNC_ALARM_NAME);
    if (!existing) browser.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 5 });
  } else {
    browser.alarms.clear(SYNC_ALARM_NAME);
  }
}

async function performSync() {
  try {
    await sync.flushOutbox();
    const data = await storage.getData();
    if (!data.settings.sync?.enabled) return;
    const since = data.settings.sync.lastSyncedAt
      ? new Date(data.settings.sync.lastSyncedAt).toISOString()
      : null;
    const remoteChanges = await sync.pullRemoteChanges(since);
    await storage.applyRemoteChanges(remoteChanges);
    await storage.updateSyncSettings({ lastSyncedAt: Date.now() });
    await sync.reportSynced(data.settings.sync.deviceId);
  } catch (error) {
    console.error("YT Storer: Background sync failed.", error);
  }
}

// Keep the alarm's existence in sync with enabled+autoSync, reacting the
// same way every other surface in this extension reacts to data changes.
// autoSync is a separate opt-out from "connected at all" — someone can stay
// paired and use only the manual "Sync now" button if periodic background
// activity isn't something they want.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ytStorerData) {
    const syncSettings = changes.ytStorerData.newValue?.settings?.sync;
    ensureSyncAlarm(Boolean(syncSettings?.enabled && syncSettings?.autoSync));
  }
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) performSync();
});

// On browser startup (and extension install/reload, which re-runs this
// module the same way): re-establish the alarm, since storage.onChanged
// won't fire here as nothing actually changed, and get an immediate sync in
// rather than waiting up to 5 minutes for the first alarm tick.
storage.getData().then((data) => {
  const syncSettings = data.settings.sync ?? {};
  const autoSyncOn = Boolean(syncSettings.enabled && syncSettings.autoSync);
  ensureSyncAlarm(autoSyncOn);
  if (autoSyncOn) performSync();
});

// Define IDs for our context menu items
const CONTEXT_MENU_ID_PAGE_VIDEO = "SAVE_YT_VIDEO_PAGE";
const CONTEXT_MENU_ID_LINK_VIDEO = "SAVE_YT_VIDEO_LINK";
const CONTEXT_MENU_ID_PAGE_PLAYLIST = "SAVE_YT_PLAYLIST_PAGE";
const CONTEXT_MENU_ID_LINK_PLAYLIST = "SAVE_YT_PLAYLIST_LINK";
const CONTEXT_MENU_ID_PAGE_CHANNEL = "SAVE_YT_CHANNEL_PAGE";
const CONTEXT_MENU_ID_LINK_CHANNEL = "SAVE_YT_CHANNEL_LINK";

// Safely decodes HTML entities (e.g., &#39; -> ', &amp; -> &)
function decodeHtmlEntities(text) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  return textArea.value;
}

// Function to fetch a page's title from its URL
async function fetchPageTitle(url) {
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
    console.error("YT Storer: Failed to fetch page title.", error);
  }
  return "Unknown Title";
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

async function savePlaylistFromPage(tab) {
  if (tab && tab.url && tab.url.includes("youtube.com/playlist")) {
    const urlObj = new URL(tab.url);
    const listId = urlObj.searchParams.get("list");
    if (!listId) return;

    const decodedTitle = decodeHtmlEntities(
      tab.title.replace(" - YouTube", "").trim(),
    );
    const newPlaylist = {
      url: tab.url,
      cleanUrl: `https://www.youtube.com/playlist?list=${listId}`,
      title: decodedTitle,
      dateAdded: Date.now(),
      tags: [],
      id: listId,
    };
    await storage.addPlaylist(newPlaylist);
  }
}

async function saveChannelFromPage(tab) {
  // Channels can be /channel/ID, /c/Name, /user/Name, /@Handle
  if (tab && tab.url && (tab.url.includes("/channel/") || tab.url.includes("/c/") || tab.url.includes("/user/") || tab.url.includes("/@"))) {
    const decodedTitle = decodeHtmlEntities(
      tab.title.replace(" - YouTube", "").trim(),
    );
    // Use the URL as ID for channels if no specific ID is easily extractable without API, 
    // or try to extract the last segment. 
    // For simplicity and uniqueness, let's use the clean URL or the handle/ID part.
    // Let's use the full URL as ID for now to be safe, or a cleaned version.
    // Actually, let's try to get a unique identifier. 
    // If it's @Handle, that's good. If it's channel/ID, that's good.

    const newChannel = {
      url: tab.url,
      cleanUrl: tab.url, // Keep original for channels as they vary
      title: decodedTitle,
      dateAdded: Date.now(),
      tags: [],
      id: tab.url, // Using URL as ID for simplicity in this context
    };
    await storage.addChannel(newChannel);
  }
}

// Handles saving from a right-clicked link
async function saveVideoFromLink(info) {
  const linkUrl = info.linkUrl;
  if (linkUrl && linkUrl.includes("youtube.com/watch")) {
    const videoUrl = new URL(linkUrl);
    const videoId = videoUrl.searchParams.get("v");
    if (!videoId || videoId.length !== 11) return;

    const title = await fetchPageTitle(linkUrl);
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

async function savePlaylistFromLink(info) {
  const linkUrl = info.linkUrl;
  if (linkUrl && linkUrl.includes("youtube.com/playlist")) {
    const urlObj = new URL(linkUrl);
    const listId = urlObj.searchParams.get("list");
    if (!listId) return;

    const title = await fetchPageTitle(linkUrl);
    const newPlaylist = {
      url: linkUrl,
      cleanUrl: `https://www.youtube.com/playlist?list=${listId}`,
      title: title,
      dateAdded: Date.now(),
      tags: [],
      id: listId,
    };
    await storage.addPlaylist(newPlaylist);
  }
}

async function saveChannelFromLink(info) {
  const linkUrl = info.linkUrl;
  if (linkUrl) {
    const title = await fetchPageTitle(linkUrl);
    const newChannel = {
      url: linkUrl,
      cleanUrl: linkUrl,
      title: title,
      dateAdded: Date.now(),
      tags: [],
      id: linkUrl,
    };
    await storage.addChannel(newChannel);
  }
}

// Create context menu items on install
browser.runtime.onInstalled.addListener(() => {
  // Videos
  browser.menus.create({
    id: CONTEXT_MENU_ID_PAGE_VIDEO,
    title: "Store this video",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/watch*"],
  });
  browser.menus.create({
    id: CONTEXT_MENU_ID_LINK_VIDEO,
    title: "Store this video link",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/watch*"],
  });

  // Playlists
  browser.menus.create({
    id: CONTEXT_MENU_ID_PAGE_PLAYLIST,
    title: "Store this playlist",
    contexts: ["page"],
    documentUrlPatterns: ["*://*.youtube.com/playlist*"],
  });
  browser.menus.create({
    id: CONTEXT_MENU_ID_LINK_PLAYLIST,
    title: "Store this playlist link",
    contexts: ["link"],
    targetUrlPatterns: ["*://*.youtube.com/playlist*"],
  });

  // Channels
  const channelPatterns = [
    "*://*.youtube.com/channel/*",
    "*://*.youtube.com/c/*",
    "*://*.youtube.com/user/*",
    "*://*.youtube.com/@*",
  ];
  browser.menus.create({
    id: CONTEXT_MENU_ID_PAGE_CHANNEL,
    title: "Store this channel",
    contexts: ["page"],
    documentUrlPatterns: channelPatterns,
  });
  browser.menus.create({
    id: CONTEXT_MENU_ID_LINK_CHANNEL,
    title: "Store this channel link",
    contexts: ["link"],
    targetUrlPatterns: channelPatterns,
  });
});

// Listen for clicks on menu items
browser.menus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case CONTEXT_MENU_ID_PAGE_VIDEO:
      saveVideoFromPage(tab);
      break;
    case CONTEXT_MENU_ID_LINK_VIDEO:
      saveVideoFromLink(info);
      break;
    case CONTEXT_MENU_ID_PAGE_PLAYLIST:
      savePlaylistFromPage(tab);
      break;
    case CONTEXT_MENU_ID_LINK_PLAYLIST:
      savePlaylistFromLink(info);
      break;
    case CONTEXT_MENU_ID_PAGE_CHANNEL:
      saveChannelFromPage(tab);
      break;
    case CONTEXT_MENU_ID_LINK_CHANNEL:
      saveChannelFromLink(info);
      break;
  }
});

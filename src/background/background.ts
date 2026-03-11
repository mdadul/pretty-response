chrome.runtime.onInstalled.addListener(() => {
  // Reserved for future orchestration (e.g., context menus, options).
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
  }
  // Indicate synchronous response only.
  return false;
});


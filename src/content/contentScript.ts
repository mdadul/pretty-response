import { detectJsonFromHeaders, detectJsonFromText } from "../utils/jsonDetector";

function getContentType(): string | null {
  return (
    document.contentType ||
    document.head.querySelector("meta[http-equiv='Content-Type']")?.getAttribute("content") ||
    null
  );
}

function isProbablyJsonDocument(): boolean {
  const contentType = getContentType();
  const headerDetection = detectJsonFromHeaders(contentType);
  if (headerDetection.isJson) return true;

  const pre = document.body && document.body.innerText ? document.body.innerText : "";
  const bodySample = pre.slice(0, 200000); // sample up to 200KB
  const bodyDetection = detectJsonFromText(bodySample);
  return bodyDetection.isJson;
}

function injectViewer(jsonText: string): void {
  document.documentElement.innerHTML = "";

  const container = document.createElement("div");
  container.id = "pretty-json-root-container";
  container.style.height = "100vh";
  container.style.margin = "0";

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("src/viewer/viewer.html");
  iframe.style.border = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.setAttribute("title", "Pretty JSON Viewer");

  container.appendChild(iframe);
  document.documentElement.appendChild(container);

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage(
      {
        type: "PRETTY_JSON_INIT",
        payload: {
          text: jsonText,
          url: window.location.href,
          contentType: getContentType(),
          navigation: (() => {
            const navEntries = performance.getEntriesByType("navigation");
            const nav = (navEntries[0] as PerformanceNavigationTiming | undefined) ?? undefined;
            if (!nav) return undefined;
            return {
              transferSize: nav.transferSize,
              encodedBodySize: nav.encodedBodySize,
              decodedBodySize: nav.decodedBodySize
            };
          })()
        }
      },
      "*"
    );
  });
}

function bootstrap(): void {
  try {
    if (!document.body) return;
    if (!isProbablyJsonDocument()) return;

    const bodyText = document.body.innerText || "";
    const detection = detectJsonFromText(bodyText);
    if (!detection.isJson) return;

    injectViewer(bodyText.trim());
  } catch (error) {
    console.error("Pretty JSON Viewer content script error", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}


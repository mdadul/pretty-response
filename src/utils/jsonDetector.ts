export interface DetectionResult {
  isJson: boolean;
  reason?: string;
}

export function detectJsonFromHeaders(contentType: string | null): DetectionResult {
  if (!contentType) {
    return { isJson: false };
  }
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || ct.includes("text/json")) {
    return { isJson: true, reason: "content-type" };
  }
  return { isJson: false };
}

export function detectJsonFromText(bodyText: string): DetectionResult {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return { isJson: false };
  }
  const firstChar = trimmed[0];
  if (firstChar !== "{" && firstChar !== "[") {
    return { isJson: false };
  }

  try {
    JSON.parse(trimmed);
    return { isJson: true, reason: "heuristic-body" };
  } catch {
    return { isJson: false };
  }
}


export type ThemeId = "light" | "dark" | "dracula" | "solarized" | "nord";

export interface UserPreferences {
  theme: ThemeId;
  viewMode: "code" | "tree";
  fontScale: number;
  /**
   * Optional list of JSONPath strings the user has pinned.
   * Stored globally for now rather than per-origin.
   */
  pinnedPaths?: string[];
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  viewMode: "code",
  fontScale: 1,
  pinnedPaths: []
};

export function loadPreferences(): Promise<UserPreferences> {
  return new Promise((resolve) => {
    if (!chrome.storage) {
      resolve(DEFAULT_PREFERENCES);
      return;
    }
    chrome.storage.sync.get(["preferences"], (result) => {
      const prefs = result.preferences as UserPreferences | undefined;
      resolve({ ...DEFAULT_PREFERENCES, ...prefs });
    });
  });
}

export function savePreferences(prefs: UserPreferences): Promise<void> {
  return new Promise((resolve) => {
    if (!chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.sync.set({ preferences: prefs }, () => resolve());
  });
}


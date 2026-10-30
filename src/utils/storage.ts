export type ThemeId = "light" | "dark";

export interface HostPreset {
  id: string;
  host: string;
  name: string;
  pinnedPaths: string[];
}

export interface UserPreferences {
  theme: ThemeId;
  fontScale: number;
  sortKeys?: boolean;
  inspector?: boolean;
  /**
   * Optional list of JSONPath strings the user has pinned.
   * Stored globally for now rather than per-origin.
   */
  pinnedPaths?: string[];
  /**
   * Optional saved presets, usually scoped per host/origin.
   */
  presets?: HostPreset[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  fontScale: 1,
  sortKeys: false,
  inspector: typeof window !== "undefined" ? window.innerWidth >= 1100 : true,
  pinnedPaths: [],
  presets: []
};

export function loadPreferences(): Promise<UserPreferences> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      resolve(DEFAULT_PREFERENCES);
      return;
    }
    chrome.storage.sync.get(["preferences"], (result) => {
      const prefs = result.preferences as UserPreferences | undefined;
      const merged = { ...DEFAULT_PREFERENCES, ...prefs };
      if (merged.theme !== "light" && merged.theme !== "dark") {
        merged.theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      resolve(merged);
    });
  });
}

export function savePreferences(prefs: UserPreferences): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      resolve();
      return;
    }
    chrome.storage.sync.set({ preferences: prefs }, () => resolve());
  });
}


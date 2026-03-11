import type { ThemeId } from "../utils/storage";
import type * as monaco from "monaco-editor";

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  monacoTheme: monaco.editor.IStandaloneThemeData;
  rootClass: string;
}

export const themes: ThemeDefinition[] = [
  {
    id: "light",
    label: "Light",
    rootClass: "theme-light",
    monacoTheme: {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {}
    }
  },
  {
    id: "dark",
    label: "Dark",
    rootClass: "theme-dark",
    monacoTheme: {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {}
    }
  },
  {
    id: "dracula",
    label: "Dracula",
    rootClass: "theme-dracula",
    monacoTheme: {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#282a36",
        "editor.foreground": "#f8f8f2"
      }
    }
  },
  {
    id: "solarized",
    label: "Solarized",
    rootClass: "theme-solarized",
    monacoTheme: {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#fdf6e3",
        "editor.foreground": "#657b83"
      }
    }
  },
  {
    id: "nord",
    label: "Nord",
    rootClass: "theme-nord",
    monacoTheme: {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#2e3440",
        "editor.foreground": "#d8dee9"
      }
    }
  }
];

export function registerThemes(monacoInstance: typeof monaco): void {
  for (const theme of themes) {
    monacoInstance.editor.defineTheme(theme.id, theme.monacoTheme);
  }
}


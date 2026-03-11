import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import type * as monacoType from "monaco-editor/esm/vs/editor/editor.api";
import { registerThemes } from "./theme";
import type { ThemeId } from "../utils/storage";

export interface EditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  revealOffset: (offset: number) => void;
  foldAll: () => void;
  unfoldAll: () => void;
  foldLevel: (level: number) => void;
}

export interface JsonEditorProps {
  initialValue: string;
  theme: ThemeId;
  onReady?: (handle: EditorHandle) => void;
}

export const JsonEditor: FC<JsonEditorProps> = ({ initialValue, theme, onReady }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoType | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const monaco = await import("monaco-editor/esm/vs/editor/editor.api");
      if (cancelled) return;
      monacoRef.current = monaco;
      registerThemes(monaco);

      const container = containerRef.current;
      if (!container) return;

      const editor = monaco.editor.create(container, {
        value: initialValue,
        language: "json",
        theme,
        // keep the config lightweight: fewer effects, no auto-layout listener
        automaticLayout: false,
        wordWrap: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: "off",
        folding: true,
        renderWhitespace: "none",
        occurrencesHighlight: "off",
        renderLineHighlight: "none",
        smoothScrolling: false
      });
      editorRef.current = editor;
      setLoaded(true);

      const handle: EditorHandle = {
        getValue: () => editor.getValue(),
        setValue: (value: string) => editor.setValue(value),
        revealOffset: (offset: number) => {
          const model = editor.getModel();
          if (!model) return;
          const pos = model.getPositionAt(offset);
          editor.revealPositionInCenter(pos);
          editor.setPosition(pos);
          editor.focus();
        },
        foldAll: () => editor.getAction("editor.foldAll")?.run(),
        unfoldAll: () => editor.getAction("editor.unfoldAll")?.run(),
        foldLevel: (level: number) => editor.getAction(`editor.foldLevel${level}`)?.run()
      };

      onReady?.(handle);
    };
    load();
    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.dispose();
      }
    };
  }, [initialValue, onReady, theme]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!loaded || !monaco || !editorRef.current) return;
    monaco.editor.setTheme(theme);
  }, [theme, loaded]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        editorRef.current?.getAction("actions.find")?.run();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return <div ref={containerRef} className="h-full w-full" aria-label="JSON code editor" />;
};


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, "src/viewer/viewer.html"),
        background: resolve(__dirname, "src/background/background.ts"),
        contentScript: resolve(__dirname, "src/content/contentScript.ts"),
        devtools: resolve(__dirname, "src/devtools/devtools.html"),
        panel: resolve(__dirname, "src/panel/panel.html"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/background.js";
          if (chunk.name === "contentScript") return "src/content/contentScript.js";
          if (chunk.name === "devtools") return "src/devtools/devtools.js";
          if (chunk.name === "panel") return "src/panel/panel.js";
          return "src/viewer/[name].js";
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            // Route panel CSS to its own directory; viewer CSS stays where it was
            if (assetInfo.name.startsWith("panel")) return "src/panel/[name][extname]";
            return "src/viewer/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        }
      }
    },
    sourcemap: true,
    target: "esnext"
  }
});


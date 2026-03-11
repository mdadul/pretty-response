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
        contentScript: resolve(__dirname, "src/content/contentScript.ts")
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/background.js";
          if (chunk.name === "contentScript") return "src/content/contentScript.js";
          return "src/viewer/[name].js";
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            // Keep CSS files alongside the viewer entry with a proper extension
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


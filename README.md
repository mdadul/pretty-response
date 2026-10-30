## Pretty JSON Viewer

Pretty JSON is a browser extension that automatically detects standalone JSON responses and replaces the raw text with a fast, developer‑friendly viewer.

<img width="1728" height="993" alt="image" src="https://github.com/user-attachments/assets/264f80ba-9a3e-44f8-9f87-a31c42ad6a7a" />
<img width="1728" height="993" alt="image" src="https://github.com/user-attachments/assets/af9054d9-b869-4abd-b84b-9abebbd9012f" />


## Development

**Install dependencies**

```bash
bun install
```

**Run in development**

```bash
bun run dev
```

**Build the extension**

```bash
bun run build
```

This compiles the viewer (via Vite) into the `dist/` folder and copies `manifest.json`. Load `dist/` as an unpacked extension in your Chromium‑based browser.

## Features

- **Virtualized tree**: Renders only visible rows, so large payloads stay fast. Collapsed nodes show an inline preview, and indent guides make nesting easy to follow.
- **Keyboard navigation**: `↑ ↓ PgUp PgDn Home End` to move, `← →` to fold, `Enter` to toggle, `Alt` + click or `Alt` + arrow for whole subtrees, `⌘/Ctrl C` to copy the selected value.
- **Search**: `⌘/Ctrl F` searches keys and values, auto-expands to matches, and steps through them with `Enter` / `Shift Enter`.
- **JSONPath / jq queries**: `⌘/Ctrl K` runs queries like `$..name`, `$.items[?(@.price > 10)]` or `.items[].id`. Results stay linked to their source location.
- **Table view**: Arrays of objects open as a sortable, filterable table with CSV copy and download.
- **Inspector**: Shows the selected node's path as JSONPath, JS, Python and jq, its size and depth, and decoded values (timestamps, ISO dates, JWTs, base64, embedded JSON, URL query params).
- **Export**: Copy formatted or minified JSON, download it, or generate TypeScript, JSON Schema, Zod, Pydantic, Yup and Joi types.
- **Pinned paths & breadcrumbs**: Pin paths you return to and jump back from the status bar.
- **Light and dark mode**: Follows the system setting by default; `D` toggles it.

Press `?` in the viewer for all shortcuts and query examples.

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

- **Tree viewer**: Explore JSON structures with a collapsible tree and keyboard‑friendly search.
- **Safe mode for large JSON**: Automatically detects huge payloads and limits deep expansion to keep the UI responsive, with an explicit toggle to turn safe mode on or off.
- **Pinned paths & breadcrumbs**: Click nodes to focus paths, see breadcrumbs, and quickly jump to previously pinned paths.
- **Theme & font controls**: Switch between multiple themes and adjust font size directly from the toolbar.

# WebUI Design Plan & Roadmap

This document outlines the confirmed design and roadmap for the Franchise-JIT WebUI based on user feedback.

## 🎯 Core Objectives
- **Visibility**: See what timelines and shows are monitored.
- **Granular Control**: Skip specific episodes, seasons, or movies.
- **Management**: Add, remove, and edit timelines directly from the browser.

---

## 🛠️ Confirmed Tech Stack
To keep the deployment lightweight and simple:
- **Backend**: Extend the existing Node/Express server in `index.js`.
- **Frontend**: A modern Single Page Application (SPA) built with **Vanilla JS, HTML5, and Vanilla CSS**. 
  - *No build steps required.* Files will be served statically by Express.
- **Styling**: Premium, dark-mode design using CSS Grid, Flexbox, and modern UI tokens.

---

## 🗺️ Roadmap Phases

### Phase 1: Core API & Dashboard (Read-Only)
- **Backend**:
  - Expose `/api/timelines` to return loaded timelines and their items.
  - Expose `/api/status` to return current system status (Plex/Sonarr/Radarr connectivity).
- **Frontend**:
  - Dashboard showing all active timelines.
  - Clicking a timeline opens a detailed view.

### Phase 2: Granular Control (The "Skip" Feature)
- **Data Storage**:
  - "Skip" states will be stored **directly in the timeline JSON files**.
  - Schema updates:
    - Movies: `"skipped": true`
    - Shows (Full Season): `"skipped": true` or `"skippedEpisodes": [2, 3]`
    - Shows (Episode Blocks): `"skipped": true` or individual episode skipping.
- **Backend**:
  - Modify `handlePlaybackEvent` to check for `skipped: true` or `skippedEpisodes`.
  - Expose POST endpoints to update timeline JSONs with skip states.
- **Frontend**:
  - Checkboxes next to each item to toggle "Skip".

### Phase 3: Timeline Management & Editor
- **Features**:
  - **Unmonitor Timeline**: Toggle an `active` flag in the timeline or rename the file to `.disabled`.
  - **Add Timeline**: UI to upload a JSON file or paste a Trakt.tv URL.
  - **Timeline Editor**: Full CRUD interface for JSON items.
- **🔍 Implementation Detail: Media Search**
  - To add items without manual ID hunting, the WebUI will feature a search bar.
  - Instead of requiring extra API keys, the backend will **proxy search requests to Sonarr/Radarr APIs**, which return the necessary TVDB/TMDB IDs!

### Phase 4: Quality of Life (QoL)
- Real-time Logs (WebSockets).
- Manual "Sync Now" triggers.

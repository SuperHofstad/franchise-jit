# Kometa Integration Plan

This document outlines the finalized roadmap and technical requirements for integrating **Kometa** directly into the Franchise-JIT backend and future WebUI.

## ⚙️ Core Configuration

- **Default State:** `KOMETA_SYNC_PLAYLISTS` and `KOMETA_SYNC_COLLECTIONS` will default to **`false`** to prevent interfering with existing user setups without explicit consent.
- **Direct File Access:** The user will map their host Kometa configuration folder directly into the Franchise-JIT container. This can be done via CLI (`-v /data/appdata/kometa/config:/kometa/config`) or via `docker-compose.yml`:
  ```yaml
  volumes:
    - /data/appdata/kometa/config:/kometa/config
  ```
  *Note: Ensure both containers have appropriate read/write permissions for this shared space.*

## 🛠️ The YAML Strategy (One-File Approach)

Kometa requires files to be explicitly declared in its `config.yml`. To keep setups safe:
- Franchise-JIT will generate and maintain **one single file**: `/kometa/config/franchise_jit_playlists.yml`.
- This file will contain all active timelines grouped as distinct playlists/collections.
- **User Action:** Users add `- file: franchise_jit_playlists.yml` to their Kometa `config.yml` exactly once.

## ⏱️ Execution Timing & Plex Verification

Instead of relying on a blind cool-down timer, Franchise-JIT will implement a **Plex Readiness Check**:
1. When media is downloaded, the daemon queries the Plex REST API (searching by Title or TMDB/TVDB ID).
2. It verifies that Plex has registered the item **and** mapped a valid file path to it.
3. Once the path matches or the metadata is verified as "Ready", the daemon fires the Kometa `/run` API webhook.

## 🗺️ Roadmap Phases

- **Phase 1 (Backend):** Implement the `js-yaml` dependency, direct file generation, and the Plex verification loop.
- **Phase 2 (UI Integration):** Expose settings in the WebUI to toggle sync variables, manage lists, and visually edit the YAML payloads.

## 🔍 Proposed Changes

- **[index.js](file:///home/petter/f-jit/index.js)**: Implement Plex API polling verification and YAML builder.
- **[package.json](file:///home/petter/f-jit/package.json)**: Add `js-yaml`.
- **[README.md](file:///home/petter/f-jit/README.md)**: Update documentation for volume configurations.

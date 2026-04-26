<h1 align="center">Franchise-JIT Daemon</h1>
<p align="center">
  <strong>A "Just-In-Time" cross-media orchestration bridge that synchronizes Plex, Sonarr, Radarr, and Kometa to manage massive chronological media franchises.</strong>
</p>

<p align="center">
  <a href="https://github.com/superhofstad/franchise-jit"><strong>GitHub Repository</strong></a> | 
  <a href="https://hub.docker.com/r/phofstad/franchise-jit"><strong>Docker Hub Image</strong></a>
</p>

## ❓ What Problem Does This Solve?

If you are setting up an automated media server, you run into two massive problems when tackling huge franchises like **Star Wars**, the **Marvel Cinematic Universe**, or the **Arrowverse**:

1. **The Cross-Media Gap:** Tools like Sonarr manage TV shows, and Radarr manages Movies. But the MCU requires you to watch a movie, then a TV show, then another movie. No existing tool natively bridges this gap to trigger synchronization across different applications chronologically.
2. **The "Trakt List" Storage Optimizer (The Golden Use Case):** There are amazing community-curated lists on Trakt.tv with 500+ chronological items. If you feed one of these massive lists into standard automation tools, they will immediately try to synchronize all 500 items, consuming terabytes of storage for episodes you won't watch for months!

**Franchise-JIT** solves this. It acts as an orchestration bridge. It monitors what you watch in Plex, checks it against your custom JSON "Chronological Timeline", and tells Sonarr or Radarr to synchronize *only* the very next piece of media "Just-In-Time". 

## ✨ Key Features

- **Cross-Media Timelines**: Feed it a JSON list of TMDB (movies) and TVDB (shows) IDs. It seamlessly leaps between Radarr and Sonarr so you maintain franchises in perfect chronological order.
- **Season-by-Season Granularity**: Monitors TV Shows on a strictly Season-by-Season basis. This avoids massive multi-season data hoarding, but safely guarantees compatibility with modern "Season Pack" releases.
- **The Queue Janitor**: Includes an aggressive background loop that monitors your Sonarr/Radarr processing queues. It automatically purges incorrect releases (ISOs) and stalled transfers, blacklists them, and forces the Arrs to search for a new metadata match.
- **Multi-Timeline Processing**: Drop as many JSON timelines as you want into the `/config/timelines` folder. The Daemon monitors all of them simultaneously.
- **Auto-Populating Defaults**: On first launch, the container automatically populates your volume with pre-built Timelines (like Star Wars and MCU) to get you started immediately.

## 🛠 Prerequisites

- **Plex Pass OR Tautulli:** Required to send playback notifications to the Daemon.
- **Radarr & Sonarr:** Installed and accessible via API.
- **Docker:** To run this daemon.

## 🚀 Quick Start (Docker Run)

The shortest way to run the image immediately:
```bash
docker run -d \
  --name franchise-jit \
  -p 3005:3005 \
  -v $(pwd)/config:/config \
  -e RADARR_API_KEY=your_key \
  -e SONARR_API_KEY=your_key \
  phofstad/franchise-jit:latest
```

## 🛠 Installation (Docker Compose)

For a more permanent setup, use Docker Compose. We recommend using an `.env` file to keep your configuration clean.

1.  Download `docker-compose.yml` and `.env.example`.
2.  Rename `.env.example` to `.env` and fill in your API keys.
3.  Run the stack:

```yaml
services:
  franchise-jit:
    image: phofstad/franchise-jit:latest
    container_name: franchise-jit
    ports:
      - "3005:3005"
    volumes:
      - ./config:/config
    env_file: .env
    restart: unless-stopped
```

```bash
docker compose up -d
```

## 📖 Chronological Timelines

Franchise-JIT relies on JSON files to know what to process next. 
When you spin up the container for the first time, it will automatically drop default timeline files into your mapped `/config/timelines` folder.

You can edit these files or create your own! The structure is incredibly simple:

```json
[
  {
    "title": "Star Wars: Episode II - Attack of the Clones",
    "type": "movie",
    "tmdbId": 1894
  },
  {
    "title": "Star Wars: The Clone Wars Season 1",
    "type": "show",
    "tvdbId": 83268,
    "season": 1
  },
  {
    "title": "Daredevil Season 2 Episodes 1-4",
    "type": "show",
    "tvdbId": 281662,
    "season": 2,
    "episodes": [1, 2, 3, 4]
  }
]
```

**Variables:**
- `title`: The name of the media. (Used for logging and webhook matching. For shows, try to append "Season X" for clarity).
- `type`: Must be `"movie"` or `"show"`.
- `tmdbId` / `tvdbId`: The exact ID of the media from TMDB (Movies) or TVDB (Shows).
- `season`: (Shows only). The specific season number you want to process.
- `episodes`: *(Optional)*. An array of specific episodes to monitor (e.g., `[1, 2, 3]`). If included, the Daemon will trigger an EpisodeSearch for only those exact episodes, allowing you to perfectly weave complex crossover timelines! If omitted, it defaults to the full season.

### 🌟 Native Trakt List Integration (The Golden Feature)

Instead of manually building JSON timelines, you can tell Franchise-JIT to directly import community-curated chronological lists from Trakt.tv!

1. **Get an API Key:** Go to [Trakt API Settings](https://trakt.tv/oauth/applications) and create a new application. Grab your free `Client ID` and put it in your `.env` as `TRAKT_CLIENT_ID=...`.
2. **Create your Import File:** Inside your mapped `/config/timelines/` directory, create a text file called `trakt_imports.txt`.
3. **Paste URLs:** Paste the URLs of the Trakt lists you want to import, one per line. For example:
   ```text
   https://trakt.tv/users/someuser/lists/arrowverse-chronological
   https://trakt.tv/users/anotheruser/lists/the-ultimate-star-trek-timeline
   ```

When the Daemon boots up, it will fetch these Trakt lists, intelligently group the consecutive TV episodes together using our precise "Episode Granularity" engine, and instantly save them as ready-to-use JSON timelines!

## 🔌 Connecting to Plex

For the Daemon to know when you finish watching something, you must configure a webhook.

### Option A: Plex Webhooks (Requires Plex Pass)

1. Go to **Plex Web UI** > Settings > Webhooks.
2. Click **Add Webhook**.
3. Enter the URL: `http://<YOUR_DOCKER_IP>:3005/webhook`.
4. Click Save.

### Option B: Tautulli (No Plex Pass Required)

If you don't have Plex Pass, you can use [Tautulli](https://tautulli.com/) to trigger the sync.

1. In Tautulli, go to **Settings** > **Notification Agents**.
2. Click **Add a new notification agent** > **Webhook**.
3. **Webhook URL:** `http://<YOUR_DOCKER_IP>:3005/tautulli`
4. **HTTP Method:** `POST`
5. **Trigger:** Check `Watched` (under Playback Notifications).
6. **Data** (JSON): Paste the following into the **JSON Body** under the **Watched** tab:
   ```json
   {
     "event": "watched",
     "user": "{user}",
     "type": "{media_type}",
     "title": "{title}",
     "grandparentTitle": "{show_name}",
     "parentIndex": {season_num},
     "index": {episode_num}
   }
   ```
7. Click **Save**.

Now, whenever you finish watching a movie or episode, the Daemon will be notified!

## 🛡️ Safety & Advanced Features

Franchise-JIT is designed to be **100% non-destructive by default**. It will never accidentally unmonitor or remove your existing libraries. If a series already exists in Sonarr, the Daemon will simply upgrade the specific episodes you need to `monitored: true`.

However, for power-users, we offer two advanced environment variables:

### 1. The `PLEX_USER` Filter (Highly Recommended)
If you share your Plex server with friends or family, you do not want *their* viewing habits triggering *your* chronological timeline!
- Set `PLEX_USER=your_plex_username` in your `.env`.
- The Daemon will ignore all webhooks unless they perfectly match this username.
- **How to find your username:** This is your Plex Display Name (NOT your email address). You can find it by opening Plex Web and looking at the name in the top right corner dropdown menu.

### 2. Management Automation (`DELETE_AFTER_WATCHING`)
The entire philosophy of "Just-In-Time" is to optimize storage space.
- If you set `DELETE_AFTER_WATCHING=true`, the Daemon will automatically remove the media record from Radarr/Sonarr immediately after you finish watching it, and it will Unmonitor it.
- **Note:** If you already use native Plex management tools (like Plex Auto-Delete or Maintainerr) to manage your server space, you can simply leave this variable set to `false`.

## 🦊 Kometa Integration (Optional)

If you use [Kometa](https://kometa.wiki/) to automatically build your Chronological Collections in Plex, you'll want Kometa to run shortly after a new item finishes processing. 

Franchise-JIT can trigger Kometa for you! 
Make sure you set `ENABLE_KOMETA=true` in your environment variables, and configure the Host and Port:
- `KOMETA_HOST=kometa` (or your IP)
- `KOMETA_PORT=5000`

The Daemon will automatically hit `http://HOST:PORT/run` to trigger Kometa.

*Note: Kometa runs can take a long time depending on your library size. Most users simply let Kometa run on its own nightly schedule and leave `ENABLE_KOMETA=false` in Franchise-JIT!*

## ❓ FAQ

**Why not just use Pulsarr or Overseerr auto-requests?**
Tools like Pulsarr are fantastic for grabbing the *next episode* of a standard TV show and handling complex management logic. However, they have absolutely no concept of cross-franchise viewing. If you finish an *Agents of S.H.I.E.L.D.* episode, Pulsarr cannot tell Radarr to go find *Captain America: The Winter Soldier*. 

**Can I run Franchise-JIT alongside Pulsarr?**
**Yes! In fact, we highly encourage it.** They are a perfect match. You can leave `DELETE_AFTER_WATCHING=false` in Franchise-JIT, and let Pulsarr handle all of your advanced auto-management rules, while Franchise-JIT strictly handles your complex chronological synchronization.

**How does it handle duplicate requests?**
If the Daemon tells Sonarr to process Season 1, but Sonarr already has it, Sonarr natively ignores the request. Franchise-JIT is completely idempotent and safe to run alongside other tools.

## 🙏 Credits & Transparency

Franchise-JIT ships with pre-built chronological timelines for massive franchises. We did not curate these complex timelines ourselves. Massive credit and thanks goes to the dedicated communities who maintain these orders:
- **Marvel Cinematic Universe**: The default `marvel_mcu.json` timeline was parsed directly from the incredible work at [mcuinorder.com](https://mcuinorder.com/). 
- **Star Wars**: Sourced from universally accepted community watch-orders (like those found on Youtini and Reddit).

If you are a curator and want your custom timeline included natively in Franchise-JIT, feel free to open a Pull Request!

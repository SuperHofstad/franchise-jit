const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer();
const PORT = process.env.PORT || 3005;

// Global variable to hold all our timelines
let loadedTimelines = [];

// Environment Variables: Enable Toggles
// Default to true for Arrs, false for Kometa
const enableRadarr = process.env.ENABLE_RADARR !== 'false';
const enableSonarr = process.env.ENABLE_SONARR !== 'false';
const enableKometa = process.env.ENABLE_KOMETA === 'true';

// Environment Variable Parsing with Defaults
const radarrUrl = `http://${process.env.RADARR_HOST || 'radarr'}:${process.env.RADARR_PORT || 7878}`;
const sonarrUrl = `http://${process.env.SONARR_HOST || 'sonarr'}:${process.env.SONARR_PORT || 8989}`;

// Build Kometa URL dynamically if enabled
const kometaUrl = `http://${process.env.KOMETA_HOST || 'kometa'}:${process.env.KOMETA_PORT || 5000}/run`;

// Cache for Radarr/Sonarr settings
let arrConfig = {
    radarr: { rootFolder: null, profileId: null },
    sonarr: { rootFolder: null, profileId: null }
};

// --- Initialization ---
async function initializeArrConfig() {
    if (enableRadarr) {
        try {
            console.log(`Fetching Radarr configs from ${radarrUrl}...`);
            const rRoot = await axios.get(`${radarrUrl}/api/v3/rootfolder?apikey=${process.env.RADARR_API_KEY}`);
            const rProfile = await axios.get(`${radarrUrl}/api/v3/qualityprofile?apikey=${process.env.RADARR_API_KEY}`);

            if (rRoot.data.length > 0) arrConfig.radarr.rootFolder = rRoot.data[0].path;
            if (rProfile.data.length > 0) arrConfig.radarr.profileId = rProfile.data[0].id;

            console.log(`Radarr initialized: Root=${arrConfig.radarr.rootFolder}, Profile=${arrConfig.radarr.profileId}`);
        } catch (err) {
            console.error("Failed to initialize Radarr config. Check your RADARR_HOST and RADARR_API_KEY environment variables.", err.message);
        }
    } else {
        console.log("Radarr integration is disabled.");
    }

    if (enableSonarr) {
        try {
            console.log(`Fetching Sonarr configs from ${sonarrUrl}...`);
            const sRoot = await axios.get(`${sonarrUrl}/api/v3/rootfolder?apikey=${process.env.SONARR_API_KEY}`);
            const sProfile = await axios.get(`${sonarrUrl}/api/v3/qualityprofile?apikey=${process.env.SONARR_API_KEY}`);

            if (sRoot.data.length > 0) arrConfig.sonarr.rootFolder = sRoot.data[0].path;
            if (sProfile.data.length > 0) arrConfig.sonarr.profileId = sProfile.data[0].id;

            console.log(`Sonarr initialized: Root=${arrConfig.sonarr.rootFolder}, Profile=${arrConfig.sonarr.profileId}`);
        } catch (err) {
            console.error("Failed to initialize Sonarr config. Check your SONARR_HOST and SONARR_API_KEY environment variables.", err.message);
        }
    } else {
        console.log("Sonarr integration is disabled.");
    }

    if (enableKometa) {
        console.log(`Kometa integration is enabled. Webhook target: ${kometaUrl}`);
    }
}

// --- Native Trakt Integration ---
async function syncTraktLists() {
    const configDir = '/config/timelines';
    const importsFile = path.join(configDir, 'trakt_imports.txt');

    if (!fs.existsSync(importsFile)) return;

    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
        console.warn(`[Trakt] trakt_imports.txt found, but TRAKT_CLIENT_ID is missing from environment. Skipping sync.`);
        return;
    }

    console.log(`[Trakt] Syncing Trakt lists from ${importsFile}...`);
    const urls = fs.readFileSync(importsFile, 'utf-8').split('\n').map(u => u.trim()).filter(u => u);

    for (const url of urls) {
        const match = url.match(/users\/([^\/]+)\/lists\/([^\/]+)/);
        if (!match) {
            console.warn(`[Trakt] Invalid URL format: ${url}`);
            continue;
        }
        const username = match[1];
        const listname = match[2];

        try {
            console.log(`[Trakt] Fetching list: ${listname} by ${username}...`);
            const req = await axios.get(`https://api.trakt.tv/users/${username}/lists/${listname}/items?limit=1000`, {
                headers: {
                    'Content-Type': 'application/json',
                    'trakt-api-version': '2',
                    'trakt-api-key': clientId
                }
            });

            const traktItems = req.data;
            const timeline = [];

            for (const item of traktItems) {
                if (item.type === 'movie' && item.movie && item.movie.ids.tmdb) {
                    timeline.push({
                        title: item.movie.title,
                        type: 'movie',
                        tmdbId: item.movie.ids.tmdb
                    });
                } else if (item.type === 'season' && item.show && item.season) {
                    timeline.push({
                        title: `${item.show.title} Season ${item.season.number}`,
                        type: 'show',
                        tvdbId: item.show.ids.tvdb,
                        season: item.season.number
                    });
                } else if (item.type === 'episode' && item.show && item.episode) {
                    const lastItem = timeline.length > 0 ? timeline[timeline.length - 1] : null;

                    if (lastItem && lastItem.type === 'show' && lastItem.tvdbId === item.show.ids.tvdb && lastItem.season === item.episode.season && lastItem.episodes) {
                        if (!lastItem.episodes.includes(item.episode.number)) {
                            lastItem.episodes.push(item.episode.number);
                            lastItem.title = `${item.show.title} Season ${item.episode.season} Episodes ${lastItem.episodes[0]}-${lastItem.episodes[lastItem.episodes.length - 1]}`;
                        }
                    } else {
                        timeline.push({
                            title: `${item.show.title} Season ${item.episode.season} Episode ${item.episode.number}`,
                            type: 'show',
                            tvdbId: item.show.ids.tvdb,
                            season: item.episode.season,
                            episodes: [item.episode.number]
                        });
                    }
                }
            }

            if (timeline.length > 0) {
                const savePath = path.join(configDir, `trakt_${listname}.json`);
                fs.writeFileSync(savePath, JSON.stringify(timeline, null, 2));
                console.log(`[Trakt] Successfully parsed and saved ${timeline.length} items to trakt_${listname}.json`);
            }

        } catch (err) {
            console.error(`[Trakt] Failed to fetch list ${listname}:`, err.message);
        }
    }
}

// --- The Chronological Timeline Loader ---
function loadTimelines() {
    const configDir = '/config/timelines';
    const defaultDir = path.join(__dirname, 'default_timelines');

    if (!fs.existsSync(configDir)) {
        console.log(`[Timeline] Creating timeline directory at ${configDir}...`);
        fs.mkdirSync(configDir, { recursive: true });
    }

    const files = fs.readdirSync(configDir);
    if (files.length === 0) {
        console.log(`[Timeline] No timelines found. Populating default Chronological Timelines...`);
        if (fs.existsSync(defaultDir)) {
            const defaultFiles = fs.readdirSync(defaultDir);
            for (const file of defaultFiles) {
                fs.copyFileSync(path.join(defaultDir, file), path.join(configDir, file));
                console.log(`[Timeline] Copied default: ${file}`);
            }
        }
    }

    loadedTimelines = [];
    const activeFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));

    for (const file of activeFiles) {
        try {
            const rawData = fs.readFileSync(path.join(configDir, file), 'utf-8');
            const parsedData = JSON.parse(rawData);
            loadedTimelines.push({ name: file, data: parsedData });
            console.log(`[Timeline] Loaded timeline: ${file} (${parsedData.length} items)`);
        } catch (err) {
            console.error(`[Timeline] Failed to load ${file}. Ensure it is valid JSON!`, err.message);
        }
    }
}

// --- Request Dispatchers ---
async function dispatchRadarr(item) {
    if (!enableRadarr) return;

    if (!arrConfig.radarr.rootFolder || !arrConfig.radarr.profileId) {
        console.error("Radarr config not fully initialized, skipping download.");
        return;
    }

    console.log(`[JIT] Dispatching Movie to Radarr: ${item.title}`);
    try {
        await axios.post(`${radarrUrl}/api/v3/movie?apikey=${process.env.RADARR_API_KEY}`, {
            title: item.title,
            qualityProfileId: arrConfig.radarr.profileId,
            tmdbId: item.tmdbId,
            rootFolderPath: arrConfig.radarr.rootFolder,
            monitored: true,
            addOptions: { searchForMovie: true }
        });
        console.log(`[JIT] Success: Sent ${item.title} to Radarr.`);
    } catch (err) {
        if (err.response && err.response.data && JSON.stringify(err.response.data).includes('already exists')) {
            console.log(`[JIT] ${item.title} already exists in Radarr.`);
        } else {
            console.error(`[JIT] Error sending to Radarr:`, err.message);
        }
    }
}

async function dispatchSonarr(item) {
    if (!enableSonarr) return;

    if (!arrConfig.sonarr.rootFolder || !arrConfig.sonarr.profileId) {
        console.error("Sonarr config not fully initialized, skipping download.");
        return;
    }

    console.log(`[JIT] Dispatching Show to Sonarr: ${item.title}`);
    try {
        let seriesId;
        try {
            const seriesData = await axios.post(`${sonarrUrl}/api/v3/series?apikey=${process.env.SONARR_API_KEY}`, {
                title: item.title,
                qualityProfileId: arrConfig.sonarr.profileId,
                tvdbId: item.tvdbId,
                rootFolderPath: arrConfig.sonarr.rootFolder,
                monitored: false,
                seasonFolder: true,
                addOptions: { searchForMissingEpisodes: false }
            });
            seriesId = seriesData.data.id;
        } catch (addErr) {
            if (addErr.response && addErr.response.data && JSON.stringify(addErr.response.data).includes('already exists')) {
                const existing = await axios.get(`${sonarrUrl}/api/v3/series?tvdbId=${item.tvdbId}&apikey=${process.env.SONARR_API_KEY}`);
                if (existing.data && existing.data.length > 0) {
                    seriesId = existing.data[0].id;
                } else {
                    throw new Error("Series exists but could not retrieve ID.");
                }
            } else {
                throw addErr;
            }
        }

        if (item.season !== undefined && seriesId) {
            console.log(`[JIT] Sonarr: Monitoring Season ${item.season}...`);
            const episodesReq = await axios.get(`${sonarrUrl}/api/v3/episode?seriesId=${seriesId}&apikey=${process.env.SONARR_API_KEY}`);
            const seasonEpisodes = episodesReq.data.filter(ep => ep.seasonNumber === item.season);

            let targetEpisodes = seasonEpisodes;
            if (item.episodes && Array.isArray(item.episodes)) {
                targetEpisodes = seasonEpisodes.filter(ep => item.episodes.includes(ep.episodeNumber));
                console.log(`[JIT] Sonarr: Specifically targeting episodes: ${item.episodes.join(', ')}`);
            }

            const episodeIds = targetEpisodes.map(ep => ep.id);

            if (episodeIds.length > 0) {
                await axios.put(`${sonarrUrl}/api/v3/episode/monitor?apikey=${process.env.SONARR_API_KEY}`, {
                    episodeIds: episodeIds,
                    monitored: true
                });

                if (item.episodes && Array.isArray(item.episodes)) {
                    console.log(`[JIT] Sonarr: Triggering EpisodeSearch for Season ${item.season}...`);
                    await axios.post(`${sonarrUrl}/api/v3/command?apikey=${process.env.SONARR_API_KEY}`, {
                        name: "EpisodeSearch",
                        episodeIds: episodeIds
                    });
                } else {
                    console.log(`[JIT] Sonarr: Triggering SeasonSearch for Season ${item.season}...`);
                    await axios.post(`${sonarrUrl}/api/v3/command?apikey=${process.env.SONARR_API_KEY}`, {
                        name: "SeasonSearch",
                        seriesId: seriesId,
                        seasonNumber: item.season
                    });
                }
            } else {
                console.log(`[JIT] Sonarr: No episodes found for Season ${item.season} in TVDB data.`);
            }
        }
        console.log(`[JIT] Success: Completed granular Sonarr dispatch for ${item.title}.`);
    } catch (err) {
        console.error(`[JIT] Error sending to Sonarr:`, err.message);
    }
}

// --- Queue Janitor Logic ---
async function cleanArrQueue(appUrl, apiKey, appName) {
    if (!appUrl || !apiKey) return;

    try {
        const queueRes = await axios.get(`${appUrl}/api/v3/queue?apikey=${apiKey}`);
        const queue = queueRes.data.records;

        for (const item of queue) {
            let shouldDelete = false;
            let reason = "";

            const isCompleted = item.status === "completed" || item.status === "completedPending";
            const messagesStr = JSON.stringify(item.statusMessages || []);

            if (isCompleted && messagesStr.includes("No files found are eligible for import")) {
                shouldDelete = true;
                reason = "Fake Torrent detected (No media files found)";
            }

            if (item.status === "warning" || (item.status === "downloading" && item.timeleft === "00:00:00")) {
                const addedTime = new Date(item.added).getTime();
                const now = new Date().getTime();
                const hoursStalled = (now - addedTime) / (1000 * 60 * 60);

                if (hoursStalled >= 2) {
                    shouldDelete = true;
                    reason = `Stalled Torrent detected (In queue for ${hoursStalled.toFixed(1)} hours)`;
                }
            }

            if (shouldDelete) {
                console.log(`[Janitor - ${appName}] Cleaning up item: ${item.title} - ${reason}`);
                await axios.delete(`${appUrl}/api/v3/queue/${item.id}?removeFromClient=true&blocklist=true&apikey=${apiKey}`);

                if (item.movieId) {
                    await axios.post(`${appUrl}/api/v3/command?apikey=${apiKey}`, {
                        name: "MoviesSearch",
                        movieIds: [item.movieId]
                    });
                } else if (item.episodeId) {
                    await axios.post(`${appUrl}/api/v3/command?apikey=${apiKey}`, {
                        name: "EpisodeSearch",
                        episodeIds: [item.episodeId]
                    });
                } else if (item.seriesId) {
                    await axios.post(`${appUrl}/api/v3/command?apikey=${apiKey}`, {
                        name: "SeriesSearch",
                        seriesId: item.seriesId
                    });
                }
                console.log(`[Janitor - ${appName}] Successfully removed ${item.title} and triggered a new search.`);
            }
        }
    } catch (err) {
        console.error(`[Janitor - ${appName}] Error checking queue:`, err.message);
    }
}

function startJanitor() {
    console.log("[Janitor] Starting background queue cleanup loop (every 5 minutes)...");
    setInterval(() => {
        if (enableRadarr) cleanArrQueue(radarrUrl, process.env.RADARR_API_KEY, "Radarr");
        if (enableSonarr) cleanArrQueue(sonarrUrl, process.env.SONARR_API_KEY, "Sonarr");
    }, 5 * 60 * 1000);

    // Initial run
    if (enableRadarr) cleanArrQueue(radarrUrl, process.env.RADARR_API_KEY, "Radarr");
    if (enableSonarr) cleanArrQueue(sonarrUrl, process.env.SONARR_API_KEY, "Sonarr");
}

// --- JIT Deletion Logic ---
async function deleteWatchedMedia(meta) {
    if (process.env.DELETE_AFTER_WATCHING !== 'true') return;
    try {
        if (meta.type === 'movie' && enableRadarr) {
            const movies = await axios.get(`${radarrUrl}/api/v3/movie?apikey=${process.env.RADARR_API_KEY}`);
            const movie = movies.data.find(m => m.title.toLowerCase() === meta.title.toLowerCase());
            if (movie && movie.hasFile && movie.movieFile) {
                console.log(`[JIT] Deleting movie file for ${movie.title}...`);
                await axios.delete(`${radarrUrl}/api/v3/moviefile/${movie.movieFile.id}?apikey=${process.env.RADARR_API_KEY}`);

                movie.monitored = false;
                await axios.put(`${radarrUrl}/api/v3/movie/${movie.id}?apikey=${process.env.RADARR_API_KEY}`, movie);
                console.log(`[JIT] Successfully deleted and unmonitored ${movie.title}`);
            }
        } else if (meta.type === 'episode' && enableSonarr) {
            const seriesList = await axios.get(`${sonarrUrl}/api/v3/series?apikey=${process.env.SONARR_API_KEY}`);
            const series = seriesList.data.find(s => s.title.toLowerCase() === meta.grandparentTitle.toLowerCase());
            if (series) {
                const episodes = await axios.get(`${sonarrUrl}/api/v3/episode?seriesId=${series.id}&apikey=${process.env.SONARR_API_KEY}`);
                const episode = episodes.data.find(e => e.seasonNumber === meta.parentIndex && e.episodeNumber === meta.index);
                if (episode && episode.hasFile && episode.episodeFileId) {
                    console.log(`[JIT] Deleting episode file for ${series.title} S${meta.parentIndex}E${meta.index}...`);
                    await axios.delete(`${sonarrUrl}/api/v3/episodefile/${episode.episodeFileId}?apikey=${process.env.SONARR_API_KEY}`);

                    await axios.put(`${sonarrUrl}/api/v3/episode/monitor?apikey=${process.env.SONARR_API_KEY}`, {
                        episodeIds: [episode.id],
                        monitored: false
                    });
                    console.log(`[JIT] Successfully deleted and unmonitored episode.`);
                }
            }
        }
    } catch (error) {
        console.error(`[JIT] Failed to delete media:`, error.message);
    }
}

// --- Webhook Route ---
app.post('/webhook', upload.none(), async (req, res) => {
    res.status(200).send('OK');

    try {
        if (!req.body || !req.body.payload) return;

        const payload = JSON.parse(req.body.payload);

        const plexUser = process.env.PLEX_USER;
        if (plexUser && payload.Account && payload.Account.title && payload.Account.title.toLowerCase() !== plexUser.toLowerCase()) {
            console.log(`[Webhook] Ignored: Watched by user '${payload.Account.title}', but PLEX_USER is set to '${plexUser}'.`);
            return;
        }

        if (payload.event === 'media.scrobble') {
            const meta = payload.Metadata;
            const watchedTitle = meta.type === 'episode' ? meta.grandparentTitle : meta.title;
            let searchTitle = watchedTitle;
            if (meta.type === 'episode' && meta.parentIndex) {
                searchTitle = `${watchedTitle} Season ${meta.parentIndex}`;
            }

            console.log(`[Webhook] User finished watching: ${searchTitle}`);

            await deleteWatchedMedia(meta);

            let matched = false;
            for (const timelineObj of loadedTimelines) {
                const timeline = timelineObj.data;
                let index = -1;

                for (let i = 0; i < timeline.length; i++) {
                    const t = timeline[i];

                    if (t.type === 'movie' && meta.type === 'movie' && t.title.toLowerCase() === watchedTitle.toLowerCase()) {
                        index = i;
                        break;
                    } else if (t.type === 'show' && meta.type === 'episode') {
                        const titleMatches = t.title.toLowerCase() === watchedTitle.toLowerCase() || t.title.toLowerCase() === searchTitle.toLowerCase();
                        const seasonMatches = t.season === meta.parentIndex;

                        if (titleMatches && seasonMatches) {
                            if (t.episodes && Array.isArray(t.episodes)) {
                                // Only progress the timeline if they watched the LAST episode in this block
                                const lastEpisodeInBlock = t.episodes[t.episodes.length - 1];
                                if (meta.index === lastEpisodeInBlock) {
                                    index = i;
                                    break;
                                }
                            } else {
                                // If no episodes array, it's a full season block. Progress on any episode watch (relying on idempotency).
                                index = i;
                                break;
                            }
                        }
                    }
                }

                if (index !== -1) {
                    console.log(`[Timeline] Match found in ${timelineObj.name} at index ${index}`);
                    matched = true;

                    const lookAheadItems = [];
                    if (timeline[index + 1]) lookAheadItems.push(timeline[index + 1]);
                    if (timeline[index + 2]) lookAheadItems.push(timeline[index + 2]);

                    for (const item of lookAheadItems) {
                        if (item.type === 'movie') {
                            await dispatchRadarr(item);
                        } else if (item.type === 'show') {
                            await dispatchSonarr(item);
                        }
                    }
                    break;
                }
            }

            if (!matched) {
                console.log(`[Timeline] ${searchTitle} not found in any loaded custom timelines.`);
            }

            // Attempt Kometa Trigger
            if (matched && enableKometa) {
                console.log(`[JIT] Triggering Kometa Webhook...`);
                axios.post(kometaUrl).catch(e => {
                    console.log(`[Kometa] Webhook failed (Kometa may be offline or URL is incorrect): ${e.message}`);
                });
            }
        }
    } catch (err) {
        console.error("Webhook processing error:", err.message);
    }
});

app.listen(PORT, async () => {
    console.log(`===========================================`);
    console.log(`Franchise-JIT Daemon V3 listening on port ${PORT}`);
    console.log(`===========================================`);
    await syncTraktLists();
    loadTimelines();
    await initializeArrConfig();
    startJanitor();
});

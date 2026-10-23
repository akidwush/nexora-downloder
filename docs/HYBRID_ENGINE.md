# Nexora Hybrid Engine — branch experiment

> This document describes an **experimental branch**. Nothing here is deployed to `main`.

## What changed

- Mori Core remains the first-choice media extractor for the original 16 platform families.
- A pinned `@coflyn/scrapr@1.3.1` library adds an explicit fallback plus selectable provider methods.
- 12 additional accepted URL categories: SoundCloud, MediaFire, Sfile, Pixeldrain, Catbox, Krakenfiles, Google Drive, Doodstream, Safelinku, Sub2Unlock, Rekonise, and generic shortlink unshortening.
- The UI keeps automatic selection as default and offers an optional advanced selector for engine/provider.
- Provider responses are normalized for video, audio, images, files and collection/playlist metadata.
- Collections list up to 20 items. Each item may be analyzed individually; there is **no batch downloader, muxer, audio conversion or cross-provider quality guarantee**.
- Shortlink resolvers show a **copyable destination only**, not a direct download or automatic outbound redirect.
- Every downloadable media URL still goes through the existing HTTPS / public-IP validation, short-lived signing and Netlify Edge media gateway.

## Operational constraints

- Scrapr is loaded lazily after allowlisted input validation; at most three Scrapr providers are tried automatically, sequentially, with per-attempt timeouts. Advanced selection exposes the other provider methods.
- Scrapr's optional browser automation dependencies are omitted via `.npmrc` for lightweight Netlify deploys. Browser-required methods may fail on serverless and must be reported as unavailable.
- No Supabase, database, background worker, runtime OTA bundle installer, Chromium or new paid infrastructure.
- Existing 4-video / 24h / IP gate remains **per warm function instance**, not a durable or globally exact limiter. Non-audio/image file downloads conservatively use the same signed-token quota gate.
- Existing Edge proxy streams media bytes through Netlify, consuming bandwidth; maximum 120 MB per response remains.
- Do not present link resolvers or file providers as guaranteed downloadable media. Some provider APIs may be unavailable or change without notice.
- Only test with public resources you have permission to download; no login, private media or DRM bypass.

## Validation and release gate

1. `npm run check` and `npm test`.
2. Install dependencies with optional browser binaries omitted, bundle Netlify Functions, and check the output for unresolved imports.
3. Mock success, provider errors, empty results and timeouts; verify host allowlist, link output and collection normalization.
4. Perform real provider smoke tests with authorized public URLs and inspect Netlify preview deploy logs and bandwidth.
5. Test mobile layouts, same-origin media preview, Range responses, file downloads, expired token and 429 response.
6. Review this branch and its draft PR. **Merge manually only after tests and deployment review; do not automatically publish**.

## References

- [Mori](https://github.com/coflyn/Mori) (GPL-3.0-or-later)
- [Scrapr](https://github.com/coflyn/scrapr) (MIT)

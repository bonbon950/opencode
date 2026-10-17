# BGC Condo — scroll = video

Desktop/laptop-only luxury film site. Scroll position drives `video.currentTime`; the video is never played.

Run: `python3 -m http.server 8000` in this folder, open http://localhost:8000. (Use http, not file:// — the loader fetches the video as a blob for instant seeks; file:// falls back to a plain `src`.)

## Replace the video
Drop your file at `assets/bgc-condo.mp4` (path is on the `<video>` in `index.html`). The bundled file is a placeholder.
For smooth scrubbing in both directions, re-encode with a keyframe on every frame:

    ffmpeg -i source.mp4 -vf scale=1920:-2 -c:v libx264 -preset slow -crf 23 -g 1 -pix_fmt yuv420p -movflags +faststart -an assets/bgc-condo.mp4

Keep it to roughly 40 MB or less (the whole file is buffered in memory before the site opens).

## Tune
- `main.js` → `SCROLL_MULTIPLIER`: viewport-heights of scrolling for the full video (default 6).
- `index.html` → `.chapter` blocks: `data-in` / `data-out` (0–1 of video progress) control when text appears; position classes are in `styles.css`. Re-position them once your real footage is in so text avoids key architecture.
- Narrow viewports (<1024px) show a "designed for desktop" notice by design.

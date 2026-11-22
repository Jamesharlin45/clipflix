# ClipFlix

Turn long videos into viral shorts. Add a video and its captions (.srt or .vtt), find the best 12 to 60 second moments, and export 9:16 clips with burned-in captions at 1080p, 2K or 4K. Export runs in the browser (best in Chrome or Edge).

## Run

    npm install
    npm run dev

Optional: set `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`) to have Claude rank and title clips. Without it, clips are ranked by a keyword score.

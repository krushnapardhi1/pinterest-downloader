# PinVideo — Pinterest Video Downloader

Cloudflare Worker + Static Assets app. The API resolves publicly accessible Pinterest Pin pages and proxies publicly accessible MP4 files from Pinterest media hosts.

## Requirements
- Node.js 20+
- Cloudflare account permission to deploy the existing `pinterest-downloader` Worker

## Local setup
```bash
npm install
npm run dev
```
Open the local URL printed by Wrangler. Health check: `/api/health`.

## Deploy
Authenticate with `npx wrangler login` if needed, then run:
```bash
npm run check
npm run deploy
```
The Worker name and existing workers.dev URL are preserved.

## API
`POST /api/download` with JSON body `{"url":"https://www.pinterest.com/pin/..."}`. Success returns `video_url` and `download_url` paths.

## Limitations and responsible use
Only public Pins exposing an MP4 in page metadata/embedded data can be resolved. Private, deleted, login-gated, image-only, or restricted Pins cannot be downloaded. Pinterest may change its markup or block automated requests, so extraction is best-effort and may need maintenance. Use only content you own or have permission to download. This does not bypass login, privacy controls, DRM, or access restrictions. URLs are not persisted.

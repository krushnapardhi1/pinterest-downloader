const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const PINTEREST_HOSTS = ["pinterest.com", "pin.it"];
const MEDIA_HOSTS = ["pinimg.com", "pinterest.com"];
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
function allowedHost(host, roots) { return roots.some(root => host === root || host.endsWith("." + root)); }
function cleanPinUrl(value) {
  try { const u = new URL(value); if (u.protocol !== "https:" || !allowedHost(u.hostname.toLowerCase(), PINTEREST_HOSTS)) return null; u.hash = ""; return u; } catch { return null; }
}
function extractVideo(html) {
  const patterns = [
    /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video:secure_url["']/i,
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i,
    /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
    /"video_url"\s*:\s*"([^"]+\.mp4[^"]*)"/i
  ];
  for (const re of patterns) {
    const m = html.match(re); if (!m?.[1]) continue;
    const raw = m[1].replace(/&amp;/g, "&").replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    try { const u = new URL(raw); if (u.protocol === "https:" && allowedHost(u.hostname.toLowerCase(), MEDIA_HOSTS) && /\.mp4(?:$|[?#])/i.test(u.href)) return u; } catch {}
  }
  return null;
}
async function resolvePin(initial) {
  let current = initial;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(current.href, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (compatible; PinVideoDownloader/1.0)", accept: "text/html,application/xhtml+xml" } });
    if ([301,302,303,307,308].includes(r.status)) {
      const loc = r.headers.get("location"); if (!loc) throw new Error("Pinterest returned an invalid redirect.");
      const next = cleanPinUrl(new URL(loc, current).href); if (!next) throw new Error("Pinterest redirected to an unsupported address."); current = next; continue;
    }
    if (!r.ok) throw new Error("Pinterest could not load this Pin. It may be private, removed, or temporarily unavailable.");
    if (!(r.headers.get("content-type") || "").includes("text/html")) throw new Error("Pinterest did not return a Pin page.");
    const html = await r.text(); if (html.length > 8_000_000) throw new Error("Pinterest page is too large to process.");
    const media = extractVideo(html); if (!media) throw new Error("No public MP4 video was found. This Pin may be an image, private, or Pinterest may have changed its page format.");
    return media;
  }
  throw new Error("Too many Pinterest redirects.");
}
async function downloadApi(request) {
  if (request.method !== "POST") return json({ error: "Use POST for this endpoint." }, 405);
  let body; try { body = await request.json(); } catch { return json({ error: "Send valid JSON." }, 400); }
  const pin = cleanPinUrl(body?.url); if (!pin) return json({ error: "Enter a valid public Pinterest URL (pinterest.com or pin.it)." }, 400);
  try {
    const media = await resolvePin(pin);
    const file = "/api/file?url=" + encodeURIComponent(media.href);
    return json({ success: true, video_url: file, download_url: file + "&download=1" });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to process this Pin." }, 422); }
}
async function fileApi(request) {
  const u = new URL(request.url); let media;
  try { media = new URL(u.searchParams.get("url") || ""); } catch { return new Response("Invalid media URL.", { status: 400 }); }
  if (media.protocol !== "https:" || !allowedHost(media.hostname.toLowerCase(), MEDIA_HOSTS) || !/\.mp4(?:$|[?#])/i.test(media.href)) return new Response("Unsupported media URL.", { status: 400 });
  const h = new Headers({ "user-agent": "Mozilla/5.0 (compatible; PinVideoDownloader/1.0)", accept: "video/mp4,video/*;q=0.9,*/*;q=0.1" });
  const range = request.headers.get("range"); if (range) h.set("range", range);
  const upstream = await fetch(media.href, { headers: h, redirect: "manual" });
  if (![200,206].includes(upstream.status)) return new Response("Video source unavailable. Please try again.", { status: 502 });
  const type = upstream.headers.get("content-type") || "video/mp4";
  if (!type.startsWith("video/") && !type.includes("octet-stream")) return new Response("Source did not return a video.", { status: 502 });
  const out = new Headers({ "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "accept-ranges": upstream.headers.get("accept-ranges") || "bytes" });
  for (const k of ["content-length","content-range"]) { const v = upstream.headers.get(k); if (v) out.set(k,v); }
  if (u.searchParams.get("download") === "1") out.set("content-disposition", 'attachment; filename="pinterest-video.mp4"');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
export default {
  async fetch(request, env) {
    const p = new URL(request.url).pathname;
    if (p === "/api/health") return json({ ok: true, service: "PinVideo API" });
    if (p === "/api/download") return downloadApi(request);
    if (p === "/api/file") return fileApi(request);
    return env.ASSETS.fetch(request);
  }
};

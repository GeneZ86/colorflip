/* Minimaler Service Worker: macht Color-Flip offline spielbar. */
const CACHE = "colorflip-1.3.1";
const CORE = ["./", "./manifest.webmanifest",
  "./icon-180.png", "./icon-192.png", "./icon-512.png",
  "./chakrapetch-500.woff2", "./chakrapetch-600.woff2", "./chakrapetch-700.woff2"];

/*
 * Eine Antwort, die aus einer Weiterleitung stammt, darf niemals als Antwort auf
 * eine Navigation dienen — Safari bricht dann mit "Response served by service
 * worker has redirections" ab, und die App startet gar nicht mehr. Manche Hoster
 * (Cloudflare Pages etwa) leiten /index.html auf / um; genau so entsteht eine
 * solche Antwort. Deshalb wird jede Antwort vor dem Ablegen von ihrer
 * Weiterleitungsspur befreit.
 */
async function clean(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await c.put(url, await clean(res));
      } catch (err) { /* fehlt eben, der Rest funktioniert trotzdem */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Jede Navigation bekommt die Startseite aus dem Vorrat — egal, ob sie als
  // "/" oder "/index.html" angefragt wurde.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match("./");
      if (hit) return hit;
      try { return await clean(await fetch(req)); }
      catch (err) { return (await c.match("./index.html")) || Response.error(); }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});

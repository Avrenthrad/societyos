// Offline support for the installed app.
// Pages: network first, so every new deploy shows up straight away; the
// saved copy is used only when offline. Built files have hashed names and
// never change, so they come from the cache first.
// Other SocietyOS apps live in sub-folders of this site (/societyos/finance/
// and so on) and run their own worker, so leave their requests and caches alone.
const CACHE = "today-v2";
const PREFIX = "today-";
const OWN_FOLDERS = ["_expo", "assets"];

function isSiblingApp(url) {
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return false;
  const rest = url.pathname.slice(scope.length);
  const slash = rest.indexOf("/");
  return slash > 0 && !OWN_FOLDERS.includes(rest.slice(0, slash));
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || isSiblingApp(url)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

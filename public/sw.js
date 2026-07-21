// ReformerX PWA service worker: cache shell, network-first for pages.
const CACHE = "rx-v1";
const SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok && new URL(request.url).origin === location.origin) {
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((m) => m || caches.match("/")))
  );
});

// ---- Web Push ----
self.addEventListener("push", (event) => {
  let data = { title: "ReformerX", body: "You have an update." };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});

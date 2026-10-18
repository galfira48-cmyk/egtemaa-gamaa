/* Glavera service worker: يخلّي التطبيق والألعاب تشتغل من غير نت */
const VERSION = 'glavera-offline-v2';
const SHELL = './index.html';

/* مكتبات خارجية لازمة للتطبيق، بتتحمّل مرة واحدة وتتخزّن على الجهاز */
const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'
];
const CACHEABLE_HOSTS = [
  'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com',
  'www.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com'
];

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(VERSION);
    /* كل ملف لوحده عشان لو واحد فشل الباقي يتخزّن */
    const urls = ['./', SHELL, 'manifest.json?v=3'].concat(CDN_ASSETS);
    await Promise.all(urls.map(function (u) {
      return cache.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) {
      return k.indexOf('glavera-offline-') === 0 && k !== VERSION;
    }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function putIfOk(cache, req, res) {
  if (res && (res.ok || res.type === 'opaque')) { try { cache.put(req, res.clone()); } catch (e) {} }
  return res;
}

/* الصفحة: نجرّب النت الأول (3 ثواني) ولو مفيش نرجع للنسخة المحفوظة */
async function handleNavigation(req) {
  const cache = await caches.open(VERSION);
  try {
    const net = await Promise.race([
      fetch(req),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 3000); })
    ]);
    if (net && net.ok) { cache.put(SHELL, net.clone()); return net; }
    throw new Error('bad');
  } catch (e) {
    const hit = (await cache.match(req)) || (await cache.match(SHELL)) || (await cache.match('./'));
    if (hit) return hit;
    return new Response('أوفلاين ومفيش نسخة محفوظة. افتح التطبيق مرة واحدة بالنت.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* باقي الملفات: من الجهاز فورًا وتتحدّث في الخلفية */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const refresh = fetch(req).then(function (res) { return putIfOk(cache, req, res); }).catch(function () { return null; });
  if (hit) { refresh.catch(function () {}); return hit; }
  const res = await refresh;
  return res || new Response('', { status: 504 });
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* مكالمات قاعدة البيانات والـ API بتعدّي زي ما هي */
  if (url.hostname.indexOf('firebaseio.com') >= 0 || url.hostname.indexOf('firebasedatabase.app') >= 0 ||
      url.hostname.indexOf('wikipedia.org') >= 0 || url.hostname.indexOf('wiktionary.org') >= 0 ||
      url.hostname.indexOf('wikidata.org') >= 0 || url.hostname.indexOf('getbible.net') >= 0) return;
  if (req.mode === 'navigate') { event.respondWith(handleNavigation(req)); return; }
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || CACHEABLE_HOSTS.indexOf(url.hostname) >= 0) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil((async function () {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

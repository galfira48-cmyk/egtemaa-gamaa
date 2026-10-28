/* service-worker.js — يخلّي التطبيق يفتح بدون نت
   ارفعه جنب index.html في نفس الفولدر (بدل القديم). */
const VERSION = 'v1';
const CORE_CACHE = 'glv-core-' + VERSION;
const LIB_CACHE  = 'glv-lib-' + VERSION;

/* ملفات التطبيق نفسه */
const CORE = [
  './', './index.html', './manifest.json?v=5', './manifest.json',
  './icon-192.png', './icon-192.png?v=3', './icon-512.png',
  './chess-logo.png', './connect4-logo.png', './domino-logo.png',
  './ludo-logo.png', './xo-logo.png', './music.mp3'
];

/* مكتبات وخطوط خارجية لازم تتخزن */
const LIBS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@700&display=swap',
  'https://fonts.googleapis.com/css2?family=Playpen+Sans+Arabic:wght@500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Tajawal:wght@400;500;700&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,600&family=Cinzel:wght@600;700&family=Montserrat:wght@500;600&family=IBM+Plex+Mono:wght@500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&family=Cormorant+Garamond:ital,wght@0,600;1,600&display=swap'
];

const LIB_HOSTS = ['www.gstatic.com', 'fonts.gstatic.com', 'fonts.googleapis.com',
                   'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const core = await caches.open(CORE_CACHE);
    const lib  = await caches.open(LIB_CACHE);
    /* كل ملف لوحده: لو ملف مش موجود ميبوّظش التثبيت كله */
    await Promise.all(CORE.map(async (u) => {
      try { const r = await fetch(u, { cache: 'reload' }); if (r && r.ok) await core.put(u, r); } catch (e) {}
    }));
    await Promise.all(LIBS.map(async (u) => {
      try {
        const r = await fetch(u, { mode: u.includes('fonts.googleapis') ? 'cors' : 'no-cors' });
        if (r && (r.ok || r.type === 'opaque')) {
          await lib.put(u, r.clone());
          /* الخطوط: نخزّن ملفات الخط اللي جوه الـ CSS */
          if (u.includes('fonts.googleapis') && r.ok) {
            const css = await r.clone().text();
            const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
            await Promise.all(urls.map(async (f) => {
              try { const fr = await fetch(f, { mode: 'cors' }); if (fr.ok) await lib.put(f, fr); } catch (e) {}
            }));
          }
        }
      } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [CORE_CACHE, LIB_CACHE, 'glv-runtime'];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('glv-') && !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* صفحة الدخول: النت الأول (3 ثواني) وبعدين النسخة المخزنة */
async function handleNavigation(request) {
  const core = await caches.open(CORE_CACHE);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(request, { signal: ctrl.signal });
    clearTimeout(t);
    if (r && r.ok) { core.put('./index.html', r.clone()).catch(() => {}); return r; }
  } catch (e) {}
  return (await core.match('./index.html', { ignoreSearch: true })) ||
         (await core.match('./', { ignoreSearch: true })) ||
         new Response('<meta charset="utf-8"><h3 style="font-family:sans-serif;text-align:center;margin-top:30vh">افتح التطبيق مرة واحدة بالنت الأول</h3>',
                      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* قاعدة البيانات والـ API: التطبيق بيتعامل معاهم بنفسه */
  if (url.hostname.endsWith('firebasedatabase.app') || url.hostname.endsWith('firebaseio.com') ||
      url.hostname.endsWith('googleapis.com') && url.hostname !== 'fonts.googleapis.com' ||
      url.hostname === 'api.getbible.net' || url.hostname.endsWith('wikidata.org')) return;

  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith(handleNavigation(req));
    return;
  }

  /* مكتبات وخطوط: من الكاش الأول */
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const c = await caches.open(LIB_CACHE);
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {});
        return r;
      } catch (e) { return Response.error(); }
    })());
    return;
  }

  /* ملفات من نفس الموقع (صور، أيقونات، صوت...): من الكاش وتتحدّث في الخلفية */
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const c = await caches.open('glv-runtime');
      const hit = (await caches.match(req, { ignoreSearch: false })) || (await caches.match(req, { ignoreSearch: true }));
      const net = fetch(req).then(r => {
        if (r && r.ok && r.status === 200) c.put(req, r.clone()).catch(() => {});
        return r;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});

/* الضغط على الإشعار يفتح التطبيق */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow('./');
  })());
});

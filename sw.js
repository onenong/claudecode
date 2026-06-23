const CACHE = 'siganblock-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './today.js',
  './stats.js',
  './settings.js',
  './accuracy.js',
  './coach.js',
  './rules.js',
  './reflect.js',
  './calendar.js',
  './coldstart.js',
  './today.html',
  './stats.html',
  './settings.html',
  './reflect.html',
  './calendar.html',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first: 온라인이면 항상 최신 파일, 실패(오프라인)하면 캐시본으로 폴백.
// cache-first였던 옛 버전은 한 번 캐시된 파일을 영원히 서빙해 편집이 반영되지 않았다.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAOn8eFL_CMGuYVeEa9hfpdkHRxZpjacqU",
  authDomain: "news-61e62.firebaseapp.com",
  projectId: "news-61e62",
  storageBucket: "news-61e62.firebasestorage.app",
  messagingSenderId: "1054060055660",
  appId: "1:1054060055660:web:e192c256c82facb9af1c49"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const CACHE_NAME = 'tc-news-cache-v4';
const CORE_ASSETS = [
  '/news/',
  '/news/index.html',
  '/news/manifest.json'
];

// Install: pre-cache core shell safely & take over immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate: remove old v3 cache & control open tabs immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-First for your app shell & live JSON (always gets latest updates when online)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin /news/ files; let external APIs & version pings go straight to network
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('ping') || url.searchParams.has('vcheck')) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Background Push Alert (Unchanged)
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || "T&C News";

  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "New breaking story available.",
    icon: "https://tastyandcomfort.github.io/news/android-chrome.v1-192x192.png",
    badge: "https://tastyandcomfort.github.io/news/android-chrome.v1-192x192.png",
    tag: payload.notification?.tag || payload.data?.tag || "tc-alert",
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 150, 300],
    data: {
      url: payload.data?.url || payload.fcmOptions?.link || "https://tastyandcomfort.github.io/news/"
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// High-Speed Instant App Launch On Tap (Unchanged)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = 'https://tastyandcomfort.github.io/news/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes('/news/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

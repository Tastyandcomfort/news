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

const CACHE_NAME = 'tc-news-cache-v2';

// Pre-cache core shell for instant launch
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/news/',
        '/news/index.html',
        '/news/manifest.json',
        '/news/android-chrome-192x192.png'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => clients.claim())
  );
});

// Stale-While-Revalidate: Instant offline/cache load + silent background refresh
self.addEventListener('fetch', (event) => {
  // Always fetch real-time news API freshly from network
  if (event.request.url.includes('news-lemon-two.vercel.app') || event.request.url.includes('firestore')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// Background Push Alert
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || "T&C News";
  
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "New breaking story available.",
    icon: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
    badge: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
    tag: "tc-daily-news",
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

// 🚀 HIGH-SPEED INSTANT APP LAUNCH ON TAP
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = 'https://tastyandcomfort.github.io/news/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If app is already open in background, focus it instantly (NO cold reload delay)
      for (let client of windowClients) {
        if (client.url.includes('/news/') && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. Cold launch: Opens the standalone app immediately
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

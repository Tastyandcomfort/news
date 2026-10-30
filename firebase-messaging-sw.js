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

// Immediate activation
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Offline caching support
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// 🔥 THE FIX: Explicitly handles the push event and tells Chrome it is handled
self.addEventListener('push', (event) => {
  let title = "T&C NEWS";
  let body = "New update available!";
  let targetUrl = "https://tastyandcomfort.github.io/news/";

  if (event.data) {
    try {
      const payload = event.data.json();
      const data = payload.notification || payload.data || payload;
      title = data.title || title;
      body = data.body || body;
      targetUrl = data.url || payload.fcmOptions?.link || targetUrl;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    tag: 'tc-daily-news',
    renotify: true,
    data: { url: targetUrl }
  };

  // Satisfies Chrome's strict requirement: NO MORE fallback warning!
  event.waitUntil(self.registration.showNotification(title, options));
});

// Your exact tap / click handler (preserved completely)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || 'https://tastyandcomfort.github.io/news/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes('/news/') && 'focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

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

// Force immediate activation of this service worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Basic offline support
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Guaranteed Native Push Handler (Prevents double notifications)
self.addEventListener('push', (event) => {
  let title = "T&C NEWS";
  let body = "New update available!";

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.notification?.title || data.data?.title || title;
      body = data.notification?.body || data.data?.body || body;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    vibrate: [200, 100, 200],
    tag: 'tc-daily-news',      // Merges duplicate banners into ONE single alert
    renotify: true,            // Alerts user with sound/vibration even if an older alert is in the tray
    data: { url: 'https://tastyandcomfort.github.io/news/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When user taps the notification, open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes('/news/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('https://tastyandcomfort.github.io/news/');
      }
    })
  );
});


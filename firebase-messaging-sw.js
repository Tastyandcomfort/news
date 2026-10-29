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

// 🔥 CRITICAL: Explicitly handle background pushes so Android displays them when app is closed
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const title = payload.notification?.title || "T&C News";
  const body = payload.notification?.body || "Tap to read the latest updates.";

  const options = {
    body: body,
    icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    tag: 'tc-news-daily',
    renotify: true,
    data: {
      url: payload.fcmOptions?.link || 'https://tastyandcomfort.github.io/news/'
    }
  };

  self.registration.showNotification(title, options);
});

// Force immediate activation
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Offline caching
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Click action: Opens the website when tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || 'https://tastyandcomfort.github.io/news/';

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

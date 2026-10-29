

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

// Force immediate activation
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Basic offline caching
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Official Google Firebase Background Handler (No crashes, No duplicates)
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || "T&C NEWS";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "New update available!",
    icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
    tag: 'tc-daily-news',
    data: {
      url: 'https://tastyandcomfort.github.io/news/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// When user taps notification, open the app
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



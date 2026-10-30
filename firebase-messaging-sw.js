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

// Single unified background handler (With Sound & Vibration Enabled)
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || "T&C News";
  
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "New breaking story available.",
    icon: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
    badge: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
    tag: "tc-daily-news",
    // 🔥 FORCES SOUND, VIBRATION, AND RE-ALERTING:
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

// Launch or focus installed standalone app on tap
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

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.data?.title || 'T&C News Hub';
  const targetUrl = payload.data?.url || 'https://tastyandcomfort.github.io/news/';
  const iconUrl = payload.data?.icon || 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png';

  const notificationOptions = {
    body: payload.data?.body || 'New article update available!',
    icon: iconUrl,
    badge: iconUrl,
    tag: payload.data?.tag || 'tnc-news-notification', // Replaces old card cleanly
    renotify: true,
    data: {
      url: targetUrl
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification tap / click events
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || 'https://tastyandcomfort.github.io/news/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Check if the app tab is already open and bring it to focus
      for (let client of windowClients) {
        if (client.url.includes('/news/') && 'focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 2. Otherwise open a new window/tab to the target news item
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

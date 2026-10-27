importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// 1. PASTE YOUR EXACT firebaseConfig HERE
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "news-xxxx.firebaseapp.com",
  projectId: "news-xxxx",
  storageBucket: "news-xxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:xxxx"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handles notification when app is in the background or closed
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/news/android-chrome-192x192.png',
    badge: '/news/android-chrome-192x192.png',
    data: {
      url: '/news/'
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
        return clients.openWindow('/news/');
      }
    })
  );
});

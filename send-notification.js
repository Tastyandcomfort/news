const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendDailyAlert() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  let title = "T&C NEWS";
  let body = "Checkout today's updates!";

  if (hour >= 6 && hour < 10) {
    title = "T&C NEWS - Good Morning🌞";
    body = "Checkout today's news it's updated";
  } else if (hour >= 10 && hour < 14) {
    title = "T&C NEWS - It's chilling❄";
    body = "Checkout today's live weather";
  } else if (hour >= 14 && hour < 18) {
    title = "T&C NEWS - Happy Evening";
    body = "Checkout the top trending news";
  } else {
    title = "T&C NEWS - About to bed! 😴";
    body = "Checkout tomorrows weather";
  }

  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found yet.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending "${title}" to ${tokens.length} device(s)...`);

  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    notification: { title, body },
    data: { title, body },
    webpush: {
      headers: {
        Urgency: "high"
      },
      notification: {
        title: title,
        body: body,
        icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        requireInteraction: true
      },
      fcmOptions: {
        link: 'https://tastyandcomfort.github.io/news/'
      }
    }
  });

  console.log(`Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const err = resp.error?.code;
      if (err === 'messaging/registration-token-not-registered' || err === 'messaging/invalid-registration-token') {
        db.collection('fcm_tokens').doc(tokens[idx]).delete();
      }
    }
  });
}

sendDailyAlert().catch(console.error);

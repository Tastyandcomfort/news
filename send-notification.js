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

  // Precise IST Hour Check (0 to 23)
  if (hour >= 6 && hour < 11) {
    // 6:00 AM to 11:00 AM
    title = "T&C NEWS - Good Morning🌞";
    body = "Checkout today's news it's updated";
  } else if (hour >= 11 && hour < 15) {
    // 11:00 AM to 3:00 PM
    title = "T&C NEWS - It's chilling❄";
    body = "Checkout today's live weather";
  } else if (hour >= 15 && hour < 20) {
    // 3:00 PM to 8:00 PM
    title = "T&C NEWS - Happy Evening";
    body = "Checkout the top trending news";
  } else if (hour >= 20 && hour <= 23) {
    // 8:00 PM to 11:59 PM
    title = "T&C NEWS - About to bed! 😴";
    body = "Checkout tomorrows weather";
  } else {
    // Midnight to 6 AM (Silent hours - DO NOT SEND)
    console.log("Night time (quiet hours). Skipping notification.");
    return;
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
    notification: {
      title: title,
      body: body
    },
    // 🔥 FORCES ANDROID TO WAKE UP IMMEDIATELY (NO 10-MINUTE DELAY)
    android: {
      priority: 'high'
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: title,
        body: body,
        icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        tag: 'tc-daily-news',
        renotify: true
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

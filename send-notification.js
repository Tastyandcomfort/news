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

  // 5 Daily IST Time Windows
  if (hour >= 6 && hour < 9) {
    // 7:00 AM IST
    title = "T&C NEWS - Good Morning 🌅";
    body = "Here are your morning headlines!";
  } else if (hour >= 9 && hour < 13) {
    // 10:30 AM IST
    title = "T&C NEWS - Mid-Morning Briefing 📰";
    body = "Rain Gone Away! Checkout today's updates";
  } else if (hour >= 13 && hour < 16) {
    // 2:00 PM IST
    title = "T&C NEWS - Afternoon Edition ☀️";
    body = "Mid-day trending news and weather.";
  } else if (hour >= 16 && hour < 20) {
    // 5:30 PM IST
    title = "T&C NEWS - Evening Highlights 🌆";
    body = "Checkout the top trending stories.";
  } else if (hour >= 20 && hour <= 23) {
    // 9:00 PM IST
    title = "T&C NEWS - About to bed! 😴";
    body = "Checkout tomorrows weather";
  } else {
    // Midnight to 6 AM (Quiet hours)
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

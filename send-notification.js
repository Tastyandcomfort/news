const admin = require('firebase-admin');

// 1. Initialize Firebase with the secret key
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendDailyAlert() {
  // Convert UTC time to IST (UTC + 5 hours 30 mins)
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  let title = "T&C NEWS";
  let body = "Checkout today's updates!";

  // Select message based on the IST schedule
  if (hour >= 6 && hour < 10) {
    // 8:00 AM IST
    title = "T&C NEWS - Good Morning🌞";
    body = "Checkout today's news it's updated";
  } else if (hour >= 10 && hour < 14) {
    // 12:00 PM IST
    title = "T&C NEWS - It's chilling❄";
    body = "Checkout today's live weather";
  } else if (hour >= 14 && hour < 18) {
    // 4:00 PM IST
    title = "T&C NEWS - Happy Evening";
    body = "Checkout the top trending news";
  } else {
    // 9:00 PM IST
    title = "T&C NEWS - About to bed! 😴";
    body = "Checkout tomorrows weather";
  }

  // Fetch all registered phones from database
  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found yet.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending "${title}" to ${tokens.length} device(s)...`);

  // Broadcast notification to all phones
  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    notification: { title, body },
    webpush: {
      fcmOptions: {
        link: '/news/'
      }
    }
  });

  console.log(`Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

  // Automatically clean up deleted/uninstalled apps
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


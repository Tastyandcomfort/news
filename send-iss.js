const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(serviceAccountRaw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

async function fetchISSTelemetry() {
  try {
    // Live ISS telemetry tracking
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error('ISS API unreachable');
    const data = await res.json();

    const altKm = Math.round(data.altitude);
    const speedKmh = Math.round(data.velocity);

    return {
      title: "T&C Space Alert • ISS Flyover 🛰️",
      body: `Visible over skies! Current Altitude: ${altKm} km • Speed: ${speedKmh} km/h. Track live orbit on your Radar map.`
    };
  } catch (err) {
    return {
      title: "T&C Space Alert • ISS 🛰️",
      body: `Orbital tracking active • Check your Radar tab for live satellite path & space crew manifest.`
    };
  }
}

async function runISSNotificationTask() {
  try {
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('No registered devices found.');
      return;
    }

    const targetTokens = [];
    tokensSnapshot.docs.forEach(doc => {
      const data = doc.data() || {};
      const token = data.token || doc.id;

      // 🎯 TOPIC FILTER: Only devices with ISS enabled
      const wantsISS = data.topics && data.topics.iss === true;
      if (wantsISS && token && typeof token === 'string' && token.length > 20) {
        targetTokens.push(token);
      }
    });

    const uniqueTokens = [...new Set(targetTokens)];
    if (uniqueTokens.length === 0) {
      console.log('No devices currently subscribed to ISS & Space topic.');
      return;
    }

    const alert = await fetchISSTelemetry();
    console.log(`Broadcasting ISS alert to ${uniqueTokens.length} subscriber(s)...`);

    const response = await messaging.sendEachForMulticast({
      tokens: uniqueTokens,
      data: {
        title: alert.title,
        body: alert.body,
        tag: "tc-iss-alert",
        url: "https://tastyandcomfort.github.io/news/"
      },
      android: { priority: "high" },
      webpush: {
        headers: { Urgency: "high", TTL: "86400" },
        notification: {
          title: alert.title,
          body: alert.body,
          icon: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
          badge: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
          tag: "tc-iss-alert",
          renotify: true,
          requireInteraction: true,
          silent: false,
          vibrate: [300, 150, 300]
        },
        fcmOptions: {
          link: "https://tastyandcomfort.github.io/news/"
        }
      }
    });

    console.log(`ISS Alerts Delivered: ${response.successCount}, Failed: ${response.failureCount}`);
  } catch (err) {
    console.error('Fatal ISS Dispatcher error:', err);
    process.exit(1);
  }
}

runISSNotificationTask();

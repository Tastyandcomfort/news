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

// India Geographical Airspace Boundary (Geofence Box)
const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 36.0,
  minLon: 68.0,
  maxLon: 98.0
};

async function runAutonomousISSRadar() {
  try {
    // 1. Query live satellite position from orbit telemetry
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('Live satellite telemetry unreachable');
    const data = await res.json();

    const currentLat = parseFloat(data.latitude);
    const currentLon = parseFloat(data.longitude);
    const altKm = Math.round(data.altitude);
    const speedKmh = Math.round(data.velocity);

    console.log(`Current ISS Orbital Position: Lat ${currentLat}°, Lon ${currentLon}° | Alt: ${altKm} km`);

    // 2. 🛰️ AUTONOMOUS CHECK: Is the Space Station physically over India right now?
    const isOverIndia = (
      currentLat >= INDIA_BOUNDS.minLat &&
      currentLat <= INDIA_BOUNDS.maxLat &&
      currentLon >= INDIA_BOUNDS.minLon &&
      currentLon <= INDIA_BOUNDS.maxLon
    );

    if (!isOverIndia) {
      console.log('ISS is currently outside Indian airspace. No alert needed. Exiting safely.');
      return;
    }

    console.log('🚨 ISS DETECTED OVER INDIAN AIRSPACE! Checking de-duplication cooldown...');

    // 3. Avoid duplicate alerts for the same pass (90-minute cooldown)
    const alertDocRef = db.collection('system_state').doc('iss_last_alert');
    const alertDoc = await alertDocRef.get();
    const now = Date.now();

    if (alertDoc.exists) {
      const lastAlertTime = alertDoc.data().timestamp ? alertDoc.data().timestamp.toMillis() : 0;
      // If we already alerted within the last 60 minutes for this pass, skip
      if (now - lastAlertTime < 60 * 60 * 1000) {
        console.log('Already alerted for this pass in the last 60 minutes. Skipping.');
        return;
      }
    }

    // 4. Fetch subscribers who enabled ISS
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('No registered devices found.');
      return;
    }

    const targetTokens = [];
    tokensSnapshot.docs.forEach(doc => {
      const data = doc.data() || {};
      const token = data.token || doc.id;
      if (data.topics && data.topics.iss === true && token && typeof token === 'string' && token.length > 20) {
        targetTokens.push(token);
      }
    });

    const uniqueTokens = [...new Set(targetTokens)];
    if (uniqueTokens.length === 0) {
      console.log('No users subscribed to ISS topic.');
      return;
    }

    // 5. Broadcast Real-Time Flyover Alert
    const title = "T&C Space Radar • ISS Overhead Right Now! 🛰️";
    const body = `The Space Station is passing over Indian skies right now! Speed: ${speedKmh} km/h • Alt: ${altKm} km. Look up!`;

    const response = await messaging.sendEachForMulticast({
      tokens: uniqueTokens,
      data: {
        title: title,
        body: body,
        tag: "tc-iss-alert",
        url: "https://tastyandcomfort.github.io/news/"
      },
      android: { priority: "high" },
      webpush: {
        headers: { Urgency: "high", TTL: "86400" },
        notification: {
          title: title,
          body: body,
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

    console.log(`Live ISS Flyover Alert sent to ${response.successCount} subscriber(s)!`);

    // 6. Record timestamp to prevent re-alerting on the same pass
    await alertDocRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      coords: { lat: currentLat, lon: currentLon }
    });

  } catch (err) {
    console.error('Fatal ISS Radar error:', err);
    process.exit(1);
  }
}

runAutonomousISSRadar();


const admin = require('firebase-admin');

// 1. Initialize Firebase
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

async function broadcastDeveloperUpdate() {
  // Read custom title & message passed from GitHub Action input
  const title = process.env.BROADCAST_TITLE || "T&C Platform • Developer Update ";
  const body = process.env.BROADCAST_MESSAGE || "New update released: Optimized app speed & added new features!";

  console.log(`Preparing Developer Broadcast:`);
  console.log(`Title: "${title}"`);
  console.log(`Message: "${body}"`);

  // Fetch ALL device tokens (Platform updates go to 100% of users)
  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No registered devices found.');
    return;
  }

  const tokenMap = new Map();
  snapshot.docs.forEach(doc => {
    const data = doc.data() || {};
    const actualToken = data.token || doc.id;
    if (actualToken && typeof actualToken === 'string' && actualToken.length > 20) {
      tokenMap.set(actualToken, doc.id);
    }
  });

  const uniqueTokens = Array.from(tokenMap.keys());
  console.log(`Broadcasting to ${uniqueTokens.length} device(s)...`);

  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    data: {
      title: title,
      body: body,
      url: "https://tastyandcomfort.github.io/news/"
    },
    android: {
      priority: "high"
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400"
      },
      notification: {
        title: title,
        body: body,
        icon: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
        badge: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
        tag: "tc-developer-update",
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

  console.log(`Developer Broadcast Result: Delivered: ${response.successCount}, Failed: ${response.failureCount}`);
}

broadcastDeveloperUpdate().catch(err => {
  console.error("Broadcast failed:", err);
  process.exit(1);
});

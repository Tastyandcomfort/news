const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// 2. Fetch and clean real-time live news headline
async function fetchLiveNews() {
  try {
    const res = await fetch('https://news-lemon-two.vercel.app/api/news?scope=national');
    if (!res.ok) throw new Error('Failed to fetch feed');
    const xml = await res.text();

    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
    if (itemMatch) {
      const itemContent = itemMatch[1];
      const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || 
                         itemContent.match(/<title>(.*?)<\/title>/i);
      
      if (titleMatch && titleMatch[1]) {
        // Strips [163] prefixes, HTML entities, and trims whitespace
        return titleMatch[1]
          .replace(/^\[\d+\]\s*/, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      }
    }
  } catch (err) {
    console.error('Error fetching live feed:', err.message);
  }
  return null;
}

async function sendDailyAlert() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  // Quiet hours (Midnight to 6 AM)
  if (hour < 6) {
    console.log('Quiet hours (midnight - 6 AM). Skipping.');
    return;
  }

  // Fetch live real-time headline
  const liveHeadline = await fetchLiveNews();
  const bodyText = liveHeadline || "Check out today's top trending headlines.";

  // Clean Apple-style heading based on time of day
  let titleText = "T&C News • Live Briefing";
  if (hour >= 6 && hour < 9) {
    titleText = "T&C News • Morning Edition";
  } else if (hour >= 9 && hour < 13) {
    titleText = "T&C News • Midday Update";
  } else if (hour >= 13 && hour < 16) {
    titleText = "T&C News • Afternoon Briefing";
  } else if (hour >= 16 && hour < 20) {
    titleText = "T&C News • Evening Digest";
  } else if (hour >= 20 && hour <= 23) {
    titleText = "T&C News • Night Wrap-Up 🌙";
  }

  // 4. Fetch registered devices from Firestore
  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No devices found in database.');
    return;
  }

  // Extract tokens and eliminate any duplicates
  const rawTokens = snapshot.docs.map(doc => doc.data().token || doc.id).filter(Boolean);
  const tokens = [...new Set(rawTokens)];

  console.log(`Sending to ${tokens.length} unique device(s)...`);
  console.log(`Title: "${titleText}"`);
  console.log(`Body:  "${bodyText}"`);
  
  // Send single standard WebPush notification payload
  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: {
        title: titleText,
        body: bodyText,
        icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        tag: 'tc-news-daily',
        renotify: true
      },
      fcmOptions: {
        link: 'https://tastyandcomfort.github.io/news/'
      }
    }
  });

  console.log(`Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

  // Automatically clean up expired tokens
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        db.collection('fcm_tokens').doc(tokens[idx]).delete();
      }
    }
  });
}

sendDailyAlert().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});

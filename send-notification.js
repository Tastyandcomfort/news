const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// Helper function to fetch the latest breaking news headline live
async function fetchLatestNewsHeadline() {
  try {
    // Fetching from your live news API endpoint (national/world scope)
    const response = await fetch('https://news-lemon-two.vercel.app/api/news?scope=national');
    if (!response.ok) throw new Error('Failed to fetch RSS feed');
    
    const xmlText = await response.text();
    
    // Simple regex parser to extract the first <title>...</title> from the XML RSS feed
    const match = xmlText.match(/<title>(.*?)<\/title>/i);
    if (match && match[1]) {
      // Clean up any CDATA tags if present
      let headline = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      // Decode common HTML entities
      headline = headline.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return headline;
    }
  } catch (error) {
    console.error("Error fetching live news for notification:", error);
  }
  return "Checkout today's top updates and breaking stories!";
}

async function sendDailyAlert() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  let title = "T&C NEWS HUB";

  // 5 Daily IST Time Windows with appropriate titles
  if (hour >= 6 && hour < 9) {
    title = "T&C NEWS - Good Morning 🌅";
  } else if (hour >= 9 && hour < 13) {
    title = "T&C NEWS - Mid-Morning Briefing 📰";
  } else if (hour >= 13 && hour < 16) {
    title = "T&C NEWS - Afternoon Edition ☀️";
  } else if (hour >= 16 && hour < 20) {
    title = "T&C NEWS - Evening Highlights 🌆";
  } else if (hour >= 20 && hour <= 23) {
    title = "T&C NEWS - Night Bulletin 🌙";
  } else {
    // Midnight to 6 AM (Quiet hours)
    console.log("Night time (quiet hours). Skipping notification.");
    return;
  }

  // Fetch the live breaking headline dynamically
  const latestHeadline = await fetchLatestNewsHeadline();
  const body = latestHeadline;

  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found yet.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending "${title}" to ${tokens.length} device(s) with headline: "${body}"`);

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




const admin = require('firebase-admin');

// 1. Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// 2. Fetch live headline from your Vercel proxy
async function fetchTopLiveHeadline() {
  try {
    const res = await fetch('https://news-lemon-two.vercel.app/api/news?scope=national');
    if (!res.ok) throw new Error('Failed to fetch RSS');
    const xml = await res.text();

    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
    if (itemMatch) {
      const itemContent = itemMatch[1];
      const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || 
                         itemContent.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
      }
    }
  } catch (error) {
    console.error("Could not fetch live news feed:", error.message);
  }
  return null;
}

async function sendDailyAlert() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  // Quiet hours check (Midnight to 6 AM)
  if (hour < 6) {
    console.log("Night time (quiet hours). Skipping notification.");
    return;
  }

  // 3. Fetch real live headline
  const latestHeadline = await fetchTopLiveHeadline();

  // Declare title & body at function scope so they are ALWAYS defined
  let title = "T&C NEWS • Live Update";
  let body = latestHeadline || "Check out today's top trending headlines!";

  // Set title based on time of day
  if (hour >= 6 && hour < 9) {
    title = "T&C NEWS Morning Bulletin";
  } else if (hour >= 9 && hour < 13) {
    title = "T&C NEWS Mid-Day Top Story";
  } else if (hour >= 13 && hour < 16) {
    title = "T&C NEWS ☀️ Afternoon Briefing";
  } else if (hour >= 16 && hour < 20) {
    title = "T&C NEWS Evening Digest";
  } else if (hour >= 20 && hour <= 23) {
    title = "T&C NEWS 🌙 Tonight's Top Story";
  }

  // 4. Fetch tokens from Firestore
  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found yet.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending to ${tokens.length} devices | Title: "${title}" | Headline: "${body}"`);

  // 5. Send message to all devices
  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    notification: {
      title: title,
      body: body
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400"
      },
      fcmOptions: {
        link: 'https://tastyandcomfort.github.io/news/'
      }
    }
  });

  console.log(`Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

  // Remove dead tokens
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const err = resp.error?.code;
      if (err === 'messaging/registration-token-not-registered' || err === 'messaging/invalid-registration-token') {
        db.collection('fcm_tokens').doc(tokens[idx]).delete();
      }
    }
  });
}

sendDailyAlert().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});




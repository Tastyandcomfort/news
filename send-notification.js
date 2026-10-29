const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

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
        return titleMatch[1]
          .replace(/^\[\d+\]\s*/, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim();
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

  if (hour < 6) {
    console.log("Night time (quiet hours). Skipping notification.");
    return;
  }

  const latestHeadline = await fetchTopLiveHeadline();

  let title = "T&C NEWS • Live Update 🔴";
  let body = latestHeadline || "Check out today's top trending headlines!";

  if (hour >= 6 && hour < 9) {
    title = "T&C NEWS 🌅 Morning Bulletin";
  } else if (hour >= 9 && hour < 13) {
    title = "T&C NEWS 📰 Mid-Day Top Story";
  } else if (hour >= 13 && hour < 16) {
    title = "T&C NEWS ☀️ Afternoon Briefing";
  } else if (hour >= 16 && hour < 20) {
    title = "T&C NEWS 🌆 Evening Digest";
  } else if (hour >= 20 && hour <= 23) {
    title = "T&C NEWS 🌙 Tonight's Top Story";
  }

  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending live alert to ${tokens.length} devices...`);

  // DATA-ONLY payload: Completely eliminates the double notification bug!
  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    data: {
      title: title,
      body: body,
      url: 'https://tastyandcomfort.github.io/news/'
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400"
      }
    }
  });
  
      notification: {
        title: title,
        body: body,
        icon: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
        badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
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

sendDailyAlert().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});






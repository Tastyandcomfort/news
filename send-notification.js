const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// Helper function to fetch the latest breaking news headline and short snippet cleanly
async function fetchLatestNewsItem() {
  try {
    const response = await fetch('https://news-lemon-two.vercel.app/api/news?scope=local');
    if (!response.ok) throw new Error('Failed to fetch RSS feed');
    
    const xmlText = await response.text();
    
    // Extract first item block <item>...</item>
    const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/i);
    if (itemMatch && itemMatch[1]) {
      const itemXml = itemMatch[1];
      
      // Extract title
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1] : "Latest Updates";
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      
      // Clean up common source suffixes if present (e.g., " - Telangana Hyderabad Google News")
      title = title.split(' - ')[0].trim();

      // Extract description or content for 1-2 lines body snippet
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
      let description = descMatch ? descMatch[1] : "Checkout today's top stories and updates.";
      description = description.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      
      // Limit description to roughly 1 or 2 lines (approx 120-140 characters)
      if (description.length > 130) {
        description = description.substring(0, 127) + '...';
      }

      return { title, description };
    }
  } catch (error) {
    console.error("Error fetching live news for notification:", error);
  }
  return { 
    title: "Breaking News Update", 
    description: "Checkout today's top updates and live headlines from T&C News Hub." 
  };
}

async function sendDailyAlert() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hour = istTime.getUTCHours();

  // Time Window Check (Quiet hours check)
  if (hour < 6 || hour > 23) {
    console.log("Night time (quiet hours). Skipping notification.");
    return;
  }

  // Fetch the clean title and short snippet
  const newsItem = await fetchLatestNewsItem();

  // Requirements applied:
  // Title: T&C News
  // Body: Headline + 1-2 lines text snippet
  const notificationTitle = "T&C News";
  const notificationBody = `${newsItem.title}\n${newsItem.description}`;

  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No subscribed devices found yet.');
    return;
  }

  const tokens = snapshot.docs.map(doc => doc.id);
  console.log(`Sending notification to ${tokens.length} device(s) with headline: "${newsItem.title}"`);

  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    notification: {
      title: notificationTitle,
      body: notificationBody
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
        title: notificationTitle,
        body: notificationBody,
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



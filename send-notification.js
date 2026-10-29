const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// Helper function to fetch the latest breaking news headline and clean snippet
async function fetchLatestNewsItem() {
  try {
    const response = await fetch('https://news-lemon-two.vercel.app/api/news?scope=local');
    if (!response.ok) throw new Error('Failed to fetch RSS feed');
    
    const xmlText = await response.text();
    
    // Extract first item block <item>...</item>
    const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/i);
    if (itemMatch && itemMatch[1]) {
      const itemXml = itemMatch[1];
      
      // 1. Extract & clean Title
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1] : "Latest Updates";
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
                   .replace(/^\[\d+\]\s*/, '') // Remove bracketed codes like [163]
                   .replace(/&lt;[\s\S]*?&gt;/g, '')
                   .replace(/<[^>]*>/g, '')
                   .replace(/---/g, '•') // Replace raw --- with a clean dot
                   .replace(/&amp;/g, '&')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'")
                   .replace(/&nbsp;/g, ' ')
                   .trim();
      
      // Clean up common source suffixes if present (e.g., " - The Hindu")
      title = title.split(' - ')[0].trim();

      // 2. Extract & clean Description
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
      let description = descMatch ? descMatch[1] : "";
      
      description = description.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
                               .replace(/&lt;a[\s\S]*?&gt;([\s\S]*?)&lt;\/a&gt;/gi, '$1')
                               .replace(/&lt;[\s\S]*?&gt;/g, '')
                               .replace(/<[^>]*>/g, '')
                               .replace(/https?:\/\/[^\s]+/g, '')
                               .replace(/---/g, ' ')
                               .replace(/&amp;/g, '&')
                               .replace(/&quot;/g, '"')
                               .replace(/&#39;/g, "'")
                               .replace(/&nbsp;/gi, ' ')
                               .replace(/\s+/g, ' ')
                               .trim();
      
      // 3. Remove Title duplication from Description if it starts with it
      if (description.startsWith(title)) {
        description = description.substring(title.length).trim();
      }

      // Clean up leading punctuation left over after title stripping
      description = description.replace(/^[\s:\-–—\.;]+/, '').trim();

      // Fallback if description becomes empty after cleaning
      if (!description || description.length < 5) {
        description = "Tap to read full details on T&C News Hub.";
      }

      // Limit description length to a clean snippet length
      if (description.length > 95) {
        description = description.substring(0, 92) + '...';
      }

      return { title, description };
    }
  } catch (error) {
    console.error("Error fetching live news for notification:", error);
  }
  return { 
    title: "Breaking News Update", 
    description: "Tap to read the full story on T&C News Hub." 
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

  // Configured as requested: Title "T&C News" + clean headline and text
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
        badge: 'https://tastyandcomfort.github.io/news/android-chrome-192x192.png',
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



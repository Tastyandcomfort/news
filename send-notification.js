const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// 2. Fetch and clean real-time live news headline and description
async function fetchLiveNews() {
  try {
    const res = await fetch('https://news-lemon-two.vercel.app/api/news?scope=local');
    if (!res.ok) throw new Error('Failed to fetch feed');
    const xml = await res.text();

    const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
    if (itemMatch && itemMatch[1]) {
      const itemContent = itemMatch[1];
      
      // Extract Title
      const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || 
                         itemContent.match(/<title>(.*?)<\/title>/i);
      
      let title = titleMatch && titleMatch[1] ? titleMatch[1] : "";
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
                   .replace(/^\[\d+\]\s*/, '') // Removes [163]
                   .replace(/&lt;[\s\S]*?&gt;/g, '')
                   .replace(/<[^>]*>/g, '')
                   .replace(/---/g, '•')
                   .replace(/&amp;/g, '&')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'")
                   .replace(/&nbsp;/g, ' ')
                   .trim();
                   
      // Strip source publisher suffix if present
      title = title.split(' - ')[0].trim();

      // Extract Description
      const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i) || 
                        itemContent.match(/<description>(.*?)<\/description>/i);
                        
      let description = descMatch && descMatch[1] ? descMatch[1] : "";
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

      // Remove title duplication if description repeats headline
      if (description.startsWith(title)) {
        description = description.substring(title.length).trim();
      }
      description = description.replace(/^[\s:\-–—\.;]+/, '').trim();

      if (!description || description.length < 5) {
        description = "Tap to read full details on T&C News Hub.";
      }

      if (description.length > 95) {
        description = description.substring(0, 92) + '...';
      }

      return { title, description };
    }
  } catch (err) {
    console.error('Error fetching live feed:', err.message);
  }
  return null;
}

async function sendDailyAlert() {
  // Convert current time to IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  const hour = istTime.getHours();

  // Quiet hours (Midnight to 6 AM)
  if (hour < 6) {
    console.log('Quiet hours (midnight - 6 AM). Skipping notification.');
    return;
  }

  // Fetch live real-time headline and description
  const liveNews = await fetchLiveNews();
  
  const headlineText = liveNews?.title || "Latest Breaking Updates";
  const snippetText = liveNews?.description || "Check out today's top trending stories on T&C News Hub.";
  const bodyText = `${headlineText}\n${snippetText}`;

  // Clean Apple-style heading based on time of day
  let titleText = "T&C News";
  if (hour >= 6 && hour < 9) {
    titleText = "T&C News • Morning Edition 🌅";
  } else if (hour >= 9 && hour < 13) {
    titleText = "T&C News • Midday Update 📰";
  } else if (hour >= 13 && hour < 16) {
    titleText = "T&C News • Afternoon Briefing ☀️";
  } else if (hour >= 16 && hour < 20) {
    titleText = "T&C News • Evening Digest 🌆";
  } else if (hour >= 20 && hour <= 23) {
    titleText = "T&C News • Night Wrap-Up 🌙";
  }

  // Fetch registered tokens from Firestore
  const snapshot = await db.collection('fcm_tokens').get();
  if (snapshot.empty) {
    console.log('No devices found in database.');
    return;
  }

  // Extract tokens and eliminate duplicates
  const rawTokens = snapshot.docs.map(doc => doc.data().token || doc.id).filter(Boolean);
  const tokens = [...new Set(rawTokens)];

  console.log(`Sending to ${tokens.length} unique device(s)...`);
  console.log(`Title: "${titleText}"`);
  console.log(`Body:\n"${bodyText}"`);

  // Send multicast push payload across devices
  const response = await messaging.sendEachForMulticast({
    tokens: tokens,
    // Top-level notification object forces system wake-up on mobile
    notification: {
      title: titleText,
      body: bodyText
    },
    // High priority ensures mobile OS delivers push immediately
    android: {
      priority: 'high'
    },
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

const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountRaw) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT secret in environment.');
    process.exit(1);
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountRaw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON secret:', err);
    process.exit(1);
  }
}

const db = admin.firestore();

// 2. Dynamic Title based on Indian Standard Time (IST)
function getDynamicTitle() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const hours = istTime.getUTCHours();

  if (hours >= 5 && hours < 12) {
    return "T&C News • Morning Briefing ☀️";
  } else if (hours >= 12 && hours < 17) {
    return "T&C News • Afternoon Express ⚡";
  } else if (hours >= 17 && hours < 22) {
    return "T&C News • Evening Digest 🌆";
  } else {
    return "T&C News • Night Wrap-Up 🌙";
  }
}

// 3. Robust Live RSS Headline Extractor (Uses your active Vercel proxy)
async function fetchTopLiveHeadline() {
  const endpoints = [
    'https://news-lemon-two.vercel.app/api/news?scope=national',
    'https://news-lemon-two.vercel.app/api/news?scope=local',
    'https://news-lemon-two.vercel.app/api/news?scope=world'
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
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
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
        }
      }
    } catch (e) {
      console.warn(`Feed attempt failed for ${url}:`, e.message);
    }
  }
  return "Check out the latest breaking news and live updates!";
}

// 4. Main Notification Task
async function runNotificationTask() {
  try {
    const dynamicTitle = getDynamicTitle();
    const liveHeadline = await fetchTopLiveHeadline();

    // Retrieve tokens with compatibility fallback (doc.data().token OR doc.id)
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('No registered tokens found in Firestore.');
      return;
    }

    const tokenMap = new Map();
    tokensSnapshot.docs.forEach(doc => {
      const data = doc.data() || {};
      const actualToken = data.token || doc.id;
      if (actualToken && typeof actualToken === 'string' && actualToken.length > 20) {
        tokenMap.set(actualToken, doc.id);
      }
    });

    const uniqueTokens = Array.from(tokenMap.keys());
    if (uniqueTokens.length === 0) {
      console.log('No valid token strings resolved.');
      return;
    }

    console.log(`[${dynamicTitle}] Broadcasting to ${uniqueTokens.length} device(s)...`);
    console.log(`Headline: "${liveHeadline}"`);

    // Complete Multicast payload satisfying Android TWA, PWA, and Web Push
    const response = await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      notification: {
        title: dynamicTitle,
        body: liveHeadline
      },
      data: {
        title: dynamicTitle,
        body: liveHeadline,
        url: "https://tastyandcomfort.github.io/news/"
      },
      android: {
        priority: "high",
        notification: {
          title: dynamicTitle,
          body: liveHeadline,
          icon: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
          channelId: "tc_news_alerts",
          priority: "high",
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: "public"
        }
      },
      webpush: {
        headers: {
          Urgency: "high",
          TTL: "86400"
        },
        notification: {
          title: dynamicTitle,
          body: liveHeadline,
          icon: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
          badge: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
          tag: "tc-daily-news",
          renotify: true
        },
        fcmOptions: {
          link: "https://tastyandcomfort.github.io/news/"
        }
      }
    });

    console.log(`[${dynamicTitle}] Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

    // Auto-prune dead/unregistered tokens from Firestore
    const deadDocDeletions = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/registration-token-not-registered' ||
          errCode === 'messaging/invalid-registration-token'
        ) {
          const deadToken = uniqueTokens[idx];
          const docId = tokenMap.get(deadToken);
          if (docId) {
            deadDocDeletions.push(db.collection('fcm_tokens').doc(docId).delete());
          }
        }
      }
    });

    if (deadDocDeletions.length > 0) {
      await Promise.allSettled(deadDocDeletions);
      console.log(`Pruned ${deadDocDeletions.length} expired device token(s) from Firestore.`);
    }

  } catch (error) {
    console.error('Fatal error executing push notifications:', error);
    process.exit(1);
  }
}

runNotificationTask();

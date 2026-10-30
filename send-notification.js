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
    return "T&C News • Evening Digest";
  } else {
    return "T&C News • Night Wrap-Up 🌙";
  }
}

// 3. Multi-Feed Aggregator & Smart De-duplication (Telangana, India, World)
async function fetchTopLiveHeadline() {
  const scopes = ['local', 'national', 'world'];
  const allArticles = [];

  // Fetch all 3 scopes in parallel
  const fetchTasks = scopes.map(async (scope) => {
    try {
      const res = await fetch(`https://news-lemon-two.vercel.app/api/news?scope=${scope}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return;
      const xml = await res.text();

      const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
      for (const item of items) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || item.match(/<title>(.*?)<\/title>/i);
        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);

        if (titleMatch && titleMatch[1]) {
          const cleanTitle = titleMatch[1]
            .replace(/^\[\d+\]\s*/, '')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();

          let pubTime = 0;
          if (dateMatch && dateMatch[1]) {
            const parsed = new Date(dateMatch[1]).getTime();
            if (!isNaN(parsed)) pubTime = parsed;
          }

          if (cleanTitle.length > 10) {
            allArticles.push({
              title: cleanTitle,
              time: pubTime,
              scope: scope
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Feed attempt failed for scope=${scope}:`, e.message);
    }
  });

  await Promise.allSettled(fetchTasks);

  if (allArticles.length === 0) {
    return "Check out the latest breaking news and live updates!";
  }

  // Sort by pubDate descending (newest across all regions first)
  allArticles.sort((a, b) => b.time - a.time);

  // Retrieve notification history from Firestore to prevent repeats
  let sentHistory = [];
  try {
    const historyDoc = await db.collection('system_state').doc('history').get();
    if (historyDoc.exists) {
      sentHistory = historyDoc.data().recentTitles || [];
    }
  } catch (err) {
    console.warn('Could not read notification history:', err.message);
  }

  function isAlreadySent(candidateTitle) {
    const normCandidate = candidateTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    return sentHistory.some(prev => {
      const normPrev = prev.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        normCandidate === normPrev ||
        (normCandidate.length > 20 && normPrev.includes(normCandidate)) ||
        (normPrev.length > 20 && normCandidate.includes(normPrev))
      );
    });
  }

  // Pick the freshest article that has NOT been sent yet
  let chosen = allArticles.find(art => !isAlreadySent(art.title));

  // Fallback: If all available feed items were previously sent, pick the newest one
  if (!chosen) {
    chosen = allArticles[0];
  }

  // Save chosen headline to history (keeps the last 25 sent headlines)
  try {
    const updatedHistory = [chosen.title, ...sentHistory.filter(t => t !== chosen.title)].slice(0, 25);
    await db.collection('system_state').doc('history').set({
      recentTitles: updatedHistory,
      lastSentAt: new Date(),
      lastScope: chosen.scope
    });
  } catch (err) {
    console.warn('Could not update history doc:', err.message);
  }

  return chosen.title;
}

// 4. Main Notification Task
async function runNotificationTask() {
  try {
    const dynamicTitle = getDynamicTitle();
    const liveHeadline = await fetchTopLiveHeadline();

    // Retrieve active device tokens from Firestore
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

    // Complete WebPush payload with instant priority
    const response = await admin.messaging().sendEachForMulticast({
      tokens: uniqueTokens,
      data: {
        title: dynamicTitle,
        body: liveHeadline,
        url: "https://tastyandcomfort.github.io/news/"
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
          renotify: true,
          requireInteraction: true
        },
        fcmOptions: {
          link: "https://tastyandcomfort.github.io/news/"
        }
      }
    });

    console.log(`[${dynamicTitle}] Delivered: ${response.successCount}, Failed: ${response.failureCount}`);

    // Prune invalid or dead tokens automatically
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

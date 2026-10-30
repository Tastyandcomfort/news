const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK using FIREBASE_SERVICE_ACCOUNT secret
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountRaw) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT secret in GitHub environment.');
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

// 2. Helper function to generate dynamic titles based on Indian Standard Time (IST)
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

// 3. Main notification task
async function runNotificationTask() {
  try {
    let latestArticle = {
      title: "Check out the latest breaking news and live updates!",
      url: "https://tastyandcomfort.github.io/news/"
    };

    // Safely attempt to fetch latest news without crashing on static endpoint errors
    try {
      const newsResponse = await fetch('https://tastyandcomfort.github.io/news/api/news.js');
      if (newsResponse.ok) {
        const contentType = newsResponse.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const articles = await newsResponse.json();
          if (Array.isArray(articles) && articles.length > 0) {
            latestArticle = articles[0];
          }
        }
      }
    } catch (fetchErr) {
      console.warn('Could not fetch live news API, using default headline:', fetchErr.message);
    }

    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('No registered tokens found in Firestore.');
      return;
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);
    const dynamicTitle = getDynamicTitle();

    const sendPromises = tokens.map(token => {
      const message = {
        token: token,
        data: {
          title: dynamicTitle,
          body: latestArticle.title,
          icon: "https://tastyandcomfort.github.io/news/android-chrome-192x192.png",
          url: latestArticle.url || "https://tastyandcomfort.github.io/news/"
        },
        android: {
          priority: "high"
        }
      };

      return admin.messaging().send(message);
    });

    const results = await Promise.allSettled(sendPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[${dynamicTitle}] Delivered: ${successful}, Failed: ${failed}`);

  } catch (error) {
    console.error('Error sending push notifications:', error);
    process.exit(1);
  }
}

runNotificationTask();

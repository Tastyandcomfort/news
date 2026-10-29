import admin from 'firebase-admin';

// Initialize Firebase Admin SDK securely using environment variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  try {
    // 1. Dynamically fetch the latest news article from your live endpoint
    const newsResponse = await fetch('https://tastyandcomfort.github.io/news/api/news.js');
    let latestArticle = {
      title: "Check out the latest breaking news and live updates!",
      url: "https://tastyandcomfort.github.io/news/"
    };

    if (newsResponse.ok) {
      const articles = await newsResponse.json();
      if (Array.isArray(articles) && articles.length > 0) {
        latestArticle = articles[0]; // Pulls the real, newest headline
      }
    }

    // 2. Fetch active user FCM tokens from Firestore
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      return res.status(200).json({ success: true, message: 'No registered tokens found.' });
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);

    // 3. Send DATA-ONLY payload to prevent browser auto-popups and double notifications
    const sendPromises = tokens.map(token => {
      const message = {
        token: token,
        data: {
          title: "T&C News • Night Wrap-Up 🌙",
          body: latestArticle.title, // Uses dynamic live headline text
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

    return res.status(200).json({
      success: true,
      summary: `Delivered: ${successful}, Failed: ${failed}`,
      articleSent: latestArticle.title
    });

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return res.status(500).json({ error: error.message });
  }
}

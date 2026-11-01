
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(serviceAccountRaw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

// Pre-configured coordinates for popular regional cities
const CITY_COORDINATES = {
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Warangal': { lat: 17.9689, lon: 79.5941 },
  'Nizamabad': { lat: 18.6725, lon: 78.0941 },
  'Bengaluru': { lat: 12.9716, lon: 77.5946 }
};

// Weather Code (WMO standard) to human-readable condition & emoji
function formatWeatherCondition(wmoCode) {
  if (wmoCode === 0) return "Clear Sky ☀️";
  if (wmoCode >= 1 && wmoCode <= 3) return "Partly Cloudy ⛅";
  if (wmoCode >= 45 && wmoCode <= 48) return "Foggy 🌫️";
  if (wmoCode >= 51 && wmoCode <= 67) return "Light Rain 🌧️";
  if (wmoCode >= 71 && wmoCode <= 77) return "Cold Breeze ❄️";
  if (wmoCode >= 80 && wmoCode <= 82) return "Heavy Showers 🌦️";
  if (wmoCode >= 95) return "Thunderstorms ⛈️";
  return "Pleasant Outlook 🌤️";
}

// Fetch live weather from Open-Meteo for given coordinates
async function fetchWeather(lat, lon, label) {
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${todayStr}&end_date=${todayStr}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('Weather API unreachable');
    const data = await res.json();

    const currentTemp = Math.round(data.current.temperature_2m);
    const condition = formatWeatherCondition(data.current.weather_code);
    const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
    const minTemp = Math.round(data.daily.temperature_2m_min[0]);
    const rainProb = data.daily.precipitation_probability_max[0] || 0;
    const rainNote = rainProb > 30 ? ` • ${rainProb}% chance of rain` : '';

    return {
      title: `T&C Weather ⛅ • ${label}`,
      body: `${currentTemp}°C (${condition}) • High: ${maxTemp}°C, Low: ${minTemp}°C${rainNote}`
    };
  } catch (err) {
    console.warn(`Weather fetch failed for ${label}:`, err.message);
    return {
      title: `T&C Weather ⛅ • ${label}`,
      body: `Live regional weather update • Check your radar map for hourly forecasts.`
    };
  }
}

async function runWeatherNotificationTask() {
  try {
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('No registered devices found.');
      return;
    }

    // Map targets by location key so we fetch weather efficiently
    const locationBatches = new Map();

    tokensSnapshot.docs.forEach(doc => {
      const data = doc.data() || {};
      const token = data.token || doc.id;

      // 1. Filter: Only devices with Weather enabled
      const wantsWeather = data.topics ? data.topics.weather !== false : true;
      if (!wantsWeather || !token || typeof token !== 'string' || token.length < 20) return;

      const prefs = data.preferences || {};
      let locationKey = 'Hyderabad';
      let coords = CITY_COORDINATES['Hyderabad'];
      let displayLabel = 'Hyderabad';

      // 2. Pure GPS Coordinates check
      if (prefs.gpsCoords && typeof prefs.gpsCoords.lat === 'number' && typeof prefs.gpsCoords.lon === 'number') {
        const roundedLat = prefs.gpsCoords.lat.toFixed(2);
        const roundedLon = prefs.gpsCoords.lon.toFixed(2);
        locationKey = `gps_${roundedLat}_${roundedLon}`;
        coords = { lat: prefs.gpsCoords.lat, lon: prefs.gpsCoords.lon };
        displayLabel = 'Local Area (GPS 📍)';
      } else if (prefs.weatherCity && CITY_COORDINATES[prefs.weatherCity]) {
        locationKey = prefs.weatherCity;
        coords = CITY_COORDINATES[prefs.weatherCity];
        displayLabel = prefs.weatherCity;
      }

      if (!locationBatches.has(locationKey)) {
        locationBatches.set(locationKey, {
          coords: coords,
          label: displayLabel,
          tokens: []
        });
      }

      locationBatches.get(locationKey).tokens.push(token);
    });

    if (locationBatches.size === 0) {
      console.log('No devices currently subscribed to the Weather topic.');
      return;
    }

    // 3. Fetch weather and broadcast to each location group
    for (const [key, batch] of locationBatches.entries()) {
      const uniqueTokens = [...new Set(batch.tokens)];
      if (uniqueTokens.length === 0) continue;

      const weatherReport = await fetchWeather(batch.coords.lat, batch.coords.lon, batch.label);
      console.log(`[${batch.label}] Sending to ${uniqueTokens.length} device(s): "${weatherReport.body}"`);

      const response = await messaging.sendEachForMulticast({
        tokens: uniqueTokens,
        data: {
          title: weatherReport.title,
          body: weatherReport.body,
          tag: "tc-weather-alert",
          url: "https://tastyandcomfort.github.io/news/"
        },
        android: {
          priority: "high"
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "86400"
          },
          notification: {
            title: weatherReport.title,
            body: weatherReport.body,
            icon: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
            badge: "https://tastyandcomfort.github.io/news/icon-v2-192.png",
            tag: "tc-weather-alert",
            renotify: true,
            requireInteraction: true,
            silent: false,
            vibrate: [300, 150, 300]
          },
          fcmOptions: {
            link: "https://tastyandcomfort.github.io/news/"
          }
        }
      });

      console.log(`[${batch.label}] Delivered: ${response.successCount}, Failed: ${response.failureCount}`);
    }

    console.log('All regional weather alerts dispatched successfully.');
  } catch (err) {
    console.error('Fatal Weather Dispatcher Error:', err);
    process.exit(1);
  }
}

runWeatherNotificationTask();

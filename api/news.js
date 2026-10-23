// api/news.js
export default async function handler(req, res) {
  // Set CORS headers so your GitHub Pages frontend can access this API[cite: 3]
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const { scope } = req.query;

  // Map requested scope to Google News RSS feeds[cite: 3]
  const rssUrls = {
    local: "https://news.google.com/rss/search?q=Telangana+Hyderabad&hl=en-IN&gl=IN&ceid=IN:en",
    india: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en",
    world: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en"
  };

  const targetUrl = rssUrls[scope] || rssUrls.local;

  try {
    // Fetch raw RSS XML from Google News[cite: 3]
    const response = await fetch(targetUrl);
    const xmlText = await response.text();

    // Send XML back with 200 OK status[cite: 3]
    res.status(200).send(xmlText);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch news feed" });
  }
}

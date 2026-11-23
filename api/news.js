// api/news.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const { scope } = req.query;

  const rssMap = {
    local: [
      'https://www.thehindu.com/news/national/telangana/feeder/default.rss',
      'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss'
    ],
    national: [
      'https://www.thehindu.com/news/national/feeder/default.rss'
    ],
    india: [
      'https://www.thehindu.com/news/national/feeder/default.rss'
    ],
    world: [
      'https://www.france24.com/en/rss',
      'https://feeds.bbci.co.uk/news/world/rss.xml'
    ]
  };

  const candidates = rssMap[scope] || rssMap.local;

  for (const targetUrl of candidates) {
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TCNewsHub/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
        }
      });

      if (!response.ok) continue;
      const xmlText = await response.text();
      if (!xmlText.includes('<item')) continue;

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(xmlText);
    } catch {
      // Try next official feed
    }
  }

  return res.status(502).json({ error: 'Failed to fetch news feed' });
}

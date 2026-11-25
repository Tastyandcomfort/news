// api/news.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const scope = req.query.scope === 'india' ? 'national' : (req.query.scope || 'local');

  const googleIndiaFeeds = {
    local: 'https://news.google.com/rss/search?q=Telangana+Hyderabad&hl=en-IN&gl=IN&ceid=IN:en',
    national: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',
    world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en'
  };

  const indianBackupFeeds = {
    local: [
      'https://www.thehindu.com/news/national/telangana/feeder/default.rss',
      'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss',
      'https://timesofindia.indiatimes.com/rssfeeds/-2128816011.cms'
    ],
    national: [
      'https://www.thehindu.com/news/national/feeder/default.rss',
      'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms'
    ],
    world: [
      'https://www.thehindu.com/news/international/feeder/default.rss',
      'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms'
    ]
  };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9'
  };

  // 1. Try Google News India first
  const googleUrl = googleIndiaFeeds[scope] || googleIndiaFeeds.local;
  try {
    const gRes = await fetch(googleUrl, { headers });
    if (gRes.ok) {
      const gXml = await gRes.text();
      if (gXml.includes('<item') && !gXml.includes("We're sorry")) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.status(200).send(gXml);
      }
    }
  } catch {
    // Fall through to merged Indian publishers (IST)
  }

  // 2. Automatic IST Backup: Merge The Hindu + Times of India feeds
  const backups = indianBackupFeeds[scope] || indianBackupFeeds.local;
  const seenKeys = new Set();
  const mergedItems = [];

  await Promise.allSettled(
    backups.map(async (url) => {
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) return;
        const xml = await r.text();
        const matches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
        for (const itemXml of matches) {
          const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
          const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
          const key = (linkMatch?.[1] || titleMatch?.[1] || '').trim();
          if (key && seenKeys.has(key)) continue;
          if (key) seenKeys.add(key);
          mergedItems.push(itemXml);
        }
      } catch {}
    })
  );

  if (mergedItems.length > 0) {
    const combinedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>T&amp;C News Hub (${scope})</title>
    <link>https://tastyandcomfort.github.io/news/</link>
    <description>Official Indian RSS Feed</description>
    ${mergedItems.join('\n    ')}
  </channel>
</rss>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(combinedRss);
  }

  return res.status(502).json({ error: 'Failed to fetch news feed' });
}

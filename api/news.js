// api/news.js — Smart Multi-Source Official RSS Blend with Photo Extraction
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9'
};

function decodeEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractImageFromItem(block, rawDesc, rawEncoded) {
  const mediaUrl =
    block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
    block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1] ||
    block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["']/i)?.[1] ||
    block.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["']/i)?.[1] ||
    block.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i)?.[1] ||
    rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    rawEncoded.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
    '';

  const clean = decodeEntities(mediaUrl).trim();
  if (!clean || !/^https?:\/\//i.test(clean)) return '';
  if (/1x1|pixel|spacer|blank\.gif|logo-small/i.test(clean)) return '';
  return clean.replace(/^http:\/\//i, 'https://');
}

function parseFeedItems(xmlText, publisherTag) {
  if (!xmlText || xmlText.includes("We're sorry")) return [];
  const matches = xmlText.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const out = [];

  for (const block of matches.slice(0, 14)) {
    const getRaw = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1] : '';
    };
    const title = stripTags(getRaw('title'));
    let link = decodeEntities(getRaw('link')).replace(/<[^>]+>/g, '').trim();
    if (!link) {
      const hrefAttr = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefAttr) link = decodeEntities(hrefAttr[1]).trim();
    }
    const pubDate = stripTags(getRaw('pubDate') || getRaw('dc:date'));
    const rawDesc = decodeEntities(getRaw('description'));
    const rawEncoded = decodeEntities(getRaw('content:encoded'));
    const cleanDesc = stripTags(rawDesc || rawEncoded);
    const image = extractImageFromItem(block, rawDesc, rawEncoded);

    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    const ts = pubDate ? Date.parse(pubDate) : 0;

    out.push({
      title,
      link,
      pubDate: pubDate || new Date().toUTCString(),
      ts: isNaN(ts) ? 0 : ts,
      description: cleanDesc,
      image,
      publisher: publisherTag
    });
  }
  return out;
}

async function fetchRssWithTimeout(url, timeoutMs = 5000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: c.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  const scope = req.query.scope === 'india' ? 'national' : (req.query.scope || 'local');

  const feedGroups = {
    local: [
      { url: 'https://www.thehindu.com/news/national/telangana/feeder/default.rss', name: 'The Hindu' },
      { url: 'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss', name: 'The Hindu' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128816011.cms', name: 'Times of India' },
      { url: 'https://telanganatoday.com/feed', name: 'Telangana Today' },
      { url: 'https://news.google.com/rss/search?q=Telangana+Hyderabad&hl=en-IN&gl=IN&ceid=IN:en', name: 'Google News' }
    ],
    national: [
      { url: 'https://www.thehindu.com/news/national/feeder/default.rss', name: 'The Hindu' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', name: 'Times of India' },
      { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', name: 'NDTV' },
      { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', name: 'Hindustan Times' },
      { url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml', name: 'BBC News' },
      { url: 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en', name: 'Google News' }
    ],
    world: [
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC News' },
      { url: 'https://www.france24.com/en/rss', name: 'France24' },
      { url: 'https://feeds.skynews.com/feeds/rss/world.xml', name: 'Sky News' },
      { url: 'https://www.thehindu.com/news/international/feeder/default.rss', name: 'The Hindu' },
      { url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', name: 'Times of India' },
      { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera' },
      { url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en', name: 'Google News' }
    ]
  };

  const sources = feedGroups[scope] || feedGroups.local;
  const results = await Promise.all(
    sources.map(async (s) => {
      const xml = await fetchRssWithTimeout(s.url, 5500);
      return parseFeedItems(xml, s.name);
    })
  );

  // Interleave items across publishers so every outlet appears cleanly, then deduplicate
  const seenTitles = new Set();
  const seenLinks = new Set();
  const merged = [];
  const maxLen = Math.max(...results.map((arr) => arr.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const arr of results) {
      const item = arr[i];
      if (!item) continue;
      const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 75);
      if (seenLinks.has(item.link) || (normTitle && seenTitles.has(normTitle))) continue;
      seenLinks.add(item.link);
      if (normTitle) seenTitles.add(normTitle);
      merged.push(item);
    }
  }

  merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const finalItems = merged.slice(0, 45);

  if (finalItems.length === 0) {
    return res.status(502).json({ error: 'Failed to fetch news feed' });
  }

  const itemsXml = finalItems.map((it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <pubDate>${escapeXml(it.pubDate)}</pubDate>
      <source>${escapeXml(it.publisher)}</source>
      <description>${escapeXml(it.description)}</description>${it.image ? `\n      <enclosure url="${escapeXml(it.image)}" type="image/jpeg" />` : ''}
    </item>`).join('\n');

  const combinedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>T&amp;C News Hub (${escapeXml(scope)})</title>
    <link>https://tastyandcomfort.github.io/news/</link>
    <description>Multi-Source Official RSS Feed</description>
${itemsXml}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.status(200).send(combinedRss);
}

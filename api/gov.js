// api/gov.js — Real-time Official Indian Govt & Agency Feeds (PIB A-Z, ED, CBI)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDmyDateToIso(dmy) {
  const m = String(dmy || '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T09:00:00+05:30`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchText(url, extraHeaders = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(xmlText) {
  const items = [];
  const matches = xmlText.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi) || [];
  for (const block of matches) {
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? decodeEntities(m[1]).trim() : '';
    };
    const title = stripTags(getTag('title'));
    let link = getTag('link').replace(/<[^>]+>/g, '').trim();
    if (!link) {
      const hrefAttr = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefAttr) link = decodeEntities(hrefAttr[1]).trim();
    }
    const rawDate =
      getTag('pubDate') ||
      getTag('dc:date') ||
      getTag('a10:updated') ||
      getTag('updated') ||
      getTag('published') ||
      '';
    const description = stripTags(getTag('description') || getTag('summary') || getTag('content'));
    if (!title || !link) continue;

    let publishedAt = null;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }
    items.push({ title, link, pubDate: rawDate, publishedAt, description });
  }
  return items;
}

const PIB_LANG_MAP = { en: 1, hi: 2, kn: 8, ta: 11, ml: 15, te: 16 };

const BASE_PIB_REGIONS = [
  { regid: '3', name: 'All India (National HQ — All Ministries A–Z)' },
  { regid: '1', name: 'PIB Delhi' },
  { regid: '2', name: 'PIB Mumbai' },
  { regid: '5', name: 'PIB Hyderabad' },
  { regid: '6', name: 'PIB Chennai' },
  { regid: '7', name: 'PIB Chandigarh' },
  { regid: '8', name: 'PIB Kolkata' },
  { regid: '12', name: 'PIB Guwahati' },
  { regid: '14', name: 'PIB Bhubaneswar' },
  { regid: '20', name: 'PIB Bengaluru' },
  { regid: '22', name: 'PIB Ahmedabad' },
  { regid: '24', name: 'PIB Thiruvananthapuram' }
];

async function fetchPibRegionsLive() {
  try {
    const html = await fetchText('https://pib.gov.in/ViewRss.aspx', {}, 10000);
    const regionMap = new Map();
    const linkRegex = /<a[^>]+href=["'][^"']*Regid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const id = m[1];
      const name = stripTags(m[2]);
      if (id && name && /PIB|National/i.test(name)) {
        regionMap.set(id, id === '3' ? 'All India (National HQ — All Ministries A–Z)' : name);
      }
    }
    const optRegex = /<option[^>]+value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    while ((m = optRegex.exec(html)) !== null) {
      const id = m[1];
      const name = stripTags(m[2]);
      if (id && name && id !== '0') {
        regionMap.set(id, id === '3' ? 'All India (National HQ — All Ministries A–Z)' : name);
      }
    }
    if (regionMap.size > 0) {
      const list = Array.from(regionMap.entries()).map(([regid, name]) => ({ regid, name }));
      list.sort((a, b) => (a.regid === '3' ? -1 : b.regid === '3' ? 1 : a.name.localeCompare(b.name)));
      return { ok: true, regions: list };
    }
  } catch {}
  return { ok: false, regions: BASE_PIB_REGIONS };
}

async function fetchPibReleases(regid = '3', langCode = 'en') {
  const pibLangId = PIB_LANG_MAP[langCode] || 1;
  const primaryUrl = `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=${pibLangId}&Regid=${encodeURIComponent(regid)}`;
  try {
    let xml = await fetchText(primaryUrl, {}, 12000);
    let parsed = parseRssItems(xml);
    let activeUrl = primaryUrl;

    if (parsed.length === 0 && pibLangId !== 1) {
      const enUrl = `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=${encodeURIComponent(regid)}`;
      xml = await fetchText(enUrl, {}, 12000);
      parsed = parseRssItems(xml);
      activeUrl = enUrl;
    }

    if (parsed.length === 0 && regid !== '3') {
      const hqUrl = `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=${pibLangId}&Regid=3`;
      xml = await fetchText(hqUrl, {}, 12000);
      parsed = parseRssItems(xml);
      activeUrl = hqUrl;
    }

    const items = parsed.slice(0, 30).map((it, idx) => ({
      id: `pib-${regid}-${idx}-${Buffer.from(it.link).toString('base64url').slice(-10)}`,
      agency: 'PIB',
      verifiedBy: 'PIB India Official',
      department: regid === '3' ? 'Press Information Bureau (All India HQ)' : `Press Information Bureau (Region #${regid})`,
      title: it.title,
      summary: it.description || it.title,
      publishedAt: it.publishedAt,
      dateText: it.pubDate || 'Live PIB Official Feed',
      link: it.link,
      pdfUrl: ''
    }));

    return { ok: items.length > 0, count: items.length, sourceUrl: activeUrl, items, error: items.length ? null : 'No releases returned by PIB RSS' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: primaryUrl, items: [], error: `PIB server unreachable (${err.message})` };
  }
}

async function fetchEdPageHtml(pathSlug) {
  const cleanSlug = pathSlug.replace(/^\/+|\/+$/g, '');
  const candidates = [
    `https://enforcementdirectorate.gov.in/${cleanSlug}/`,
    `https://www.enforcementdirectorate.gov.in/${cleanSlug}/`,
    `https://enforcementdirectorate.gov.in/${cleanSlug}`,
    `https://www.enforcementdirectorate.gov.in/${cleanSlug}`
  ];
  const errors = [];
  for (const url of candidates) {
    try {
      const html = await fetchText(url, { Referer: 'https://enforcementdirectorate.gov.in/' }, 12000);
      if (html && html.length > 500) return { url, html, errors };
    } catch (err) {
      errors.push(`${url} -> ${err.message}`);
    }
  }
  return { url: candidates[0], html: null, errors };
}

async function fetchEdPressReleases() {
  const { url, html, errors } = await fetchEdPageHtml('media/press-release');
  if (!html) {
    return { ok: false, count: 0, sourceUrl: 'https://enforcementdirectorate.gov.in/media/press-release/', items: [], error: `ED portal unreachable (${errors[0] || 'HTTP 404'})` };
  }

  const items = [];
  const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
    if (tds.length < 3) continue;
    const srNo = stripTags(tds[0]);
    if (!/^\d+$/.test(srNo)) continue;
    const description = stripTags(tds[1]);
    const dateStr = stripTags(tds[2]);
    const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
    const pdfUrl = hrefMatch?.[1] ? new URL(decodeEntities(hrefMatch[1]), url).href : url;
    if (!description) continue;

    const zoneMatch = description.match(/ED,\s*([A-Za-z\s-]+?)(?:,|\s+has|\s+attached|\s+arrested|\s+filed|\s+conducted)/i);
    const zone = zoneMatch?.[1]?.trim() ? `ED (${zoneMatch[1].trim()})` : 'Directorate of Enforcement (ED)';
    items.push({
      id: `ed-pr-${srNo}-${dateStr.replace(/\D/g, '')}`,
      agency: 'ED',
      verifiedBy: 'ED Official',
      department: zone,
      title: description.length > 165 ? description.slice(0, 162) + '...' : description,
      summary: description,
      publishedAt: parseDmyDateToIso(dateStr),
      dateText: dateStr || 'Official ED Release',
      link: pdfUrl,
      pdfUrl: pdfUrl !== url ? pdfUrl : ''
    });
  }

  return { ok: items.length > 0, count: items.length, sourceUrl: url, items: items.slice(0, 25), error: items.length ? null : 'ED press release table unavailable' };
}

async function fetchEdProclamations() {
  const { url, html, errors } = await fetchEdPageHtml('wanted/notice-for-proclamation');
  if (!html) {
    return { ok: false, count: 0, sourceUrl: 'https://enforcementdirectorate.gov.in/wanted/notice-for-proclamation/', items: [], error: `ED portal unreachable (${errors[0] || 'HTTP 404'})` };
  }

  const items = [];
  const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
    if (tds.length < 2) continue;
    const srNo = stripTags(tds[0]);
    if (!/^\d+$/.test(srNo)) continue;
    const description = stripTags(tds[1]);
    const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
    const pdfUrl = hrefMatch?.[1] ? new URL(decodeEntities(hrefMatch[1]), url).href : url;
    if (!description) continue;

    const againstMatch = description.match(/against\s+([^,(.]+?)(?:\s+(?:to\s+appear|S\/o|W\/o|D\/o|alias|@|directing)|,|\(|$)/i);
    const subjectName = (againstMatch?.[1] || '').trim() || `ED Proclamation Notice #${srNo}`;
    const ecirMatch = description.match(/(ECIR\/[A-Z0-9\/-]+)/i);
    const dateMatch = description.match(/(\d{2}\.\d{2}\.\d{4})/);

    items.push({
      id: `ed-proc-${srNo}-${(ecirMatch?.[1] || 'case').replace(/[^a-z0-9]/gi, '')}`,
      agency: 'ED',
      verifiedBy: 'ED Official',
      department: 'Directorate of Enforcement (PMLA Court Proclamation)',
      location: ecirMatch ? `Case Ref: ${ecirMatch[1]}` : 'Special PMLA Court, India',
      name: subjectName,
      aliases: [],
      photo: '',
      charges: description,
      description,
      caution: 'Official Court Proclamation Notice. Report verified information to the Directorate of Enforcement.',
      rewardText: '',
      rewardValue: 0,
      publishedAt: dateMatch ? parseDmyDateToIso(dateMatch[1]) : null,
      updatedAt: null,
      dob: '',
      nationality: 'India / Foreign (FEMA/PMLA)',
      noticeType: 'ED PROCLAMATION',
      sourceUrl: pdfUrl
    });
  }

  return { ok: items.length > 0, count: items.length, sourceUrl: url, items, error: items.length ? null : 'ED proclamation table unavailable' };
}

async function fetchCbiOfficial() {
  const cbiPressUrl = 'https://cbi.gov.in/press-releases';
  const cbiWantedUrl = 'https://cbi.gov.in/interpol-red-notice';
  const directItems = [];
  const redNotices = [];
  let directAccessible = false;
  let directError = null;

  try {
    const html = await fetchText(cbiPressUrl, {}, 10000);
    if (html && !/Access Denied|Request Rejected|Just a moment/i.test(html)) {
      directAccessible = true;
      const linkRegex = /<a[^>]+href=["']([^"']*press-detail[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      const seen = new Set();
      while ((m = linkRegex.exec(html)) !== null) {
        const href = new URL(decodeEntities(m[1]), 'https://cbi.gov.in').href;
        const title = stripTags(m[2]);
        if (!title || title.length < 10 || seen.has(href)) continue;
        seen.add(href);

        const ctx = stripTags(html.slice(Math.max(0, m.index - 250), m.index + m[0].length + 450));
        const dmyMatch = ctx.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/);
        const publishedAt = dmyMatch ? parseDmyDateToIso(dmyMatch[1]) : null;

        directItems.push({
          id: `cbi-${Buffer.from(href).toString('base64url').slice(-12)}`,
          agency: 'CBI',
          verifiedBy: 'CBI Official',
          department: 'Central Bureau of Investigation (CBI)',
          title,
          summary: title,
          publishedAt,
          dateText: dmyMatch?.[1] || 'Official CBI Portal',
          link: href,
          pdfUrl: ''
        });
      }
    }
  } catch (err) {
    directError = err.message;
  }

  try {
    const wHtml = await fetchText(cbiWantedUrl, {}, 10000);
    if (wHtml && !/Access Denied|Request Rejected|Just a moment/i.test(wHtml)) {
      const trMatches = wHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
      for (let i = 0; i < trMatches.length; i++) {
        const tds = trMatches[i].match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
        if (tds.length < 2) continue;
        const cols = tds.map(stripTags).filter(Boolean);
        if (cols.length < 2 || /Sl\.?\s*No|Sr\.?\s*No|Name/i.test(cols[0])) continue;
        const imgMatch = trMatches[i].match(/<img[^>]+src=["']([^"']+)["']/i);
        const linkMatch = trMatches[i].match(/<a[^>]+href=["']([^"']+)["']/i);
        const subjectName = cols[1] || cols[0];
        const sourceUrl = linkMatch?.[1] ? new URL(decodeEntities(linkMatch[1]), 'https://cbi.gov.in').href : cbiWantedUrl;
        const yearMatch = sourceUrl.match(/#(\d{4})-/);

        redNotices.push({
          id: `cbi-rn-${i}-${subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
          agency: 'CBI',
          verifiedBy: 'CBI Official',
          department: 'Central Bureau of Investigation (INTERPOL India NCB)',
          location: 'India / INTERPOL Red Notice',
          name: subjectName,
          aliases: [],
          photo: imgMatch?.[1] ? new URL(decodeEntities(imgMatch[1]), 'https://cbi.gov.in').href : '',
          charges: 'Active CBI / INTERPOL Red Notice Subject (Published by Central Bureau of Investigation India)',
          description: `Official CBI / INTERPOL India Record #${cols[0]} — ${subjectName}`,
          caution: 'Report official information to CBI HQ / NCB India or Dial 112.',
          rewardText: '',
          rewardValue: 0,
          publishedAt: yearMatch ? `Notice Year: ${yearMatch[1]}` : null,
          updatedAt: null,
          dob: '',
          nationality: 'India / International',
          noticeType: 'CBI RED NOTICE',
          sourceUrl
        });
      }
    }
  } catch {}

  return {
    ok: directItems.length > 0 || redNotices.length > 0,
    directAccessible,
    count: directItems.length,
    redNoticeCount: redNotices.length,
    sourceUrl: cbiPressUrl,
    wantedUrl: cbiWantedUrl,
    items: directItems.slice(0, 25),
    redNotices: redNotices.slice(0, 40),
    error: !directAccessible ? `Direct cbi.gov.in server restricted (${directError || 'WAF/timeout'})` : null
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  const sourceParam = String(req.query.source || 'pib,ed_press,cbi').toLowerCase();
  const sources = new Set(sourceParam.split(',').map((s) => s.trim()).filter(Boolean));
  const regid = String(req.query.regid || '3').replace(/[^\d]/g, '') || '3';
  const lang = String(req.query.lang || 'en').toLowerCase();

  if (sources.has('pib_regions')) {
    const regData = await fetchPibRegionsLive();
    return res.status(200).json({ updatedAt: new Date().toISOString(), ...regData });
  }

  const result = { updatedAt: new Date().toISOString(), sources: {} };
  const tasks = [];

  if (sources.has('all') || sources.has('pib')) {
    tasks.push(fetchPibReleases(regid, lang).then((d) => { result.sources.pib = d; }));
  }
  if (sources.has('all') || sources.has('ed_press')) {
    tasks.push(fetchEdPressReleases().then((d) => { result.sources.ed_press = d; }));
  }
  if (sources.has('all') || sources.has('ed_proclamation')) {
    tasks.push(fetchEdProclamations().then((d) => { result.sources.ed_proclamation = d; }));
  }
  if (sources.has('all') || sources.has('cbi')) {
    tasks.push(fetchCbiOfficial().then((d) => { result.sources.cbi = d; }));
  }

  await Promise.allSettled(tasks);
  return res.status(200).json(result);
}

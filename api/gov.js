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

function parseFlexibleDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(s)) return parseDmyDateToIso(s);
  const d = new Date(s);
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

async function fetchJson(url, extraHeaders = {}, timeoutMs = 12000) {
  const txt = await fetchText(url, { Accept: 'application/json, text/plain, */*', ...extraHeaders }, timeoutMs);
  return JSON.parse(txt);
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
    const rawDate = getTag('pubDate') || getTag('dc:date') || getTag('a10:updated') || getTag('updated') || getTag('published') || '';
    const description = stripTags(getTag('description') || getTag('summary') || getTag('content'));
    if (!title || !link) continue;
    items.push({ title, link, pubDate: rawDate, publishedAt: parseFlexibleDate(rawDate), description });
  }
  return items;
}

const PIB_LANG_MAP = { en: 1, hi: 2, kn: 8, ta: 11, ml: 15, te: 16 };
const BASE_PIB_REGIONS = [
  { regid: '3', name: 'All India (National HQ — All Ministries A–Z)' },
  { regid: '1', name: 'PIB Delhi' }, { regid: '2', name: 'PIB Mumbai' }, { regid: '5', name: 'PIB Hyderabad' },
  { regid: '6', name: 'PIB Chennai' }, { regid: '7', name: 'PIB Chandigarh' }, { regid: '8', name: 'PIB Kolkata' },
  { regid: '12', name: 'PIB Guwahati' }, { regid: '14', name: 'PIB Bhubaneswar' }, { regid: '20', name: 'PIB Bengaluru' },
  { regid: '22', name: 'PIB Ahmedabad' }, { regid: '24', name: 'PIB Thiruvananthapuram' }
];

async function fetchPibRegionsLive() {
  try {
    const html = await fetchText('https://pib.gov.in/ViewRss.aspx', {}, 10000);
    const regionMap = new Map();
    const linkRegex = /<a[^>]+href=["'][^"']*Regid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const id = m[1], name = stripTags(m[2]);
      if (id && name && /PIB|National/i.test(name)) regionMap.set(id, id === '3' ? 'All India (National HQ — All Ministries A–Z)' : name);
    }
    const optRegex = /<option[^>]+value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    while ((m = optRegex.exec(html)) !== null) {
      const id = m[1], name = stripTags(m[2]);
      if (id && name && id !== '0') regionMap.set(id, id === '3' ? 'All India (National HQ — All Ministries A–Z)' : name);
    }
    if (regionMap.size > 0) {
      const list = Array.from(regionMap.entries()).map(([regid, name]) => ({ regid, name }));
      list.sort((a, b) => (a.regid === '3' ? -1 : b.regid === '3' ? 1 : a.name.localeCompare(b.name)));
      return { ok: true, regions: list };
    }
  } catch {}
  return { ok: false, regions: BASE_PIB_REGIONS };
}

async function fetchPibPostedDate(url) {
  try {
    const html = await fetchText(url, {}, 4500);
    const clean = stripTags(html);
    const m = clean.match(/Posted\s+On:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i);
    if (m) {
      const iso = parseFlexibleDate(`${m[1]} GMT+0530`);
      return { iso, raw: m[1] };
    }
  } catch {}
  return { iso: null, raw: '' };
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

    const slice = parsed.slice(0, 25);
    // Fetch real Posted On timestamps for the top 10 items if RSS omitted pubDate
    await Promise.allSettled(
      slice.slice(0, 10).map(async (it) => {
        if (!it.publishedAt && it.link) {
          const d = await fetchPibPostedDate(it.link);
          if (d.iso) { it.publishedAt = d.iso; it.pubDate = d.raw; }
        }
      })
    );

    const items = slice.map((it, idx) => ({
      id: `pib-${regid}-${idx}-${Buffer.from(it.link).toString('base64url').slice(-10)}`,
      agency: 'PIB',
      verifiedBy: 'PIB India Official',
      department: regid === '3' ? 'Press Information Bureau (All India HQ)' : `Press Information Bureau (Region #${regid})`,
      title: it.title,
      summary: it.description || it.title,
      publishedAt: it.publishedAt,
      dateText: it.pubDate || 'Latest PIB Release',
      link: it.link,
      pdfUrl: ''
    }));

    return { ok: items.length > 0, count: items.length, sourceUrl: activeUrl, items, error: items.length ? null : 'No releases returned by PIB RSS' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: primaryUrl, items: [], error: `PIB server unreachable (${err.message})` };
  }
}

function extractEdArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const k of ['items', 'data', 'results', 'pressReleases', 'notices', 'proclamations', 'Data', 'Items', 'Results']) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  return [];
}

function pickField(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
  }
  return '';
}

async function fetchEdPressReleases() {
  const apiUrl = 'https://enforcementdirectorate.gov.in/umbraco/backoffice/api/PressReleaseApi/GetPublic?language=en';
  const pageUrl = 'https://enforcementdirectorate.gov.in/media/press-release/';
  try {
    const data = await fetchJson(apiUrl, { Referer: pageUrl }, 12000);
    const rows = extractEdArray(data);
    const items = rows.slice(0, 30).map((row, idx) => {
      const desc = stripTags(pickField(row, ['description', 'Description', 'title', 'Title', 'subject', 'Subject', 'name', 'Name']));
      const rawDate = String(pickField(row, ['releaseDate', 'ReleaseDate', 'dateOfRelease', 'DateOfRelease', 'date', 'Date', 'createdDate', 'CreatedDate', 'publishedDate'])).trim();
      const rawLink = String(pickField(row, ['pdfUrl', 'PdfUrl', 'documentUrl', 'DocumentUrl', 'fileUrl', 'FileUrl', 'attachment', 'Attachment', 'url', 'Url', 'link', 'Link', 'filePath'])).trim();
      const link = rawLink ? new URL(rawLink, 'https://enforcementdirectorate.gov.in').href : pageUrl;
      const zoneMatch = desc.match(/ED,\s*([A-Za-z\s-]+?)(?:,|\s+has|\s+attached|\s+arrested|\s+filed|\s+conducted)/i);
      const zone = zoneMatch?.[1]?.trim() ? `ED (${zoneMatch[1].trim()})` : 'Directorate of Enforcement (ED)';
      return {
        id: `ed-pr-${idx}-${rawDate.replace(/\D/g, '')}`,
        agency: 'ED',
        verifiedBy: 'ED Official',
        department: zone,
        title: desc.length > 165 ? desc.slice(0, 162) + '...' : desc,
        summary: desc,
        publishedAt: parseFlexibleDate(rawDate),
        dateText: rawDate || 'Official ED Release',
        link,
        pdfUrl: link !== pageUrl ? link : ''
      };
    }).filter((x) => x.title);

    return { ok: items.length > 0, count: items.length, sourceUrl: pageUrl, items, error: items.length ? null : 'ED API returned 0 press releases' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: pageUrl, items: [], error: `ED Press API error (${err.message})` };
  }
}

async function fetchEdProclamations() {
  const pageUrl = 'https://enforcementdirectorate.gov.in/wanted/notice-for-proclamation/';
  try {
    const html = await fetchText(pageUrl, { Referer: 'https://enforcementdirectorate.gov.in/' }, 12000);
    const discovered = (html.match(/\/umbraco\/[^"'\s`]+/gi) || []).map((u) => u.replace(/\$\{languageCode\}/g, 'en'));
    const candidates = [
      ...new Set([
        ...discovered.filter((u) => /Proclamation|Notice|Wanted/i.test(u)),
        '/umbraco/backoffice/api/NoticeForProclamationApi/GetPublic?language=en',
        '/umbraco/backoffice/api/ProclamationApi/GetPublic?language=en',
        '/umbraco/backoffice/api/NoticeApi/GetPublic?language=en'
      ])
    ];

    for (const rel of candidates) {
      try {
        const apiUrl = new URL(rel, 'https://enforcementdirectorate.gov.in').href;
        const data = await fetchJson(apiUrl, { Referer: pageUrl }, 10000);
        const rows = extractEdArray(data);
        if (rows.length === 0) continue;

        const items = rows.map((row, idx) => {
          const desc = stripTags(pickField(row, ['description', 'Description', 'title', 'Title', 'subject', 'Subject', 'details', 'Details', 'name', 'Name']));
          const rawDate = String(pickField(row, ['releaseDate', 'ReleaseDate', 'date', 'Date', 'createdDate', 'noticeDate'])).trim();
          const rawLink = String(pickField(row, ['pdfUrl', 'PdfUrl', 'documentUrl', 'DocumentUrl', 'fileUrl', 'FileUrl', 'attachment', 'url', 'Url', 'link', 'filePath'])).trim();
          const pdfUrl = rawLink ? new URL(rawLink, 'https://enforcementdirectorate.gov.in').href : pageUrl;

          const againstMatch = desc.match(/against\s+([^,(.]+?)(?:\s+(?:to\s+appear|S\/o|W\/o|D\/o|alias|@|directing)|,|\(|$)/i);
          const subjectName = stripTags(pickField(row, ['accusedName', 'AccusedName', 'personName'])) || (againstMatch?.[1] || '').trim() || `ED Proclamation Notice #${idx + 1}`;
          const ecirMatch = desc.match(/(ECIR\/[A-Z0-9\/-]+)/i);
          const dateInText = desc.match(/(\d{2}\.\d{2}\.\d{4})/);

          return {
            id: `ed-proc-${idx + 1}-${(ecirMatch?.[1] || 'case').replace(/[^a-z0-9]/gi, '')}`,
            agency: 'ED',
            verifiedBy: 'ED Official',
            department: 'Directorate of Enforcement (PMLA Court Proclamation)',
            location: ecirMatch ? `Case Ref: ${ecirMatch[1]}` : 'Special PMLA Court, India',
            name: subjectName,
            aliases: [],
            photo: '',
            charges: desc || subjectName,
            description: desc || subjectName,
            caution: 'Official Court Proclamation Notice. Report verified information to the Directorate of Enforcement.',
            rewardText: '',
            rewardValue: 0,
            publishedAt: parseFlexibleDate(rawDate) || (dateInText ? parseDmyDateToIso(dateInText[1]) : null),
            updatedAt: null,
            dob: '',
            nationality: 'India / Foreign (FEMA/PMLA)',
            noticeType: 'ED PROCLAMATION',
            sourceUrl: pdfUrl
          };
        }).filter((x) => x.charges);

        if (items.length > 0) return { ok: true, count: items.length, sourceUrl: pageUrl, items, error: null };
      } catch {}
    }

    return { ok: false, count: 0, sourceUrl: pageUrl, items: [], error: 'ED Proclamation API endpoint unavailable right now' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: pageUrl, items: [], error: `ED Proclamation portal unreachable (${err.message})` };
  }
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

        directItems.push({
          id: `cbi-${Buffer.from(href).toString('base64url').slice(-12)}`,
          agency: 'CBI',
          verifiedBy: 'CBI Official',
          department: 'Central Bureau of Investigation (CBI)',
          title,
          summary: title,
          publishedAt: dmyMatch ? parseDmyDateToIso(dmyMatch[1]) : null,
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
          verifiedBy: 'CBI/INTERPOL',
          department: 'Central Bureau of Investigation (INTERPOL India NCB)',
          location: 'India / INTERPOL Jurisdiction',
          name: subjectName,
          aliases: [],
          photo: imgMatch?.[1] ? new URL(decodeEntities(imgMatch[1]), 'https://cbi.gov.in').href : '',
          charges: 'Active CBI / INTERPOL Red Notice Subject (Published by Central Bureau of Investigation India)',
          description: `Official CBI / INTERPOL India Record #${cols[0]} — ${subjectName}. Click "Verified by CBI Official" to view the live INTERPOL Red Notice profile.`,
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

  if (sources.has('all') || sources.has('pib')) tasks.push(fetchPibReleases(regid, lang).then((d) => { result.sources.pib = d; }));
  if (sources.has('all') || sources.has('ed_press')) tasks.push(fetchEdPressReleases().then((d) => { result.sources.ed_press = d; }));
  if (sources.has('all') || sources.has('ed_proclamation')) tasks.push(fetchEdProclamations().then((d) => { result.sources.ed_proclamation = d; }));
  if (sources.has('all') || sources.has('cbi')) tasks.push(fetchCbiOfficial().then((d) => { result.sources.cbi = d; }));

  await Promise.allSettled(tasks);
  return res.status(200).json(result);
}

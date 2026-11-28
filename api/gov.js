// api/gov.js — Live Real-Time Official Press Releases + Wanted (NIA, INTERPOL, ED, CBI) Engine
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9'
};

const ALLOWED_READER_HOSTS = new Set([
  'pib.gov.in', 'www.pib.gov.in',
  'sci.gov.in', 'www.sci.gov.in',
  'cbi.gov.in', 'www.cbi.gov.in',
  'isro.gov.in', 'www.isro.gov.in',
  'nasa.gov', 'www.nasa.gov',
  'sansad.in', 'www.sansad.in',
  'eci.gov.in', 'www.eci.gov.in',
  'delhipolice.gov.in', 'www.delhipolice.gov.in',
  'keralapolice.gov.in', 'www.keralapolice.gov.in',
  'chandigarhpolice.gov.in', 'portal.chandigarhpolice.gov.in',
  'enforcementdirectorate.gov.in', 'www.enforcementdirectorate.gov.in'
]);

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code) {
  if (!code) return '';
  try { return regionNames.of(String(code).toUpperCase()) || code; } catch { return code; }
}

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

function htmlToParagraphs(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style|noscript|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6|blockquote)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim())
    .filter((p) => p.length > 25)
    .slice(0, 30)
    .join('\n\n');
}

function parseDateSmart(val) {
  if (!val) return null;
  const s = String(val).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const hasClockTime = /\d{1,2}:\d{2}/.test(s);

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(.*)$/);
  if (dmy) {
    const [, dd, mm, yyyy, rest] = dmy;
    if (!hasClockTime) return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')} ${rest.trim()}`);
    return isNaN(d.getTime()) ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : d.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (!hasClockTime) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mdy = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/);
    if (mdy && months[mdy[1].slice(0, 3).toLowerCase()]) {
      return `${mdy[3]}-${months[mdy[1].slice(0, 3).toLowerCase()]}-${mdy[2].padStart(2, '0')}`;
    }
    const dmyText = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (dmyText && months[dmyText[2].slice(0, 3).toLowerCase()]) {
      return `${dmyText[3]}-${months[dmyText[2].slice(0, 3).toLowerCase()]}-${dmyText[1].padStart(2, '0')}`;
    }
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return hasClockTime ? d.toISOString() : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function extractSetCookieHeader(res) {
  let rawCookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    rawCookies = res.headers.getSetCookie();
  } else {
    const single = res.headers.get('set-cookie');
    if (single) rawCookies = single.split(/,\s*(?=[A-Za-z0-9_.-]+=)/);
  }
  return rawCookies.map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
}

function extractHiddenInputs(html) {
  const form = new URLSearchParams();
  for (const inp of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = inp[0];
    if (!/\btype\s*=\s*["']?hidden["']?/i.test(tag)) continue;
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    const val = tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    if (name) form.set(name, decodeEntities(val));
  }
  return form;
}

async function fetchResponse(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...BROWSER_HEADERS, ...(options.headers || {}) },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, extraHeaders = {}, timeoutMs = 12000) {
  const res = await fetchResponse(url, { headers: extraHeaders }, timeoutMs);
  return await res.text();
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
    const rawDesc = getTag('description') || getTag('summary') || getTag('content');
    const description = stripTags(rawDesc);
    const imgUrl =
      block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
      block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1] ||
      block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["']/i)?.[1] ||
      rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
      '';
    const image = imgUrl && /^https?:\/\//i.test(decodeEntities(imgUrl)) ? decodeEntities(imgUrl).replace(/^http:\/\//i, 'https://') : '';
    if (!title || !link) continue;
    items.push({ title, link, pubDate: rawDate, publishedAt: parseDateSmart(rawDate), description, image });
  }
  return items;
}

const PIB_LANG_MAP = { en: 1, hi: 2, kn: 8, ta: 11, ml: 15, te: 16 };

async function fetchPibRegionsLive() {
  try {
    const html = await fetchText('https://www.pib.gov.in/ViewRss.aspx', {}, 10000);
    const regionMap = new Map();
    const linkRegex = /<a[^>]+href=["'][^"']*Regid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const id = m[1], name = stripTags(m[2]);
      if (id && name && /PIB|National/i.test(name)) regionMap.set(id, id === '3' ? 'All India (National HQ)' : name);
    }
    if (regionMap.size > 0) {
      const list = Array.from(regionMap.entries()).map(([regid, name]) => ({ regid, name }));
      list.sort((a, b) => (a.regid === '3' ? -1 : b.regid === '3' ? 1 : a.name.localeCompare(b.name)));
      return { ok: true, regions: list, error: null };
    }
    return { ok: false, regions: [], error: 'PIB ViewRss returned no regions' };
  } catch (err) {
    return { ok: false, regions: [], error: `PIB regions unreachable (${err.message})` };
  }
}

async function fetchPibPostedDate(url) {
  try {
    const pridMatch = String(url || '').match(/PRID=(\d+)/i);
    const targetUrl = pridMatch ? `https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=${pridMatch[1]}` : url;
    const html = await fetchText(targetUrl, {}, 5000);
    const clean = stripTags(html);
    const m = clean.match(/Posted\s+On:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i);
    if (m) return { iso: parseDateSmart(`${m[1]} GMT+0530`), raw: m[1] };
  } catch {}
  return { iso: null, raw: '' };
}

async function fetchPibReleases(regid = '3', langCode = 'en') {
  const pibLangId = PIB_LANG_MAP[langCode] || 1;
  const primaryUrl = `https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=${pibLangId}&Regid=${encodeURIComponent(regid)}`;
  try {
    let xml = await fetchText(primaryUrl, {}, 12000);
    let parsed = parseRssItems(xml);
    let activeUrl = primaryUrl;

    if (parsed.length === 0 && pibLangId !== 1) {
      const enUrl = `https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=${encodeURIComponent(regid)}`;
      xml = await fetchText(enUrl, {}, 12000);
      parsed = parseRssItems(xml);
      activeUrl = enUrl;
    }

    const slice = parsed.slice(0, 25);
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
      agency: 'PIB', verifiedBy: 'PIB India Official',
      department: regid === '3' ? 'Press Information Bureau (All India HQ)' : `Press Information Bureau (Region #${regid})`,
      title: it.title, summary: it.description || it.title,
      publishedAt: it.publishedAt, dateText: it.pubDate || 'Latest PIB Release',
      link: it.link, pdfUrl: '', image: it.image || ''
    }));

    return { ok: items.length > 0, count: items.length, sourceUrl: activeUrl, items, error: items.length ? null : `No live RSS releases returned for PIB Region #${regid}` };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: primaryUrl, items: [], error: `PIB server unreachable (${err.message})` };
  }
}

async function fetchPibMinistriesList() {
  const url = 'https://www.pib.gov.in/AllRel.aspx?reg=3&lang=1';
  try {
    const html = await fetchText(url, {}, 11000);
    const minSel = html.match(/<select[^>]+id=["']ContentPlaceHolder1_ddlMinistry["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] || '';
    const list = [...minSel.matchAll(/<option[^>]+value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi)]
      .map((o) => ({ minid: o[1], name: stripTags(o[2]) }))
      .filter((x) => x.minid && x.name && x.minid !== '0');
    if (list.length > 0) return { ok: true, ministries: list, error: null };
    return { ok: false, ministries: [], error: 'PIB AllRel did not return ministries dropdown' };
  } catch (err) {
    return { ok: false, ministries: [], error: `PIB ministries unreachable (${err.message})` };
  }
}

function parsePibAllRelSections(html, filterMinistryName = '', isSingleMinistryFiltered = false) {
  const startIdx = html.search(/class=["'][^"']*content-area[^"']*["']/i);
  const footerIdx = html.search(/<footer/i);
  const contentArea = startIdx > -1 ? html.slice(startIdx, footerIdx > startIdx ? footerIdx : undefined) : html;

  const sections = contentArea.split(/<h3[^>]*>/i);
  const results = [];
  const seen = new Set();
  const normTarget = filterMinistryName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const extractLinksFromHtml = (body, ministryLabel) => {
    const linkRe = /<a[^>]+href=["']([^"']*PressRelease(?:Detail|IframePage|Page)\.aspx\?PRID=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(body)) !== null) {
      const link = new URL(decodeEntities(m[1]), 'https://www.pib.gov.in').href;
      const prid = m[2];
      const title = stripTags(m[3]);
      if (!title || title.length < 6 || seen.has(prid)) continue;
      seen.add(prid);

      const ctx = stripTags(body.slice(m.index, m.index + m[0].length + 240));
      const dateMatch = ctx.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i);
      results.push({
        prid, ministry: ministryLabel, title, link,
        publishedAt: dateMatch ? parseDateSmart(`${dateMatch[1]} GMT+0530`) : null,
        dateText: dateMatch?.[1] || ''
      });
    }
  };

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const h3End = sec.indexOf('</h3>');
    if (h3End === -1) continue;
    const secMinistry = stripTags(sec.slice(0, h3End));
    const normSec = secMinistry.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    if (!isSingleMinistryFiltered && normTarget && normSec !== normTarget && !normSec.includes(normTarget) && !normTarget.includes(normSec)) {
      continue;
    }
    extractLinksFromHtml(sec.slice(h3End + 5), secMinistry || filterMinistryName);
  }

  if (isSingleMinistryFiltered && results.length === 0) {
    extractLinksFromHtml(contentArea, filterMinistryName);
  }

  return results;
}

async function fetchPibByMinistry(minid = '0', agencyLabel = 'MINISTRY', deptFallback = 'Union Ministry') {
  if (!minid || minid === '0') return fetchPibReleases('3', 'en');
  const pageUrl = 'https://www.pib.gov.in/AllRel.aspx?reg=3&lang=1';
  try {
    const getRes = await fetchResponse(pageUrl, {}, 12000);
    let cookieHeader = extractSetCookieHeader(getRes);
    let activeHtml = await getRes.text();

    const minLabelMatch = activeHtml.match(new RegExp(`<option[^>]+value=["']${minid}["'][^>]*>([\\s\\S]*?)<\\/option>`, 'i'));
    const ministryName = minLabelMatch ? stripTags(minLabelMatch[1]) : deptFallback;

    let parsed = parsePibAllRelSections(activeHtml, ministryName, false);

    if (parsed.length === 0) {
      const selectName = (id, defName) =>
        activeHtml.match(new RegExp(`<select[^>]+id=["']${id}["'][^>]+name=["']([^"']+)["']`, 'i'))?.[1] ||
        activeHtml.match(new RegExp(`<select[^>]+name=["']([^"']+)["'][^>]+id=["']${id}["']`, 'i'))?.[1] ||
        defName;

      const minSelectName = selectName('ContentPlaceHolder1_ddlMinistry', 'ctl00$ContentPlaceHolder1$ddlMinistry');
      const daySelectName = selectName('ContentPlaceHolder1_ddlday', 'ctl00$ContentPlaceHolder1$ddlday');
      const monthSelectName = selectName('ContentPlaceHolder1_ddlMonth', 'ctl00$ContentPlaceHolder1$ddlMonth');
      const yearSelectName = selectName('ContentPlaceHolder1_ddlYear', 'ctl00$ContentPlaceHolder1$ddlYear');
      const regSelectName = selectName('Bar1_ddlregion', 'ctl00$Bar1$ddlregion');
      const langSelectName = selectName('Bar1_ddlLang', 'ctl00$Bar1$ddlLang');

      const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
      const curYear = istNow.getUTCFullYear();
      const curMonth = istNow.getUTCMonth() + 1;

      const monthsToTry = [];
      for (let back = 0; back < 3; back++) {
        let m = curMonth - back;
        let y = curYear;
        if (m <= 0) { m += 12; y -= 1; }
        monthsToTry.push({ m, y });
      }

      for (const { m, y } of monthsToTry) {
        const form = extractHiddenInputs(activeHtml);
        form.set('__EVENTTARGET', minSelectName);
        form.set('__EVENTARGUMENT', '');
        form.set(regSelectName, '3');
        form.set(langSelectName, '1');
        form.set(minSelectName, String(minid));
        form.set(daySelectName, '0');
        form.set(monthSelectName, String(m));
        form.set(yearSelectName, String(y));

        try {
          const postRes = await fetchResponse(pageUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Origin': 'https://www.pib.gov.in',
              'Referer': pageUrl,
              ...(cookieHeader ? { Cookie: cookieHeader } : {})
            },
            body: form.toString()
          }, 12000);
          const nextCookies = extractSetCookieHeader(postRes);
          if (nextCookies) cookieHeader = nextCookies;
          activeHtml = await postRes.text();
          const postParsed = parsePibAllRelSections(activeHtml, ministryName, true);
          if (postParsed.length > 0) {
            parsed = postParsed;
            break;
          }
        } catch {}
      }
    }

    await Promise.allSettled(
      parsed.slice(0, 10).map(async (it) => {
        if (!it.publishedAt) {
          const d = await fetchPibPostedDate(it.link);
          if (d.iso) { it.publishedAt = d.iso; it.dateText = d.raw; }
        }
      })
    );

    const items = parsed.slice(0, 25).map((it) => ({
      id: `pib-min-${minid}-${it.prid}`,
      agency: agencyLabel,
      verifiedBy: 'PIB India Official',
      department: it.ministry || ministryName,
      title: it.title,
      summary: `${it.ministry || ministryName} — ${it.title}`,
      publishedAt: it.publishedAt,
      dateText: it.dateText || 'Latest on PIB',
      link: it.link,
      pdfUrl: '',
      image: ''
    }));

    return {
      ok: items.length > 0,
      count: items.length,
      ministryName,
      sourceUrl: pageUrl,
      items,
      error: items.length ? null : `No recent releases found for ${ministryName} on PIB in the last 3 months`
    };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: pageUrl, items: [], error: `PIB Ministry query failed (${err.message})` };
  }
}

async function fetchSansadHouseUpdates(house = 'rs') {
  const isRs = house === 'rs';
  const url = isRs ? 'https://sansad.in/rs' : 'https://sansad.in/ls';
  const agency = isRs ? 'RAJYA SABHA' : 'LOK SABHA';
  const dept = isRs ? 'Rajya Sabha (Digital Sansad)' : 'Lok Sabha (Digital Sansad)';
  try {
    const html = await fetchText(url, {}, 10000);
    const items = [];
    const seen = new Set();

    const nextDataStr = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nextDataStr) {
      try {
        const nextJson = JSON.parse(nextDataStr);
        const walk = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { node.forEach(walk); return; }
          const title = node.title || node.subject || node.heading || node.name;
          const fileOrUrl = node.pdfUrl || node.fileUrl || node.url || node.link || node.attachment;
          const rawDate = node.date || node.publishedDate || node.createdAt || node.updatedAt || '';
          if (typeof title === 'string' && typeof fileOrUrl === 'string' && title.length > 10 && /(press|bulletin|release|getFile|\.pdf)/i.test(`${title} ${fileOrUrl}`)) {
            const fullUrl = new URL(fileOrUrl, 'https://sansad.in').href;
            if (!seen.has(fullUrl)) {
              seen.add(fullUrl);
              items.push({
                id: `sansad-${house}-${Buffer.from(fullUrl).toString('base64url').slice(-10)}`,
                agency, verifiedBy: 'Digital Sansad Official', department: dept,
                title: stripTags(title), summary: `${dept} — ${stripTags(title)}`,
                publishedAt: parseDateSmart(rawDate), dateText: rawDate || 'Digital Sansad Live',
                link: fullUrl, pdfUrl: /\.pdf/i.test(fullUrl) ? fullUrl : '', image: ''
              });
            }
          }
          Object.values(node).forEach(walk);
        };
        walk(nextJson);
      } catch {}
    }

    const linkRe = /<a[^>]+href=["']([^"']*(?:getFile|press|bulletin)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html)) !== null) {
      const fullUrl = new URL(decodeEntities(m[1]), 'https://sansad.in').href;
      const title = stripTags(m[2]);
      if (!title || title.length < 12 || seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      items.push({
        id: `sansad-${house}-${Buffer.from(fullUrl).toString('base64url').slice(-10)}`,
        agency, verifiedBy: 'Digital Sansad Official', department: dept,
        title, summary: `${dept} — ${title}`,
        publishedAt: null, dateText: 'Digital Sansad Live',
        link: fullUrl, pdfUrl: /\.pdf/i.test(fullUrl) ? fullUrl : '', image: ''
      });
    }

    return { ok: items.length > 0, count: items.length, sourceUrl: url, items: items.slice(0, 15), error: items.length ? null : `${dept} rendered client-side only` };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: url, items: [], error: `Digital Sansad (${house.toUpperCase()}) unreachable (${err.message})` };
  }
}

async function fetchParliamentAll() {
  const [pibRs, pibLs, directRs, directLs] = await Promise.all([
    fetchPibByMinistry('2934', 'RAJYA SABHA', 'Rajya Sabha Secretariat'),
    fetchPibByMinistry('2608', 'LOK SABHA', 'Lok Sabha Secretariat'),
    fetchSansadHouseUpdates('rs'),
    fetchSansadHouseUpdates('ls')
  ]);

  const rsItems = [...directRs.items, ...pibRs.items];
  const lsItems = [...directLs.items, ...pibLs.items];

  return {
    rajya_sabha: {
      ok: rsItems.length > 0,
      count: rsItems.length,
      items: rsItems,
      error: rsItems.length ? null : (pibRs.error || directRs.error)
    },
    lok_sabha: {
      ok: lsItems.length > 0,
      count: lsItems.length,
      items: lsItems,
      error: lsItems.length ? null : (pibLs.error || directLs.error)
    }
  };
}

async function fetchEciAll() {
  const pibEci = await fetchPibByMinistry('35', 'ECI', 'Election Commission of India');
  const directItems = [];
  let directErr = null;

  try {
    const html = await fetchText('https://www.eci.gov.in/press-releases', {}, 9000);
    const linkRe = /<a[^>]+href=["']([^"']*(?:eci-backend\/public\/api\/download|press-release|\.pdf)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    let m;
    while ((m = linkRe.exec(html)) !== null) {
      const link = new URL(decodeEntities(m[1]), 'https://www.eci.gov.in').href;
      const title = stripTags(m[2]);
      if (!title || title.length < 10 || seen.has(link)) continue;
      seen.add(link);
      directItems.push({
        id: `eci-direct-${Buffer.from(link).toString('base64url').slice(-10)}`,
        agency: 'ECI', verifiedBy: 'Election Commission of India',
        department: 'Election Commission of India (Direct)',
        title, summary: title,
        publishedAt: null, dateText: 'Official ECI Portal',
        link, pdfUrl: /download|\.pdf/i.test(link) ? link : '', image: ''
      });
    }
  } catch (err) {
    directErr = err.message;
  }

  const combined = [...directItems, ...pibEci.items];
  return {
    ok: combined.length > 0,
    count: combined.length,
    sourceUrl: 'https://www.eci.gov.in/press-releases',
    items: combined,
    error: combined.length ? null : (pibEci.error || (directErr ? `ECI portal unreachable (${directErr})` : 'ECI page is JS-rendered and no recent PIB ECI releases were found'))
  };
}

async function fetchSciArticleMeta(url) {
  try {
    const html = await fetchText(url, {}, 5000);
    const body = html.split(/<body[^>]*>/i)[1] || html;
    const main = body.match(/<main[\s\S]*?<\/main>/i)?.[0] || body;
    const clean = stripTags(main);
    const dateMatch =
      clean.match(/Publish\s+Date\s*:\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i) ||
      clean.match(/Press\s+Release\s+dated\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
    const pdfHref = main.match(/<a[^>]+href=["']([^"']+\.pdf[^"']*)["']/i)?.[1] || '';
    const pdfUrl = pdfHref ? new URL(decodeEntities(pdfHref), 'https://www.sci.gov.in').href : '';
    const rawDate = dateMatch?.[1] || '';
    return {
      publishedAt: rawDate ? parseDateSmart(rawDate) : null,
      dateText: rawDate,
      pdfUrl,
      summary: htmlToParagraphs(main).slice(0, 600)
    };
  } catch {
    return { publishedAt: null, dateText: '', pdfUrl: '', summary: '' };
  }
}

async function fetchSupremeCourtPress() {
  const url = 'https://www.sci.gov.in/press-release/';
  try {
    const html = await fetchText(url, {}, 12000);
    const body = html.split(/<body[^>]*>/i)[1] || html;
    const main = body.match(/<main[\s\S]*?<\/main>/i)?.[0] || body;

    const candidates = [];
    const seen = new Set();
    const linkRe = /<a[^>]+href=["'](https:\/\/www\.sci\.gov\.in\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(main)) !== null) {
      const href = decodeEntities(m[1]).trim();
      const text = stripTags(m[2]);
      if (!text || text.length < 15 || /arrowDetails|View Details|Skip to|Home|Print/i.test(m[0])) continue;
      if (href === url || seen.has(href)) continue;
      seen.add(href);
      candidates.push({ href, title: text });
    }

    const enriched = await Promise.all(
      candidates.slice(0, 15).map(async (c) => {
        const meta = await fetchSciArticleMeta(c.href);
        return {
          id: `sci-${Buffer.from(c.href).toString('base64url').slice(-12)}`,
          agency: 'SUPREME COURT',
          verifiedBy: 'Supreme Court of India',
          department: 'Supreme Court of India',
          title: c.title,
          summary: meta.summary || c.title,
          publishedAt: meta.publishedAt,
          dateText: meta.dateText || 'Official SCI Release',
          link: meta.pdfUrl || c.href,
          pageUrl: c.href,
          pdfUrl: meta.pdfUrl || '',
          image: ''
        };
      })
    );

    return { ok: enriched.length > 0, count: enriched.length, sourceUrl: url, items: enriched, error: enriched.length ? null : 'No Supreme Court releases found' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: url, items: [], error: `Supreme Court portal unreachable (${err.message})` };
  }
}

async function fetchIsroPress() {
  const url = 'https://www.isro.gov.in/Press.html';
  try {
    const html = await fetchText(url, {}, 12000);
    const items = [];
    const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
      if (tds.length < 3) continue;
      const sn = stripTags(tds[0]);
      if (!/^\d+$/.test(sn)) continue;
      const title = stripTags(tds[1]);
      const dateStr = stripTags(tds[2]);
      const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
      const link = hrefMatch?.[1] ? new URL(decodeEntities(hrefMatch[1]), 'https://www.isro.gov.in/').href : url;
      if (!title) continue;
      items.push({
        id: `isro-${sn}-${dateStr.replace(/\W+/g, '')}`,
        agency: 'ISRO', verifiedBy: 'ISRO Official',
        department: 'Indian Space Research Organisation (ISRO)',
        title, summary: `${title} (${dateStr})`,
        publishedAt: parseDateSmart(dateStr),
        dateText: dateStr || 'Official ISRO Release',
        link, pdfUrl: /\.pdf$/i.test(link) ? link : '', image: ''
      });
    }
    return { ok: items.length > 0, count: items.length, sourceUrl: url, items: items.slice(0, 25), error: items.length ? null : 'ISRO press table unavailable' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: url, items: [], error: `ISRO portal unreachable (${err.message})` };
  }
}

async function fetchNasaPress() {
  const url = 'https://www.nasa.gov/rss/dyn/breaking_news.rss';
  try {
    const xml = await fetchText(url, {}, 11000);
    const items = parseRssItems(xml).slice(0, 20).map((it, idx) => ({
      id: `nasa-${idx}-${Buffer.from(it.link).toString('base64url').slice(-10)}`,
      agency: 'NASA', verifiedBy: 'NASA Official',
      department: 'NASA Breaking News & Missions',
      title: it.title, summary: it.description || it.title,
      publishedAt: it.publishedAt, dateText: it.pubDate || 'Official NASA Release',
      link: it.link, pdfUrl: '', image: it.image || ''
    }));
    return { ok: items.length > 0, count: items.length, sourceUrl: 'https://www.nasa.gov/news/', items, error: items.length ? null : 'NASA RSS empty' };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: 'https://www.nasa.gov/news/', items: [], error: `NASA RSS unreachable (${err.message})` };
  }
}

async function fetchSpaceXUpdates() {
  const url = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?search=SpaceX&limit=10&mode=detailed';
  try {
    const data = await fetchJson(url, {}, 10000);
    const items = (data?.results || []).map((l) => {
      const humanLink =
        l.info_urls?.[0]?.url ||
        l.vid_urls?.[0]?.url ||
        (l.slug ? `https://spacelaunchnow.me/launch/${l.slug}` : 'https://www.spacex.com/launches/');
      return {
        id: `spacex-${l.id}`,
        agency: 'SPACEX', verifiedBy: 'SpaceX Launch Info',
        department: `SpaceX • ${l.pad?.location?.name || 'Launch Complex'}`,
        title: `${l.name} (${l.status?.abbrev || l.status?.name || 'Scheduled'})`,
        summary: l.mission?.description || `Target Launch: ${l.net || 'TBD'} • Pad: ${l.pad?.name || 'SpaceX Launch Pad'}`,
        publishedAt: parseDateSmart(l.net),
        dateText: l.net ? `Launch Window: ${l.net}` : 'Upcoming Mission',
        link: humanLink,
        pdfUrl: '', image: l.image || ''
      };
    });
    return { ok: items.length > 0, count: items.length, sourceUrl: 'https://www.spacex.com/launches/', items, error: null };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: 'https://www.spacex.com/launches/', items: [], error: `SpaceX feed unreachable (${err.message})` };
  }
}

async function fetchStatePolicePress(state = 'ALL') {
  const st = String(state || 'ALL').toUpperCase();
  const items = [];
  const errors = [];
  const tasks = [];

  if (st === 'ALL' || st === 'DELHI') {
    tasks.push((async () => {
      const url = 'https://delhipolice.gov.in/newpressrelease.aspx';
      try {
        const html = await fetchText(url, {}, 11000);
        const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
        let found = 0;
        for (const tr of trMatches) {
          const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
          if (tds.length < 6) continue;
          const sn = stripTags(tds[0]);
          if (!/^\d+$/.test(sn)) continue;
          const title = stripTags(tds[1]);
          const district = stripTags(tds[2]);
          const category = stripTags(tds[4]);
          const dateStr = stripTags(tds[5]);
          const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
          const link = hrefMatch?.[1] ? new URL(decodeEntities(hrefMatch[1]), 'https://delhipolice.gov.in/').href : url;
          if (!title) continue;
          found++;
          items.push({
            id: `police-dl-${sn}-${dateStr.replace(/\D/g, '')}`,
            agency: 'POLICE', stateName: 'DELHI', verifiedBy: 'Delhi Police Official',
            department: `Delhi Police • ${district || category || 'HQ'}`,
            title, summary: `${title} (${district ? district + ' • ' : ''}${category || 'Press Release'})`,
            publishedAt: parseDateSmart(dateStr), dateText: dateStr || 'Delhi Police Release',
            link, pdfUrl: /\.pdf$/i.test(link) ? link : '', image: ''
          });
        }
        if (found === 0) errors.push('Delhi Police returned 0 rows');
      } catch (err) {
        errors.push(`Delhi Police unreachable (${err.message})`);
      }
    })());
  }

  if (st === 'ALL' || st === 'KERALA') {
    tasks.push((async () => {
      const url = 'https://keralapolice.gov.in/page/press-releases';
      try {
        const html = await fetchText(url, {}, 12000);
        const tbody = html.match(/<tbody[\s>][\s\S]*?<\/tbody>/i)?.[0] || html;
        const trMatches = tbody.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
        let found = 0;
        for (let idx = 0; idx < trMatches.length && found < 25; idx++) {
          const tr = trMatches[idx];
          const cells = tr.match(/<(?:td|th)[\s>][\s\S]*?<\/(?:td|th)>/gi) || [];
          if (cells.length < 2) continue;
          const cellTexts = cells.map(stripTags);
          const joined = cellTexts.join(' ');
          if (/Sl\.?\s*No|Date\s+Title/i.test(joined) && !/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/.test(joined)) continue;

          let dateStr = '';
          let title = '';
          for (const txt of cellTexts) {
            const dm = txt.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/);
            if (!dateStr && dm) {
              dateStr = dm[0];
            } else if (txt && !/^(?:#?\d+\.?|Read\s*More|View|Download)$/i.test(txt) && txt.length > title.length) {
              title = txt;
            }
          }
          title = title.replace(/\s*Read\s*More\s*$/i, '').trim();
          const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
          const link = hrefMatch?.[1] ? new URL(decodeEntities(hrefMatch[1]), 'https://keralapolice.gov.in/').href : url;
          if (!title || title.length < 5) continue;

          found++;
          items.push({
            id: `police-kl-${idx}-${dateStr.replace(/\D/g, '')}`,
            agency: 'POLICE', stateName: 'KERALA', verifiedBy: 'Kerala Police Official',
            department: 'Kerala State Police', title, summary: title,
            publishedAt: parseDateSmart(dateStr), dateText: dateStr || 'Kerala Police Release',
            link, pdfUrl: /\.pdf$/i.test(link) ? link : '', image: ''
          });
        }
        if (found === 0) errors.push('Kerala Police table returned 0 rows');
      } catch (err) {
        errors.push(`Kerala Police unreachable (${err.message})`);
      }
    })());
  }

  if (st === 'ALL' || st === 'CHANDIGARH') {
    tasks.push((async () => {
      const url = 'https://chandigarhpolice.gov.in/press-release.html';
      try {
        const html = await fetchText(url, {}, 11000);
        const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
        let found = 0;
        for (let idx = 0; idx < trMatches.length && found < 20; idx++) {
          const tr = trMatches[idx];
          const cells = tr.match(/<(?:td|th)[\s>][\s\S]*?<\/(?:td|th)>/gi) || [];
          if (cells.length < 2) continue;
          const cellTexts = cells.map(stripTags);
          const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
          if (!hrefMatch?.[1]) continue;
          const link = new URL(decodeEntities(hrefMatch[1]), 'https://chandigarhpolice.gov.in/').href;
          let title = cellTexts.find((t) => t.length > 8 && !/^\d+\.?$/.test(t) && !/^(Download|View)$/i.test(t)) || '';
          const dateStr = cellTexts.find((t) => /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i.test(t)) || '';
          if (!title) continue;
          found++;
          items.push({
            id: `police-chd-${idx}-${dateStr.replace(/\W/g, '')}`,
            agency: 'POLICE', stateName: 'CHANDIGARH', verifiedBy: 'Chandigarh Police Official',
            department: 'Chandigarh Police', title, summary: title,
            publishedAt: parseDateSmart(dateStr), dateText: dateStr || 'Chandigarh Police Release',
            link, pdfUrl: /\.pdf$/i.test(link) ? link : '', image: ''
          });
        }
        if (found === 0) errors.push('Chandigarh Police table is JS-rendered or empty');
      } catch (err) {
        errors.push(`Chandigarh Police unreachable (${err.message})`);
      }
    })());
  }

  await Promise.allSettled(tasks);
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return { ok: items.length > 0, count: items.length, items: items.slice(0, 45), error: errors.length ? errors.join(' • ') : null };
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
        agency: 'ED', verifiedBy: 'ED Official', department: zone,
        title: desc.length > 165 ? desc.slice(0, 162) + '...' : desc, summary: desc,
        publishedAt: parseDateSmart(rawDate), dateText: rawDate || 'Official ED Release',
        link, pdfUrl: link !== pageUrl ? link : '', image: ''
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
            agency: 'ED', verifiedBy: 'ED Official',
            department: 'Directorate of Enforcement (PMLA Court Proclamation)',
            location: ecirMatch ? `Case Ref: ${ecirMatch[1]}` : 'Special PMLA Court, India',
            name: subjectName, aliases: [], photo: '', charges: desc || subjectName, description: desc || subjectName,
            caution: 'Official Court Proclamation Notice. Report verified information to the Directorate of Enforcement.',
            rewardText: '', rewardValue: 0,
            publishedAt: parseDateSmart(rawDate) || (dateInText ? parseDateSmart(dateInText[1]) : null),
            updatedAt: null, dob: '', nationality: 'India / Foreign (FEMA/PMLA)',
            noticeType: 'ED PROCLAMATION', sourceUrl: pdfUrl
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
          agency: 'CBI', verifiedBy: 'CBI Official', department: 'Central Bureau of Investigation (CBI)',
          title, summary: title, publishedAt: dmyMatch ? parseDateSmart(dmyMatch[1]) : null,
          dateText: dmyMatch?.[1] || 'Official CBI Portal', link: href, pdfUrl: '', image: ''
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
          agency: 'CBI', verifiedBy: 'CBI / INTERPOL',
          department: 'Central Bureau of Investigation (INTERPOL India NCB)',
          location: 'India / INTERPOL Jurisdiction', name: subjectName, aliases: [],
          photo: imgMatch?.[1] ? new URL(decodeEntities(imgMatch[1]), 'https://cbi.gov.in').href : '',
          charges: 'Active CBI / INTERPOL Red Notice Subject (Published by Central Bureau of Investigation India)',
          description: `Official CBI / INTERPOL India Record #${cols[0]} — ${subjectName}. Click "Verified by CBI / INTERPOL" to view the live INTERPOL Red Notice profile.`,
          caution: 'Report official information to CBI HQ / NCB India or Dial 112.',
          rewardText: '', rewardValue: 0,
          publishedAt: yearMatch ? `Notice Year: ${yearMatch[1]}` : null,
          updatedAt: null, dob: '', nationality: 'India / International',
          noticeType: 'CBI RED NOTICE', sourceUrl
        });
      }
    }
  } catch {}

  return {
    ok: directItems.length > 0 || redNotices.length > 0,
    directAccessible, count: directItems.length, redNoticeCount: redNotices.length,
    sourceUrl: cbiPressUrl, wantedUrl: cbiWantedUrl,
    items: directItems.slice(0, 25), redNotices: redNotices.slice(0, 40),
    error: !directAccessible ? `Direct cbi.gov.in server restricted (${directError || 'WAF/timeout'})` : null
  };
}

// LIVE NIA MOST WANTED
async function fetchNiaWanted() {
  const pageUrls = [
    'https://nia.mha.gov.in/most-wanted',
    'https://nia.mha.gov.in/most-wanted?page=1'
  ];
  const fallbackPhotoUrl = 'https://nia.mha.gov.in/most-wanted-photos';

  const seenNames = new Set();
  const items = [];
  const errors = [];
  let activeUrl = pageUrls[0];

  const parseNiaHtml = (html, pageUrl) => {
    const baseOrigin = new URL(pageUrl).origin;
    const chunks = html.split(/(?=Name\s*(?:<[^>]+>\s*)*:)/gi);
    for (let i = 0; i < chunks.length; i++) {
      const block = chunks[i];
      const prevTail = i > 0 ? stripTags(chunks[i - 1].slice(-300)) : '';
      const clean = stripTags(block);
      if (!/Name\s*:/i.test(clean) || !/Wanted\s+in\s*:/i.test(clean)) continue;

      const nameMatch = clean.match(/Name\s*:\s*([^:]+?)(?=\s*(?:Aliases|Parentage|Address|Wanted\s+in|Accused\s+Status|$))/i);
      const aliasMatch = clean.match(/Aliases\s*:\s*([^:]*?)(?=\s*(?:Parentage|Address|Wanted\s+in|Accused\s+Status|$))/i);
      const addressMatch = clean.match(/Address\s*:\s*([^:]*?)(?=\s*(?:Wanted\s+in|Accused\s+Status|Age\/DOB|$))/i);
      const wantedInMatch = clean.match(/Wanted\s+in\s*:\s*([^:]*?)(?=\s*(?:Accused\s+Status|Age\/DOB|Organization|Reward|For\s+any\s+information|$))/i);
      const dobMatch = clean.match(/Age\/DOB\s*\(Approx\)\s*:\s*([^:]*?)(?=\s*(?:Organization|Reward|For\s+any\s+information|$))/i);
      const orgMatch = clean.match(/Organization\s*:\s*([^:]*?)(?=\s*(?:Reward|For\s+any\s+information|E-mail|Close|$))/i);
      const rewardInBlock = clean.match(/Reward\s*:\s*((?:Rs\.?|₹)?[^:]{1,40}?)(?=\s*(?:For\s+any|E-mail|Close|Name|$))/i);
      const rewardInPrev = prevTail.match(/Reward\s*:\s*((?:Rs\.?|₹)?[^:]{1,40})$/i);
      const rewardRaw = ((rewardInBlock?.[1] || rewardInPrev?.[1]) || '').trim();

      const name = (nameMatch?.[1] || '').replace(/[.\s]+$/, '').trim();
      if (!name || name.length < 2 || seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());

      const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/Photo\/[^"']+)["']/i) ||
        (i > 0 ? chunks[i - 1].slice(-600).match(/<img[^>]+src=["']([^"']*\/Photo\/[^"']+)["']/i) : null);
      const rawPhoto = imgMatch?.[1] || '';
      const photoUrl = rawPhoto && !/photo_not_available/i.test(rawPhoto) ? new URL(rawPhoto, baseOrigin).href : '';
      const aliasesRaw = (aliasMatch?.[1] || '').trim();
      const aliases = aliasesRaw ? aliasesRaw.split('@').map(a => a.replace(/[.\s]+$/, '').trim()).filter(a => a.length > 1).slice(0, 4) : [];
      const address = (addressMatch?.[1] || '').trim();
      const wantedIn = (wantedInMatch?.[1] || '').trim();
      const org = (orgMatch?.[1] || '').trim();
      const caseYearMatch = wantedIn.match(/\/(\d{4})\//);

      items.push({
        id: `nia-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        agency: 'NIA', verifiedBy: 'NIA India Official',
        department: 'National Investigation Agency (NIA India)',
        location: address || 'India (NIA Case Jurisdiction)',
        name, aliases, photo: photoUrl,
        charges: [wantedIn ? `Wanted in Case: ${wantedIn}` : '', org ? `Organization: ${org}` : ''].filter(Boolean).join(' • ') || 'NIA Official Most Wanted Absconder',
        description: `Official NIA Case Reference: ${wantedIn || 'Listed on nia.mha.gov.in'}`,
        caution: 'Report official information to NIA HQ: 011-24368800 / assistance.nia@gov.in or Dial 112.',
        rewardText: rewardRaw && !/^[-nil]+$/i.test(rewardRaw) ? rewardRaw : '',
        rewardValue: rewardRaw ? (parseInt(rewardRaw.replace(/[^\d]/g, ''), 10) || 1) : 0,
        publishedAt: caseYearMatch ? `Case Year: ${caseYearMatch[1]}` : null,
        updatedAt: null, dob: (dobMatch?.[1] || '').trim(), nationality: 'India',
        noticeType: 'NIA WANTED', sourceUrl: 'https://nia.mha.gov.in/most-wanted'
      });
    }
  };

  for (const pageUrl of pageUrls) {
    try {
      const html = await fetchText(pageUrl, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1'
      }, 10000);
      if (!html || /Access Denied|Request Rejected|Just a moment/i.test(html)) {
        errors.push(`${pageUrl}: blocked by WAF`);
        continue;
      }
      activeUrl = pageUrl;
      parseNiaHtml(html, pageUrl);
    } catch (err) {
      errors.push(`${pageUrl}: ${err.message}`);
    }
  }

  if (items.length === 0) {
    try {
      const html = await fetchText(fallbackPhotoUrl, { 'Upgrade-Insecure-Requests': '1' }, 10000);
      parseNiaHtml(html, fallbackPhotoUrl);
    } catch (err) {
      errors.push(`${fallbackPhotoUrl}: ${err.message}`);
    }
  }

  return {
    ok: items.length > 0,
    count: items.length,
    sourceUrl: activeUrl,
    items: items.slice(0, 40),
    error: items.length ? null : `NIA portal unreachable (${errors.join(' • ') || 'no records parsed'})`
  };
}

// LIVE INTERPOL RED NOTICES
async function fetchInterpolRedNotices() {
  const portalUrl = 'https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices';
  const queries = [
    'https://ws-public.interpol.int/notices/v1/red?arrestWarrantCountryId=IN&resultPerPage=20',
    'https://ws-public.interpol.int/notices/v1/red?nationality=IN&resultPerPage=15',
    'https://ws-public.interpol.int/notices/v1/red?resultPerPage=20'
  ];

  const seen = new Map();
  let lastError = null;

  for (const q of queries) {
    try {
      const data = await fetchJson(q, {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cookie': '',
        'Origin': 'https://www.interpol.int',
        'Referer': 'https://www.interpol.int/'
      }, 9000);
      for (const n of data?._embedded?.notices || []) {
        if (n?.entity_id && !seen.has(n.entity_id)) seen.set(n.entity_id, n);
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  const rawNotices = Array.from(seen.values()).slice(0, 24);
  const enriched = await Promise.all(
    rawNotices.map(async (n) => {
      let issuingCountries = [];
      let charges = [];
      let detailPlace = '';
      try {
        if (n._links?.self?.href) {
          const detail = await fetchJson(n._links.self.href, {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cookie': '',
            'Origin': 'https://www.interpol.int',
            'Referer': 'https://www.interpol.int/'
          }, 5500);
          for (const w of detail.arrest_warrants || []) {
            if (w.issuing_country_id) issuingCountries.push(countryName(w.issuing_country_id));
            if (w.charge_translation || w.charge) charges.push(w.charge_translation || w.charge);
          }
          if (detail.place_of_birth || detail.country_of_birth_id) {
            detailPlace = [detail.place_of_birth, countryName(detail.country_of_birth_id)].filter(Boolean).join(', ');
          }
        }
      } catch {}

      const natList = (n.nationalities || []).map(countryName).filter(Boolean);
      const wantedBy = [...new Set(issuingCountries)].join(', ') || 'INTERPOL Member State';
      const fullName = [n.forename, n.name].filter(Boolean).join(' ').trim();
      const yearMatch = String(n.entity_id || '').match(/^(\d{4})\//);

      return {
        id: `interpol-${String(n.entity_id).replace(/[^a-zA-Z0-9-]/g, '-')}`,
        agency: 'INTERPOL',
        verifiedBy: 'INTERPOL Official',
        department: `INTERPOL (Requested by ${wantedBy})`,
        location: detailPlace ? `Wanted by: ${wantedBy} • Origin: ${detailPlace}` : `Wanted by: ${wantedBy}`,
        name: fullName || `Notice ${n.entity_id}`,
        aliases: [],
        photo: n._links?.thumbnail?.href || '',
        charges: charges.length ? [...new Set(charges)].join('; ') : 'Active INTERPOL Red Notice — Arrest Warrant Issued',
        description: `INTERPOL Official Notice ID: ${n.entity_id}`,
        caution: '',
        rewardText: '',
        rewardValue: 0,
        publishedAt: yearMatch ? `Notice Year: ${yearMatch[1]}` : null,
        updatedAt: null,
        dob: n.date_of_birth || '',
        nationality: natList.join(', ') || 'Not Specified',
        noticeType: 'RED NOTICE',
        sourceUrl: `${portalUrl}#${String(n.entity_id).replace('/', '-')}`
      };
    })
  );

  return {
    ok: enriched.length > 0,
    count: enriched.length,
    sourceUrl: portalUrl,
    items: enriched,
    error: enriched.length ? null : `INTERPOL API restricted from server (${lastError || '0 notices'})`
  };
}

async function readOfficialDocument(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    if (!ALLOWED_READER_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
      return { ok: false, error: 'Host not on official allowlist' };
    }
    if (/\.pdf$/i.test(parsedUrl.pathname)) {
      return { ok: true, pdfUrl: parsedUrl.href, text: 'T&C found official PDF document. Tap "Open Official PDF" below.' };
    }

    let fetchTarget = parsedUrl.href;
    const pridMatch = fetchTarget.match(/PRID=(\d+)/i);
    if (parsedUrl.hostname.includes('pib.gov.in') && pridMatch) {
      fetchTarget = `https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=${pridMatch[1]}`;
    }

    const html = await fetchText(fetchTarget, {}, 8500);
    const body = html.split(/<body[^>]*>/i)[1] || html;
    const main =
      body.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
      body.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
      body.match(/class=["'][^"']*(?:innner-page-main-about-us-content|press-detail|entry-content|content-area)[^"']*["'][^>]*>([\s\S]*)/i)?.[1] ||
      body;

    const text = htmlToParagraphs(main);
    const clean = stripTags(main);
    const dateMatch =
      clean.match(/Posted\s+On:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM))?)/i) ||
      clean.match(/Publish\s+Date\s*:\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i);
    const pdfHref = main.match(/<a[^>]+href=["']([^"']+\.pdf[^"']*)["']/i)?.[1] || '';
    const pdfUrl = pdfHref ? new URL(decodeEntities(pdfHref), parsedUrl.origin).href : '';

    return {
      ok: text.length > 30,
      text: text.slice(0, 8000),
      publishedAt: dateMatch ? parseDateSmart(parsedUrl.hostname.includes('pib.gov.in') ? `${dateMatch[1]} GMT+0530` : dateMatch[1]) : null,
      pdfUrl
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  const sourceParam = String(req.query.source || 'pib,ed_press,cbi').toLowerCase();
  const sources = new Set(sourceParam.split(',').map((s) => s.trim()).filter(Boolean));
  const regid = String(req.query.regid || '3').replace(/[^\d]/g, '') || '3';
  const minid = String(req.query.minid || '0').replace(/[^\d]/g, '') || '0';
  const lang = String(req.query.lang || 'en').toLowerCase();
  const policeState = String(req.query.state || 'ALL').toUpperCase();

  if (sources.has('read_article') && req.query.url) {
    return res.status(200).json(await readOfficialDocument(String(req.query.url)));
  }
  if (sources.has('pib_regions')) return res.status(200).json({ updatedAt: new Date().toISOString(), ...(await fetchPibRegionsLive()) });
  if (sources.has('pib_ministries')) return res.status(200).json({ updatedAt: new Date().toISOString(), ...(await fetchPibMinistriesList()) });

  const result = { updatedAt: new Date().toISOString(), sources: {} };
  const tasks = [];

  if (sources.has('all') || sources.has('pib')) tasks.push(fetchPibReleases(regid, lang).then((d) => { result.sources.pib = d; }));
  if (sources.has('pib_ministry')) tasks.push(fetchPibByMinistry(minid, 'MINISTRY', 'Union Ministry').then((d) => { result.sources.pib_ministry = d; }));
  if (sources.has('parliament')) {
    tasks.push(fetchParliamentAll().then((d) => {
      result.sources.rajya_sabha = d.rajya_sabha;
      result.sources.lok_sabha = d.lok_sabha;
    }));
  }
  if (sources.has('eci')) tasks.push(fetchEciAll().then((d) => { result.sources.eci = d; }));
  if (sources.has('sci')) tasks.push(fetchSupremeCourtPress().then((d) => { result.sources.sci = d; }));
  if (sources.has('space')) {
    tasks.push(fetchIsroPress().then((d) => { result.sources.isro = d; }));
    tasks.push(fetchNasaPress().then((d) => { result.sources.nasa = d; }));
    tasks.push(fetchSpaceXUpdates().then((d) => { result.sources.spacex = d; }));
  }
  if (sources.has('police')) tasks.push(fetchStatePolicePress(policeState).then((d) => { result.sources.police = d; }));
  if (sources.has('all') || sources.has('ed_press')) tasks.push(fetchEdPressReleases().then((d) => { result.sources.ed_press = d; }));
  if (sources.has('all') || sources.has('ed_proclamation')) tasks.push(fetchEdProclamations().then((d) => { result.sources.ed_proclamation = d; }));
  if (sources.has('all') || sources.has('cbi')) tasks.push(fetchCbiOfficial().then((d) => { result.sources.cbi = d; }));
  if (sources.has('all') || sources.has('nia')) tasks.push(fetchNiaWanted().then((d) => { result.sources.nia = d; }));
  if (sources.has('all') || sources.has('interpol')) tasks.push(fetchInterpolRedNotices().then((d) => { result.sources.interpol = d; }));

  await Promise.allSettled(tasks);
  return res.status(200).json(result);
}

// api/missing.js — Real-time All-India & Global Missing Persons (ZIPNET, FBI, INTERPOL Yellow)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9'
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code) {
  if (!code) return '';
  try { return regionNames.of(String(code).toUpperCase()) || code; } catch { return code; }
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDmyToIso(dmy) {
  const m = String(dmy || '').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T09:00:00+05:30`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchWithTimeout(url, extraHeaders = {}, timeoutMs = 14000, method = 'GET', body = undefined) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      body,
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchZipnetMissing(stateFilter = 'ALL', debug = false) {
  const url = 'https://zipnet.delhipolice.gov.in/victims/missingpersons/';
  try {
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const setCookie = res.headers.get('set-cookie') || '';
    const cookieHeader = setCookie ? setCookie.split(',').map((c) => c.split(';')[0]).join('; ') : '';

    let items = [];
    const totalMatch = html.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+([\d,]+)\s+entries/i);
    let totalDatabaseEntries = totalMatch?.[1] || null;

    // 1. Parse initial SSR table rows if present
    const tbodyMatch = html.match(/<tbody[\s>][\s\S]*?<\/tbody>/i);
    if (tbodyMatch) {
      const trMatches = tbodyMatch[0].match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
      for (const tr of trMatches) {
        const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
        if (tds.length < 9) continue;
        const state = stripTags(tds[0]);
        const district = stripTags(tds[1]);
        const policeStation = stripTags(tds[2]);
        const firNo = stripTags(tds[3]);
        const ddDate = stripTags(tds[4]);
        const serialNo = stripTags(tds[5]);
        const missingPlace = stripTags(tds[6]);
        const tracingStatus = stripTags(tds[7]);
        const reportDate = stripTags(tds[8]);
        if (!state || !serialNo || /District/i.test(district)) continue;
        if (stateFilter !== 'ALL' && state.toUpperCase() !== stateFilter.toUpperCase()) continue;

        items.push({
          id: `zipnet-${serialNo.replace(/[^a-zA-Z0-9-]/g, '-')}`,
          agency: 'MISSING',
          missingSource: 'ZIPNET',
          stateName: state,
          verifiedBy: 'ZIPNET Police Official',
          department: `${state} Police • PS ${policeStation} (${district})`,
          location: `${missingPlace || district}, ${district}, ${state}`,
          name: `Missing Case ${serialNo} (${district}, ${state})`,
          aliases: firNo ? [`FIR/DD: ${firNo}`] : [],
          photo: '',
          charges: `Tracing Status: ${tracingStatus} • Missing From: ${missingPlace || 'Not specified'} • Police Station: ${policeStation}, ${district}`,
          description: `Official ZIPNET Missing Person Entry. Serial No: ${serialNo} | FIR/DD No: ${firNo} | DD Date: ${ddDate} | Reported on ZIPNET: ${reportDate}`,
          caution: 'If you have any information, immediately call Emergency 112, Missing Persons Helpline 1094, Childline 1098, or the local Police Station.',
          rewardText: tracingStatus,
          rewardValue: 0,
          publishedAt: parseDmyToIso(reportDate) || parseDmyToIso(ddDate),
          updatedAt: parseDmyToIso(reportDate),
          dob: '',
          nationality: 'India',
          noticeType: `MISSING • ${tracingStatus.toUpperCase()}`,
          sourceUrl: url
        });
      }
    }

    // 2. Discover DataTables / AJAX endpoint embedded in page scripts if tbody was empty
    const ajaxMatches = [];
    const scriptRegex = /(?:url|ajax)\s*:\s*["']([^"']+)["']/gi;
    let sm;
    while ((sm = scriptRegex.exec(html)) !== null) {
      if (sm[1] && !/\.(css|png|jpg|svg|ico)$/i.test(sm[1])) {
        ajaxMatches.push(sm[1]);
      }
    }

    const debugAjaxResults = [];
    if (items.length === 0 && ajaxMatches.length > 0) {
      for (const rel of ajaxMatches.slice(0, 4)) {
        const ajaxUrl = new URL(rel, url).href;
        for (const method of ['POST', 'GET']) {
          try {
            const aRes = await fetchWithTimeout(
              ajaxUrl,
              {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': url,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
                ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {})
              },
              10000,
              method,
              method === 'POST' ? 'draw=1&start=0&length=25' : undefined
            );
            const raw = await aRes.text();
            debugAjaxResults.push({ ajaxUrl, method, status: aRes.status, sample: raw.slice(0, 300) });
            if (aRes.ok && raw.trim().startsWith('{')) {
              const json = JSON.parse(raw);
              const rows = json.data || json.aaData || json.rows || [];
              if (json.recordsTotal) totalDatabaseEntries = String(json.recordsTotal);
              if (Array.isArray(rows) && rows.length > 0) {
                for (const r of rows) {
                  const arr = Array.isArray(r) ? r.map(stripTags) : Object.values(r).map(stripTags);
                  if (arr.length < 8) continue;
                  const [state, district, policeStation, firNo, ddDate, serialNo, missingPlace, tracingStatus, reportDate] = arr;
                  if (!state || !serialNo) continue;
                  if (stateFilter !== 'ALL' && state.toUpperCase() !== stateFilter.toUpperCase()) continue;
                  items.push({
                    id: `zipnet-${serialNo.replace(/[^a-zA-Z0-9-]/g, '-')}`,
                    agency: 'MISSING',
                    missingSource: 'ZIPNET',
                    stateName: state,
                    verifiedBy: 'ZIPNET Police Official',
                    department: `${state} Police • PS ${policeStation} (${district})`,
                    location: `${missingPlace || district}, ${district}, ${state}`,
                    name: `Missing Case ${serialNo} (${district}, ${state})`,
                    aliases: firNo ? [`FIR/DD: ${firNo}`] : [],
                    photo: '',
                    charges: `Tracing Status: ${tracingStatus || 'Untraced'} • Missing From: ${missingPlace || 'Not specified'} • Police Station: ${policeStation}, ${district}`,
                    description: `Official ZIPNET Missing Person Entry. Serial No: ${serialNo} | FIR/DD No: ${firNo} | DD Date: ${ddDate} | Reported on ZIPNET: ${reportDate || ''}`,
                    caution: 'If you have any information, immediately call Emergency 112, Missing Persons Helpline 1094, Childline 1098, or the local Police Station.',
                    rewardText: tracingStatus || 'Untraced',
                    rewardValue: 0,
                    publishedAt: parseDmyToIso(reportDate || ddDate),
                    updatedAt: parseDmyToIso(reportDate || ddDate),
                    dob: '',
                    nationality: 'India',
                    noticeType: `MISSING • ${(tracingStatus || 'UNTRACED').toUpperCase()}`,
                    sourceUrl: url
                  });
                }
                if (items.length > 0) break;
              }
            }
          } catch (e) {
            debugAjaxResults.push({ ajaxUrl, method, error: e.message });
          }
        }
        if (items.length > 0) break;
      }
    }

    return {
      ok: items.length > 0,
      count: items.length,
      totalDatabaseEntries,
      sourceUrl: url,
      items,
      error: items.length ? null : 'ZIPNET table requires interactive session/browser search',
      ...(debug ? { debugAjaxMatches: ajaxMatches, debugAjaxResults } : {})
    };
  } catch (err) {
    return { ok: false, count: 0, totalDatabaseEntries: null, sourceUrl: url, items: [], error: `ZIPNET unreachable (${err.message})` };
  }
}

async function fetchFbiMissing() {
  const url = 'https://api.fbi.gov/wanted/v1/list?poster_classification=missing&page=1';
  try {
    const res = await fetchWithTimeout(url, { Accept: 'application/json' }, 12000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.items || []).slice(0, 20).map((item) => {
      const offices = Array.isArray(item.field_offices) && item.field_offices.length
        ? item.field_offices.map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(', ')
        : 'Federal HQ';
      const cleanDesc = stripTags(item.details || item.description || '');
      const cleanCharges = stripTags(item.description || (Array.isArray(item.subjects) ? item.subjects.join(', ') : 'Missing Person Case'));
      return {
        id: `fbi-miss-${item.uid}`,
        agency: 'MISSING',
        missingSource: 'FBI_MISSING',
        stateName: 'USA / Global',
        verifiedBy: 'FBI Official',
        department: `FBI Kidnappings & Missing Persons (${offices})`,
        location: [offices + ' Field Office', item.place_of_birth ? `Origin: ${item.place_of_birth}` : ''].filter(Boolean).join(' • '),
        name: stripTags(item.title || 'Unknown Missing Person'),
        aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, 4) : [],
        photo: item.images?.[0]?.thumb || item.images?.[0]?.large || item.images?.[0]?.original || '',
        charges: cleanCharges,
        description: cleanDesc,
        caution: stripTags(item.caution || 'Report verified tips to FBI / local authorities via the official link.'),
        rewardText: stripTags(item.reward_text || ''),
        rewardValue: Number(item.reward_max || item.reward_min || 0),
        publishedAt: item.publication || null,
        updatedAt: item.modified || item.publication || null,
        dob: Array.isArray(item.dates_of_birth_used) && item.dates_of_birth_used.length ? item.dates_of_birth_used[0] : '',
        nationality: item.nationality || 'International',
        noticeType: 'FBI MISSING',
        sourceUrl: item.url || 'https://www.fbi.gov/wanted/kidnap'
      };
    });
    return { ok: items.length > 0, count: items.length, sourceUrl: 'https://www.fbi.gov/wanted/kidnap', items, error: null };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: 'https://www.fbi.gov/wanted/kidnap', items: [], error: `FBI Missing API error (${err.message})` };
  }
}

async function fetchInterpolYellow() {
  const apiUrl = 'https://ws-public.interpol.int/notices/v1/yellow?resultPerPage=20';
  const portalUrl = 'https://www.interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices';
  try {
    const res = await fetchWithTimeout(apiUrl, {
      'Accept': 'application/json',
      'Origin': 'https://www.interpol.int',
      'Referer': 'https://www.interpol.int/'
    }, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const notices = data?._embedded?.notices || [];
    const items = notices.map((n) => {
      const fullName = [n.forename, n.name].filter(Boolean).join(' ').trim();
      const natList = (n.nationalities || []).map(countryName).filter(Boolean);
      const yearMatch = String(n.entity_id || '').match(/^(\d{4})\//);
      return {
        id: `interpol-yellow-${String(n.entity_id).replace(/[^a-zA-Z0-9-]/g, '-')}`,
        agency: 'MISSING',
        missingSource: 'INTERPOL_YELLOW',
        stateName: 'Global (INTERPOL)',
        verifiedBy: 'INTERPOL Official',
        department: 'INTERPOL Yellow Notice (Global Missing Persons)',
        location: natList.length ? `Nationality: ${natList.join(', ')}` : 'International',
        name: fullName || `Notice ${n.entity_id}`,
        aliases: [],
        photo: n._links?.thumbnail?.href || '',
        charges: `Active INTERPOL Yellow Notice — Missing Person Alert (Notice ID: ${n.entity_id})`,
        description: `INTERPOL Yellow Notice published for international assistance in locating a missing person.`,
        caution: 'Contact national police or INTERPOL via the official notice link.',
        rewardText: '',
        rewardValue: 0,
        publishedAt: yearMatch ? `Notice Year: ${yearMatch[1]}` : null,
        updatedAt: null,
        dob: n.date_of_birth || '',
        nationality: natList.join(', ') || 'Not Specified',
        noticeType: 'YELLOW NOTICE',
        sourceUrl: `${portalUrl}#${String(n.entity_id).replace('/', '-')}`
      };
    });
    return { ok: items.length > 0, count: items.length, sourceUrl: portalUrl, items, error: null };
  } catch (err) {
    return { ok: false, count: 0, sourceUrl: portalUrl, items: [], error: `INTERPOL Yellow Notices restricted (${err.message})` };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  const source = String(req.query.source || 'all').toLowerCase();
  const state = String(req.query.state || 'ALL').trim();
  const debug = req.query.debug === '1';

  const out = { updatedAt: new Date().toISOString(), sources: {} };
  const tasks = [];

  if (source === 'all' || source.includes('zipnet')) {
    tasks.push(fetchZipnetMissing(state, debug).then((d) => { out.sources.zipnet = d; }));
  }
  if (source === 'all' || source.includes('fbi')) {
    tasks.push(fetchFbiMissing().then((d) => { out.sources.fbi_missing = d; }));
  }
  if (source === 'all' || source.includes('interpol')) {
    tasks.push(fetchInterpolYellow().then((d) => { out.sources.interpol_yellow = d; }));
  }

  await Promise.allSettled(tasks);
  return res.status(200).json(out);
}

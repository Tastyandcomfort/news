import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code) {
  if (!code) return '';
  try {
    return regionNames.of(String(code).toUpperCase()) || code;
  } catch {
    return code;
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, extraHeaders = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function curlHtml(url) {
  const { stdout } = await execFileAsync('curl', [
    '-sS', '-L', '--max-time', '20',
    '-w', '\n__HTTP_STATUS__:%{http_code}',
    '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '-H', 'Accept-Language: en-IN,en-US;q=0.9,en;q=0.8',
    '-H', 'Upgrade-Insecure-Requests: 1',
    url
  ], { maxBuffer: 10 * 1024 * 1024 });

  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  const status = idx !== -1 ? parseInt(stdout.slice(idx + marker.length).trim(), 10) : 0;
  const body = idx !== -1 ? stdout.slice(0, idx) : stdout;
  return { status, body };
}

// 1. DIRECT OFFICIAL US GOVT: FBI Wanted API (api.fbi.gov)
async function fetchFbiWanted() {
  const records = [];
  for (const page of [1, 2]) {
    try {
      const res = await fetchWithTimeout(`https://api.fbi.gov/wanted/v1/list?page=${page}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.items || []) {
        const offices = Array.isArray(item.field_offices) && item.field_offices.length > 0
          ? item.field_offices.map(o => o.charAt(0).toUpperCase() + o.slice(1)).join(', ')
          : 'Federal HQ';
        const locationParts = [`${offices} Field Office`];
        if (item.place_of_birth) locationParts.push(`Birthplace: ${item.place_of_birth}`);
        if (item.nationality) locationParts.push(`Nationality: ${item.nationality}`);

        records.push({
          id: `fbi-${item.uid}`,
          agency: 'FBI',
          verifiedBy: 'FBI Official',
          department: `FBI (${offices})`,
          location: locationParts.join(' • '),
          name: item.title || 'Unknown Subject',
          aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, 4) : [],
          photo: item.images?.[0]?.thumb || item.images?.[0]?.large || item.images?.[0]?.original || '',
          charges: (Array.isArray(item.subjects) && item.subjects.length ? item.subjects.join(', ') : '') || item.description || 'Federal Wanted Bulletin',
          description: item.description || '',
          caution: item.caution || '',
          rewardText: item.reward_text || (item.reward_max ? `Up to $${Number(item.reward_max).toLocaleString()}` : ''),
          rewardValue: Number(item.reward_max || item.reward_min || 0),
          publishedAt: item.publication || null,
          updatedAt: item.modified || null,
          dob: Array.isArray(item.dates_of_birth_used) && item.dates_of_birth_used.length ? item.dates_of_birth_used[0] : '',
          nationality: item.nationality || 'Not Specified',
          noticeType: 'FBI WANTED',
          sourceUrl: item.url || 'https://www.fbi.gov/wanted'
        });
      }
    } catch (err) {
      console.warn(`FBI page ${page} error:`, err.message);
    }
  }
  return records.slice(0, 40);
}

// 2. DIRECT OFFICIAL INTERPOL API
async function fetchInterpolWanted() {
  const seen = new Map();
  const queries = [
    'https://ws-public.interpol.int/notices/v1/red?arrestWarrantCountryId=IN&resultPerPage=20',
    'https://ws-public.interpol.int/notices/v1/red?nationality=IN&resultPerPage=15',
    'https://ws-public.interpol.int/notices/v1/red?resultPerPage=20'
  ];

  for (const q of queries) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetchWithTimeout(q, {
          'Origin': 'https://www.interpol.int',
          'Referer': 'https://www.interpol.int/'
        });
        if (res.ok) {
          const data = await res.json();
          for (const n of data?._embedded?.notices || []) {
            if (!seen.has(n.entity_id)) seen.set(n.entity_id, n);
          }
          break;
        }
        console.warn(`INTERPOL fetch HTTP ${res.status} (attempt ${attempt}): ${q}`);
        if ((res.status === 502 || res.status === 503 || res.status === 403) && attempt === 1) await sleep(1200);
      } catch (err) {
        console.warn(`INTERPOL fetch error (attempt ${attempt}):`, err.message);
      }
    }
    await sleep(400);
  }

  const records = [];
  for (const n of Array.from(seen.values()).slice(0, 35)) {
    let issuingCountries = [];
    let charges = [];
    let detailPlace = '';

    try {
      if (n._links?.self?.href) {
        const dRes = await fetchWithTimeout(n._links.self.href, {
          'Origin': 'https://www.interpol.int',
          'Referer': 'https://www.interpol.int/'
        }, 10000);
        if (dRes.ok) {
          const detail = await dRes.json();
          for (const w of detail.arrest_warrants || []) {
            if (w.issuing_country_id) issuingCountries.push(countryName(w.issuing_country_id));
            if (w.charge_translation || w.charge) charges.push(w.charge_translation || w.charge);
          }
          if (detail.place_of_birth || detail.country_of_birth_id) {
            detailPlace = [detail.place_of_birth, countryName(detail.country_of_birth_id)].filter(Boolean).join(', ');
          }
        }
      }
    } catch {}

    const natList = (n.nationalities || []).map(countryName).filter(Boolean);
    const wantedBy = [...new Set(issuingCountries)].join(', ') || 'INTERPOL Member State';
    const fullName = [n.forename, n.name].filter(Boolean).join(' ').trim();
    if (!fullName) continue;

    const yearMatch = String(n.entity_id || '').match(/^(\d{4})\//);

    records.push({
      id: `interpol-${String(n.entity_id).replace(/[^a-zA-Z0-9-]/g, '-')}`,
      agency: 'INTERPOL',
      verifiedBy: 'INTERPOL Official',
      department: `INTERPOL (Requested by ${wantedBy})`,
      location: detailPlace ? `Wanted by: ${wantedBy} • Origin: ${detailPlace}` : `Wanted by: ${wantedBy}`,
      name: fullName,
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
      sourceUrl: `https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices#${String(n.entity_id).replace('/', '-')}`
    });
  }

  return records;
}

// 3. DIRECT OFFICIAL GOVT OF INDIA: NIA Most Wanted via curl
async function fetchNiaIndiaWanted() {
  const niaPages = [
    'https://nia.mha.gov.in/wanted.htm',
    'https://nia.mha.gov.in/wanted.htm?page=1'
  ];

  const seenNames = new Set();
  const records = [];

  for (const pageUrl of niaPages) {
    try {
      const { status, body: html } = await curlHtml(pageUrl);
      if (status !== 200 || !html) {
        console.warn(`NIA curl HTTP ${status}: ${pageUrl}`);
        continue;
      }

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

        const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/Photo\/[^"']+)["']/i)
          || (i > 0 ? chunks[i - 1].slice(-600).match(/<img[^>]+src=["']([^"']*\/Photo\/[^"']+)["']/i) : null);
        const rawPhoto = imgMatch?.[1] || '';
        const photoUrl = rawPhoto && !/photo_not_available/i.test(rawPhoto)
          ? new URL(rawPhoto, baseOrigin).href
          : '';

        const aliasesRaw = (aliasMatch?.[1] || '').trim();
        const aliases = aliasesRaw
          ? aliasesRaw.split('@').map(a => a.replace(/[.\s]+$/, '').trim()).filter(a => a.length > 1).slice(0, 4)
          : [];

        const address = (addressMatch?.[1] || '').trim();
        const wantedIn = (wantedInMatch?.[1] || '').trim();
        const org = (orgMatch?.[1] || '').trim();
        const caseYearMatch = wantedIn.match(/\/(\d{4})\//);

        records.push({
          id: `nia-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
          agency: 'NIA',
          verifiedBy: 'NIA India Official',
          department: 'National Investigation Agency (NIA India)',
          location: address || 'India (NIA Case Jurisdiction)',
          name,
          aliases,
          photo: photoUrl,
          charges: [wantedIn ? `Wanted in Case: ${wantedIn}` : '', org ? `Organization: ${org}` : ''].filter(Boolean).join(' • ') || 'NIA Official Most Wanted Absconder',
          description: `Official NIA Case Reference: ${wantedIn || 'Listed on nia.mha.gov.in'}`,
          caution: 'Report official information to NIA HQ: 011-24368800 / assistance.nia@gov.in or Dial 112.',
          rewardText: rewardRaw && !/^[-nil]+$/i.test(rewardRaw) ? rewardRaw : '',
          rewardValue: rewardRaw ? (parseInt(rewardRaw.replace(/[^\d]/g, ''), 10) || 1) : 0,
          publishedAt: caseYearMatch ? `Case Year: ${caseYearMatch[1]}` : null,
          updatedAt: null,
          dob: (dobMatch?.[1] || '').trim(),
          nationality: 'India',
          noticeType: 'NIA WANTED',
          sourceUrl: 'https://nia.mha.gov.in/wanted.htm'
        });
      }
    } catch (err) {
      console.warn(`NIA curl error (${pageUrl}):`, err.message);
    }
  }

  return records.slice(0, 40);
}

// 4. DIRECT OFFICIAL GOVT OF INDIA: Directorate of Enforcement (Notice for Proclamation)
async function fetchEdProclamations() {
  const url = 'https://enforcementdirectorate.gov.in/wanted/notice-for-proclamation/';
  const records = [];
  try {
    const { status, body: html } = await curlHtml(url);
    if (status !== 200 || !html) {
      console.warn(`ED Proclamation curl HTTP ${status}`);
      return records;
    }

    const trMatches = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      const tds = tr.match(/<td[\s>][\s\S]*?<\/td>/gi) || [];
      if (tds.length < 2) continue;

      const srNo = stripTags(tds[0]);
      if (!/^\d+$/.test(srNo)) continue;

      const description = stripTags(tds[1]);
      if (!description) continue;

      const hrefMatch = tr.match(/<a[^>]+href=["']([^"']+)["']/i);
      const pdfUrl = hrefMatch?.[1] ? new URL(hrefMatch[1], 'https://enforcementdirectorate.gov.in').href : url;
      const againstMatch = description.match(/against\s+([^,(.]+?)(?:\s+(?:to\s+appear|S\/o|W\/o|D\/o|alias|@|directing)|,|\(|$)/i);
      const subjectName = (againstMatch?.[1] || '').trim() || `ED Proclamation Notice #${srNo}`;
      const ecirMatch = description.match(/(ECIR\/[A-Z0-9\/-]+)/i);
      const dateMatch = description.match(/(\d{2})\.(\d{2})\.(\d{4})/);

      records.push({
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
        publishedAt: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T09:00:00+05:30` : null,
        updatedAt: null,
        dob: '',
        nationality: 'India',
        noticeType: 'ED PROCLAMATION',
        sourceUrl: pdfUrl
      });
    }
  } catch (err) {
    console.warn('ED Proclamation error:', err.message);
  }
  return records;
}

async function main() {
  const outputPath = path.resolve(process.cwd(), 'wanted-data.json');

  console.log('Fetching strictly live data from official government portals (zero stale fallback)...');
  const [niaLive, edLive, interpolLive, fbiLive] = await Promise.all([
    fetchNiaIndiaWanted(),
    fetchEdProclamations(),
    fetchInterpolWanted(),
    fetchFbiWanted()
  ]);

  const combined = [...niaLive, ...edLive, ...interpolLive, ...fbiLive];
  const activeSources = [];
  if (niaLive.length) activeSources.push('NIA India');
  if (edLive.length) activeSources.push('ED India');
  if (interpolLive.length) activeSources.push('INTERPOL');
  if (fbiLive.length) activeSources.push('FBI');

  const payload = {
    updatedAt: new Date().toISOString(),
    total: combined.length,
    sources: activeSources,
    items: combined
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Live sync complete -> Total: ${combined.length} (NIA: ${niaLive.length}, ED: ${edLive.length}, INTERPOL: ${interpolLive.length}, FBI: ${fbiLive.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

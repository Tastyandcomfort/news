import fs from 'node:fs/promises';
import path from 'node:path';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
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

// 1. DIRECT OFFICIAL US GOVT: FBI Wanted API (api.fbi.gov)
async function fetchFbiWanted() {
  const records = [];
  for (const page of [1, 2]) {
    try {
      const res = await fetchWithTimeout(`https://api.fbi.gov/wanted/v1/list?page=${page}`);
      if (!res.ok) {
        console.warn(`FBI page ${page} HTTP ${res.status}`);
        continue;
      }
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

// 2. DIRECT OFFICIAL INTERPOL API (ws-public.interpol.int)
async function fetchInterpolWanted() {
  const seen = new Map();
  const queries = [
    'https://ws-public.interpol.int/notices/v1/red?arrestWarrantCountryId=IN&resultPerPage=20',
    'https://ws-public.interpol.int/notices/v1/red?nationality=IN&resultPerPage=15',
    'https://ws-public.interpol.int/notices/v1/red?resultPerPage=20'
  ];

  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(q, {
        'Origin': 'https://www.interpol.int',
        'Referer': 'https://www.interpol.int/'
      });
      if (!res.ok) {
        console.warn(`INTERPOL query HTTP ${res.status}: ${q}`);
        continue;
      }
      const data = await res.json();
      for (const n of data?._embedded?.notices || []) {
        if (!seen.has(n.entity_id)) seen.set(n.entity_id, n);
      }
    } catch (err) {
      console.warn('INTERPOL fetch error:', err.message);
    }
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
    } catch {
      // Proceed with verified summary fields from INTERPOL
    }

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

// 3. DIRECT OFFICIAL GOVT OF INDIA: NIA Most Wanted (nia.mha.gov.in)
async function fetchNiaIndiaWanted() {
  const niaPages = [
    'https://nia.mha.gov.in/most-wanted.htm',
    'https://nia.mha.gov.in/most-wanted.htm?page=1'
  ];

  const seenNames = new Set();
  const records = [];

  for (const pageUrl of niaPages) {
    try {
      const res = await fetchWithTimeout(pageUrl, {
        'Referer': 'https://nia.mha.gov.in/'
      }, 20000);

      if (!res.ok) {
        console.warn(`NIA HTTP ${res.status}: ${pageUrl}`);
        continue;
      }

      const html = await res.text();
      const baseOrigin = new URL(pageUrl).origin;

      // Split into official modal/dossier blocks around "Wanted in :"
      const blocks = html.split(/(?=Name\s*:)/gi);
      for (const block of blocks) {
        if (!/Wanted in\s*:/i.test(block)) continue;

        const clean = stripTags(block);
        const nameMatch = clean.match(/Name\s*:\s*([^:]+?)(?=\s*(?:Aliases|Parentage|Address|Wanted in|Accused Status|$))/i);
        const aliasMatch = clean.match(/Aliases\s*:\s*([^:]*?)(?=\s*(?:Parentage|Address|Wanted in|Accused Status|$))/i);
        const addressMatch = clean.match(/Address\s*:\s*([^:]*?)(?=\s*(?:Wanted in|Accused Status|Age\/DOB|$))/i);
        const wantedInMatch = clean.match(/Wanted in\s*:\s*([^:]*?)(?=\s*(?:Accused Status|Age\/DOB|Organization|For any information|$))/i);
        const dobMatch = clean.match(/Age\/DOB\s*\(Approx\)\s*:\s*([^:]*?)(?=\s*(?:Organization|For any information|$))/i);
        const orgMatch = clean.match(/Organization\s*:\s*([^:]*?)(?=\s*(?:For any information|E-mail|Close|$))/i);
        const rewardMatch = clean.match(/Reward\s*:\s*([^:]*?)(?=\s*Name\s*:)/i);

        const name = (nameMatch?.[1] || '').replace(/[.\s]+$/, '').trim();
        if (!name || name.length < 2 || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/Photo\/[^"']+)["']/i);
        const photoUrl = imgMatch ? new URL(imgMatch[1], baseOrigin).href : '';

        const aliasesRaw = (aliasMatch?.[1] || '').trim();
        const aliases = aliasesRaw
          ? aliasesRaw.split('@').map(a => a.trim()).filter(a => a.length > 1).slice(0, 4)
          : [];

        const address = (addressMatch?.[1] || '').trim();
        const wantedIn = (wantedInMatch?.[1] || '').trim();
        const org = (orgMatch?.[1] || '').trim();
        const rewardRaw = (rewardMatch?.[1] || '').trim();
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
          sourceUrl: 'https://nia.mha.gov.in/most-wanted.htm'
        });
      }
    } catch (err) {
      console.warn(`NIA fetch error (${pageUrl}):`, err.message);
    }
  }

  return records;
}

async function main() {
  const outputPath = path.resolve(process.cwd(), 'wanted-data.json');

  console.log('Fetching strictly from official government portals...');
  const [nia, interpol, fbi] = await Promise.all([
    fetchNiaIndiaWanted(),
    fetchInterpolWanted(),
    fetchFbiWanted()
  ]);

  const combined = [...nia, ...interpol, ...fbi];
  const activeSources = [];
  if (nia.length) activeSources.push('NIA India');
  if (interpol.length) activeSources.push('INTERPOL');
  if (fbi.length) activeSources.push('FBI');

  const payload = {
    updatedAt: new Date().toISOString(),
    total: combined.length,
    sources: activeSources,
    items: combined
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Sync complete -> Total: ${combined.length} (NIA: ${nia.length}, INTERPOL: ${interpol.length}, FBI: ${fbi.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

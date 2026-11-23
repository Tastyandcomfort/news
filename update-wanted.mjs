import fs from 'node:fs/promises';
import path from 'node:path';

const HEADERS = {
  'User-Agent': 'TC-News-Hub-PublicSafetyBot/1.0 (+https://tastyandcomfort.github.io/news/)',
  'Accept': 'application/json,text/html;q=0.9'
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
function countryName(code) {
  if (!code) return '';
  try {
    return regionNames.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// 1. FBI Official Wanted API
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
          updatedAt: item.modified || item.publication || null,
          dob: Array.isArray(item.dates_of_birth_used) && item.dates_of_birth_used.length ? item.dates_of_birth_used[0] : '',
          nationality: item.nationality || 'USA / International',
          noticeType: 'FBI WANTED',
          sourceUrl: item.url || 'https://www.fbi.gov/wanted'
        });
      }
    } catch (err) {
      console.warn(`FBI page ${page} fetch skipped:`, err.message);
    }
  }
  return records;
}

// 2. INTERPOL Public Red Notices (India + Global)
async function fetchInterpolWanted() {
  const seen = new Map();
  const queries = [
    'https://ws-public.interpol.int/notices/v1/red?arrestWarrantCountryId=IN&resultPerPage=20',
    'https://ws-public.interpol.int/notices/v1/red?nationality=IN&resultPerPage=15',
    'https://ws-public.interpol.int/notices/v1/red?resultPerPage=20'
  ];

  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(q);
      if (!res.ok) continue;
      const data = await res.json();
      for (const n of data?._embedded?.notices || []) {
        if (!seen.has(n.entity_id)) seen.set(n.entity_id, n);
      }
    } catch (err) {
      console.warn('INTERPOL list fetch skipped:', err.message);
    }
  }

  const notices = Array.from(seen.values()).slice(0, 40);
  const records = [];

  for (const n of notices) {
    let issuingCountries = [];
    let charges = [];
    let detailPlace = '';

    try {
      if (n._links?.self?.href) {
        const dRes = await fetchWithTimeout(n._links.self.href, 10000);
        if (dRes.ok) {
          const detail = await dRes.json();
          if (Array.isArray(detail.arrest_warrants)) {
            for (const w of detail.arrest_warrants) {
              if (w.issuing_country_id) issuingCountries.push(countryName(w.issuing_country_id));
              if (w.charge_translation || w.charge) charges.push(w.charge_translation || w.charge);
            }
          }
          if (detail.place_of_birth || detail.country_of_birth_id) {
            detailPlace = [detail.place_of_birth, countryName(detail.country_of_birth_id)].filter(Boolean).join(', ');
          }
        }
      }
    } catch {
      // Proceed gracefully with summary notice fields
    }

    const natList = (n.nationalities || []).map(countryName).filter(Boolean);
    const wantedBy = [...new Set(issuingCountries)].join(', ') || 'INTERPOL Member State';
    const fullName = [n.forename, n.name].filter(Boolean).join(' ').trim() || 'Red Notice Subject';
    const yearMatch = String(n.entity_id || '').match(/^(\d{4})\//);
    const approxDate = yearMatch ? `${yearMatch[1]}-01-01` : null;

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
      description: `INTERPOL Entity ID: ${n.entity_id}`,
      caution: '',
      rewardText: '',
      rewardValue: 0,
      publishedAt: approxDate,
      updatedAt: null,
      dob: n.date_of_birth || '',
      nationality: natList.join(', ') || 'International',
      noticeType: 'RED NOTICE',
      sourceUrl: `https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices#${String(n.entity_id).replace('/', '-')}`
    });
  }

  return records;
}

// 3. NIA India Official Most Wanted (Resilient HTML Parser + Previous Fallback)
async function fetchNiaIndiaWanted(previousItems = []) {
  const niaUrls = [
    'https://www.nia.gov.in/most-wanted.htm',
    'https://nia.mha.gov.in/most-wanted.htm'
  ];

  for (const url of niaUrls) {
    try {
      const res = await fetchWithTimeout(url, 15000);
      if (!res.ok) continue;
      const html = await res.text();
      const baseOrigin = new URL(url).origin;

      const parsed = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let match;
      while ((match = rowRegex.exec(html)) !== null && parsed.length < 30) {
        const rowHtml = match[1];
        if (/<th/i.test(rowHtml)) continue;
        const imgMatch = rowHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        const linkMatch = rowHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
          c[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        );

        const candidateName = (linkMatch?.[2]?.replace(/<[^>]+>/g, '').trim()) || cells[1] || cells[0];
        if (!candidateName || candidateName.length < 3) continue;

        const rewardMatch = rowHtml.match(/(?:Rs\.?|₹)\s*[\d,]+(?:\s*(?:Lakh|Lakhs|Crore))?/i);
        const photoUrl = imgMatch ? new URL(imgMatch[1], baseOrigin).href : '';
        const detailUrl = linkMatch ? new URL(linkMatch[1], baseOrigin).href : url;

        parsed.push({
          id: `nia-${candidateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
          agency: 'NIA',
          verifiedBy: 'NIA India Official',
          department: 'National Investigation Agency (NIA India)',
          location: 'India (NIA Jurisdictions)',
          name: candidateName,
          aliases: [],
          photo: photoUrl,
          charges: cells.slice(2).filter(Boolean).join(' • ') || 'NIA India Most Wanted Absconder Notice',
          description: 'Published officially on the NIA India Most Wanted portal.',
          caution: '',
          rewardText: rewardMatch ? rewardMatch[0] : '',
          rewardValue: rewardMatch ? parseInt(rewardMatch[0].replace(/[^\d]/g, ''), 10) || 1 : 0,
          publishedAt: null,
          updatedAt: new Date().toISOString(),
          dob: '',
          nationality: 'India',
          noticeType: 'NIA WANTED',
          sourceUrl: detailUrl
        });
      }

      if (parsed.length > 0) return parsed;
    } catch (err) {
      console.warn(`NIA fetch skipped (${url}):`, err.message);
    }
  }

  // Keep any previously synced NIA items if NIA portal temporarily blocks/times out
  const preserved = previousItems.filter(i => i.agency === 'NIA');
  if (preserved.length > 0) return preserved;

  // Official NIA Portal Reference Card if direct scraping is blocked by NIA firewall
  return [
    {
      id: 'nia-official-portal-directory',
      agency: 'NIA',
      verifiedBy: 'NIA India Official',
      department: 'National Investigation Agency (Ministry of Home Affairs, Govt. of India)',
      location: 'All India • State & Central Jurisdictions',
      name: 'NIA India Official Most Wanted Registry',
      aliases: ['National Investigation Agency Absconders List'],
      photo: '',
      charges: 'Official Indian Most Wanted list, cash rewards, and case dockets published directly by NIA India.',
      description: 'Direct official portal verification link for India-specific NIA Most Wanted absconders.',
      caution: 'Report verified information directly to NIA Headquarters / State Police.',
      rewardText: 'Rewards Up to ₹15 Lakh+',
      rewardValue: 1500000,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dob: '',
      nationality: 'India',
      noticeType: 'NIA OFFICIAL PORTAL',
      sourceUrl: 'https://www.nia.gov.in/most-wanted.htm'
    }
  ];
}

async function main() {
  const outputPath = path.resolve(process.cwd(), 'wanted-data.json');
  let previousItems = [];
  try {
    const existingRaw = await fs.readFile(outputPath, 'utf8');
    previousItems = JSON.parse(existingRaw)?.items || [];
  } catch {
    // First run
  }

  console.log('Fetching official Most Wanted feeds...');
  const [nia, interpol, fbi] = await Promise.all([
    fetchNiaIndiaWanted(previousItems),
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
  console.log(`Saved ${combined.length} official records to wanted-data.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


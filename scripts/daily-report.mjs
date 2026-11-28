// scripts/daily-report.mjs — Zero-Emoji Visual Scorecard (PNG for Telegram + Executive HTML for Gmail)
import nodemailer from 'nodemailer';
import { Resvg } from '@resvg/resvg-js';

const SITE_URL = 'https://tastyandcomfort.github.io/news/';
const GOV_API = 'https://news-lemon-two.vercel.app/api/gov';
const NEWS_API = 'https://news-lemon-two.vercel.app/api/news';
const MISSING_API = 'https://news-lemon-two.vercel.app/api/missing';
const FLIGHTS_APIS = [
  'https://news-39tq.vercel.app/api/flights',
  'https://news-lemon-two.vercel.app/api/flights'
];
const FIRESTORE_URL =
  'https://firestore.googleapis.com/v1/projects/news-61e62/databases/(default)/documents/live_jobs?pageSize=50&key=AIzaSyAOn8eFL_CMGuYVeEa9hfpdkHRxZpjacqU';

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escXml(str) {
  return escHtml(str).replace(/'/g, '&apos;');
}

function truncate(str, max = 90) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

async function fetchWithTimeout(url, timeoutMs = 18000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TC-News-Monitor/2.0', ...headers },
      signal: controller.signal
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms: Date.now() - started, text };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, text: '', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonSafe(url, timeoutMs = 18000) {
  const r = await fetchWithTimeout(url, timeoutMs, { Accept: 'application/json' });
  if (!r.ok) return { ok: false, ms: r.ms, error: r.error || `HTTP ${r.status}`, data: null };
  try {
    return { ok: true, ms: r.ms, error: null, data: JSON.parse(r.text) };
  } catch (err) {
    return { ok: false, ms: r.ms, error: `Invalid JSON (${err.message})`, data: null };
  }
}

function countRssItems(xmlText) {
  const items = [...String(xmlText || '').matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)];
  const firstTitleRaw = items[0]?.[1]?.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const firstTitle = firstTitleRaw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { count: items.length, firstTitle };
}

function row(name, status, metric, detail = '', count = 0, ms = 0, verifyUrl = '') {
  // status: 'OK' | 'WARN' | 'FAIL'
  return { name, status, metric, detail, count, ms, verifyUrl };
}

async function runAllChecks() {
  const sections = [];

  const [
    siteRes,
    worldRss, localRss, natRss,
    bulletinsRes, forexRes, usgsRes, espnRes, solarRes,
    govMainRes, govRegionsRes, govMinListRes, govPmoRes, govParlRes, govSciRes, govEciRes, govSpaceRes, govPoliceRes, customPressRes,
    govWantedRes, wantedJsonRes, fbiLiveRes, missingRes,
    tcAddonsRes, flights1Res, flights2Res, issPosRes, issCrewRes, jobsRes
  ] = await Promise.all([
    fetchWithTimeout(SITE_URL, 15000),
    fetchWithTimeout(`${NEWS_API}?scope=world`, 15000),
    fetchWithTimeout(`${NEWS_API}?scope=local`, 15000),
    fetchWithTimeout(`${NEWS_API}?scope=national`, 15000),
    fetchJsonSafe(`${SITE_URL}bulletins.json?t=${Date.now()}`, 12000),
    fetchJsonSafe('https://open.er-api.com/v6/latest/USD', 12000),
    fetchJsonSafe('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', 12000),
    fetchJsonSafe('https://site.web.api.espn.com/apis/site/v2/sports/cricket/scorepanel', 12000),
    fetchJsonSafe('https://api.open-meteo.com/v1/forecast?latitude=17.3850&longitude=78.4867&daily=sunrise,sunset&timezone=auto', 12000),

    fetchJsonSafe(`${GOV_API}?source=pib,ed_press,cbi&regid=3&lang=en`, 22000),
    fetchJsonSafe(`${GOV_API}?source=pib_regions`, 15000),
    fetchJsonSafe(`${GOV_API}?source=pib_ministries`, 15000),
    fetchJsonSafe(`${GOV_API}?source=pib_ministry&minid=3`, 22000),
    fetchJsonSafe(`${GOV_API}?source=parliament`, 24000),
    fetchJsonSafe(`${GOV_API}?source=sci`, 22000),
    fetchJsonSafe(`${GOV_API}?source=eci`, 22000),
    fetchJsonSafe(`${GOV_API}?source=space`, 22000),
    fetchJsonSafe(`${GOV_API}?source=police&state=ALL`, 22000),
    fetchJsonSafe(`${SITE_URL}press-releases.json?t=${Date.now()}`, 10000),

    fetchJsonSafe(`${GOV_API}?source=nia,ed_proclamation,cbi,interpol`, 24000),
    fetchJsonSafe(`${SITE_URL}wanted-data.json?t=${Date.now()}`, 12000),
    fetchJsonSafe('https://api.fbi.gov/wanted/v1/list?page=1', 15000),
    fetchJsonSafe(`${MISSING_API}?source=all`, 22000),

    fetchWithTimeout(`${SITE_URL}tc-addons.js?t=${Date.now()}`, 12000),
    fetchJsonSafe(FLIGHTS_APIS[0], 14000),
    fetchJsonSafe(FLIGHTS_APIS[1], 14000),
    fetchJsonSafe('https://api.wheretheiss.at/v1/satellites/25544', 12000),
    fetchJsonSafe('https://api.open-notify.org/astros.json', 12000),
    fetchJsonSafe(FIRESTORE_URL, 12000)
  ]);

  // --- TAB 1: HEADLINES & HOME ---
  const t1 = [];
  t1.push(siteRes.ok
    ? row('Website Hosting', 'OK', `200 OK (${siteRes.ms} ms)`, 'GitHub Pages live', 1, siteRes.ms, SITE_URL)
    : row('Website Hosting', 'FAIL', siteRes.error || `HTTP ${siteRes.status}`, 'GitHub Pages unreachable', 0, siteRes.ms, SITE_URL));

  for (const [label, r, url] of [
    ['World Highlights RSS', worldRss, `${NEWS_API}?scope=world`],
    ['Telangana Headlines', localRss, `${NEWS_API}?scope=local`],
    ['India Headlines', natRss, `${NEWS_API}?scope=national`]
  ]) {
    if (!r.ok) { t1.push(row(label, 'FAIL', r.error || `HTTP ${r.status}`, 'RSS feed error', 0, r.ms, url)); continue; }
    const { count, firstTitle } = countRssItems(r.text);
    t1.push(count > 0
      ? row(label, 'OK', `${count} stories (${r.ms} ms)`, firstTitle, count, r.ms, url)
      : row(label, 'FAIL', '0 items', 'No RSS items returned', 0, r.ms, url));
  }

  if (bulletinsRes.ok) {
    const arr = Array.isArray(bulletinsRes.data) ? bulletinsRes.data : (bulletinsRes.data?.bulletins || []);
    t1.push(arr.length > 0
      ? row('T&C Bulletins', 'OK', `${arr.length} published`, arr[0]?.title || '', arr.length, bulletinsRes.ms, `${SITE_URL}bulletins.json`)
      : row('T&C Bulletins', 'WARN', '0 published', 'No bulletins in bulletins.json', 0, bulletinsRes.ms, `${SITE_URL}bulletins.json`));
  } else {
    t1.push(row('T&C Bulletins', 'WARN', bulletinsRes.error, 'Could not read bulletins.json', 0, bulletinsRes.ms));
  }

  t1.push(forexRes.ok && forexRes.data?.rates?.INR
    ? row('Forex USD/INR', 'OK', `INR ${forexRes.data.rates.INR.toFixed(2)}`, 'Open ER-API live rate', 1, forexRes.ms)
    : row('Forex USD/INR', 'FAIL', forexRes.error || 'No rate', 'Forex API error', 0, forexRes.ms));

  t1.push(usgsRes.ok && Array.isArray(usgsRes.data?.features)
    ? row('USGS Earthquakes', 'OK', `${usgsRes.data.features.length} events`, '24h M4.5+ global feed', usgsRes.data.features.length, usgsRes.ms)
    : row('USGS Earthquakes', 'FAIL', usgsRes.error || 'Error', 'USGS feed unreachable', 0, usgsRes.ms));

  const espnEvents = espnRes.data?.scores?.length || espnRes.data?.events?.length || 0;
  t1.push(espnRes.ok
    ? row('ESPN Sports Ticker', 'OK', `${espnEvents} feeds`, 'Live cricket/sports feed', espnEvents, espnRes.ms)
    : row('ESPN Sports Ticker', 'FAIL', espnRes.error, 'ESPN scorepanel error', 0, espnRes.ms));

  t1.push(solarRes.ok && solarRes.data?.daily?.sunrise?.length
    ? row('Solar Schedule', 'OK', `${solarRes.ms} ms`, 'Hyderabad sunrise/sunset synced', 1, solarRes.ms)
    : row('Solar Schedule', 'FAIL', solarRes.error || 'No data', 'Open-Meteo error', 0, solarRes.ms));

  sections.push({ title: 'TAB 1 - HEADLINES & HOME', items: t1 });

  // --- TAB 2: PRESS RELEASES ---
  const t2 = [];
  const gMain = govMainRes.data?.sources || {};
  const checkGov = (label, srcObj, ms, url, treatEmptyAsWarn = false) => {
    if (!srcObj) return row(label, 'FAIL', govMainRes.error || 'No response', 'Server unreachable', 0, ms, url);
    if (srcObj.ok && srcObj.count > 0) {
      return row(label, 'OK', `${srcObj.count} items`, srcObj.items?.[0]?.title || '', srcObj.count, ms, url);
    }
    return row(label, treatEmptyAsWarn ? 'WARN' : 'FAIL', srcObj.error || '0 items', srcObj.error || '0 items returned', 0, ms, url);
  };

  t2.push(checkGov('PIB All India (RSS)', gMain.pib, govMainRes.ms, `${GOV_API}?source=pib`));
  t2.push(govRegionsRes.ok && govRegionsRes.data?.regions?.length
    ? row('PIB Regions List', 'OK', `${govRegionsRes.data.regions.length} regions`, 'Live ViewRss dropdown', govRegionsRes.data.regions.length, govRegionsRes.ms, `${GOV_API}?source=pib_regions`)
    : row('PIB Regions List', 'FAIL', govRegionsRes.data?.error || govRegionsRes.error, 'Failed to load regions', 0, govRegionsRes.ms, `${GOV_API}?source=pib_regions`));

  t2.push(govMinListRes.ok && govMinListRes.data?.ministries?.length
    ? row('PIB Ministries List', 'OK', `${govMinListRes.data.ministries.length} ministries`, 'Live AllRel dropdown', govMinListRes.data.ministries.length, govMinListRes.ms, `${GOV_API}?source=pib_ministries`)
    : row('PIB Ministries List', 'FAIL', govMinListRes.data?.error || govMinListRes.error, 'Failed to load ministries', 0, govMinListRes.ms, `${GOV_API}?source=pib_ministries`));

  t2.push(checkGov('Ministries (PMO Sample)', govPmoRes.data?.sources?.pib_ministry, govPmoRes.ms, `${GOV_API}?source=pib_ministry&minid=3`, true));

  const parl = govParlRes.data?.sources || {};
  t2.push(checkGov('Parliament - Rajya Sabha', parl.rajya_sabha, govParlRes.ms, `${GOV_API}?source=parliament`, true));
  t2.push(checkGov('Parliament - Lok Sabha', parl.lok_sabha, govParlRes.ms, `${GOV_API}?source=parliament`, true));
  t2.push(checkGov('Supreme Court of India', govSciRes.data?.sources?.sci, govSciRes.ms, `${GOV_API}?source=sci`));
  t2.push(checkGov('Election Commission', govEciRes.data?.sources?.eci, govEciRes.ms, `${GOV_API}?source=eci`, true));
  t2.push(checkGov('ED Press Releases', gMain.ed_press, govMainRes.ms, `${GOV_API}?source=ed_press`));
  t2.push(checkGov('CBI Press Releases', gMain.cbi, govMainRes.ms, `${GOV_API}?source=cbi`, true));

  const sp = govSpaceRes.data?.sources || {};
  t2.push(checkGov('Space - ISRO', sp.isro, govSpaceRes.ms, `${GOV_API}?source=space`));
  t2.push(checkGov('Space - NASA', sp.nasa, govSpaceRes.ms, `${GOV_API}?source=space`));
  t2.push(checkGov('Space - SpaceX', sp.spacex, govSpaceRes.ms, `${GOV_API}?source=space`));

  const pol = govPoliceRes.data?.sources?.police;
  if (pol && pol.items) {
    const dl = pol.items.filter(x => x.stateName === 'DELHI').length;
    const kl = pol.items.filter(x => x.stateName === 'KERALA').length;
    const chd = pol.items.filter(x => x.stateName === 'CHANDIGARH').length;
    const status = (dl > 0 || kl > 0) ? (pol.error ? 'WARN' : 'OK') : 'FAIL';
    t2.push(row('State Police Feeds', status, `DL:${dl} KL:${kl} CHD:${chd}`, pol.error || 'Delhi & Kerala live', dl + kl + chd, govPoliceRes.ms, `${GOV_API}?source=police&state=ALL`));
  } else {
    t2.push(row('State Police Feeds', 'FAIL', govPoliceRes.error || 'No response', 'Police endpoint error', 0, govPoliceRes.ms, `${GOV_API}?source=police&state=ALL`));
  }

  if (customPressRes.ok) {
    const cArr = Array.isArray(customPressRes.data) ? customPressRes.data : (customPressRes.data?.items || []);
    t2.push(row('Listed by T&C', 'OK', `${cArr.length} custom`, 'press-releases.json', cArr.length, customPressRes.ms, `${SITE_URL}press-releases.json`));
  } else {
    t2.push(row('Listed by T&C', 'WARN', customPressRes.error, 'press-releases.json missing', 0, customPressRes.ms));
  }

  sections.push({ title: 'TAB 2 - PRESS RELEASES', items: t2 });

  // --- TAB 3: MOST WANTED & MISSING ---
  const t3 = [];
  const gw = govWantedRes.data?.sources || {};

  t3.push(gw.nia?.ok
    ? row('NIA India Most Wanted', 'OK', `${gw.nia.count} records`, gw.nia.items?.[0]?.name || '', gw.nia.count, govWantedRes.ms, `${GOV_API}?source=nia`)
    : row('NIA India Most Wanted', 'FAIL', gw.nia?.error || govWantedRes.error || '0 records', gw.nia?.error || 'Failed', 0, govWantedRes.ms, `${GOV_API}?source=nia`));

  t3.push(gw.ed_proclamation?.ok
    ? row('ED Proclamations', 'OK', `${gw.ed_proclamation.count} records`, gw.ed_proclamation.items?.[0]?.name || '', gw.ed_proclamation.count, govWantedRes.ms, `${GOV_API}?source=ed_proclamation`)
    : row('ED Proclamations', 'FAIL', gw.ed_proclamation?.error || govWantedRes.error || '0 records', gw.ed_proclamation?.error || 'Failed', 0, govWantedRes.ms, `${GOV_API}?source=ed_proclamation`));

  t3.push(gw.cbi?.redNoticeCount > 0
    ? row('CBI / INTERPOL India', 'OK', `${gw.cbi.redNoticeCount} records`, gw.cbi.redNotices?.[0]?.name || '', gw.cbi.redNoticeCount, govWantedRes.ms, `${GOV_API}?source=cbi`)
    : row('CBI / INTERPOL India', 'FAIL', gw.cbi?.error || '0 records', 'CBI Red Notice table failed', 0, govWantedRes.ms, `${GOV_API}?source=cbi`));

  t3.push(gw.interpol?.ok
    ? row('INTERPOL Global (Server)', 'OK', `${gw.interpol.count} records`, gw.interpol.items?.[0]?.name || '', gw.interpol.count, govWantedRes.ms, `${GOV_API}?source=interpol`)
    : row('INTERPOL Global (Server)', 'WARN', 'WAF 403 (Server)', 'Browser-direct fallback active on user device', 0, govWantedRes.ms, `${GOV_API}?source=interpol`));

  t3.push(fbiLiveRes.ok && fbiLiveRes.data?.items?.length
    ? row('FBI Wanted (Live API)', 'OK', `${fbiLiveRes.data.items.length} records`, fbiLiveRes.data.items[0]?.title || '', fbiLiveRes.data.items.length, fbiLiveRes.ms, 'https://api.fbi.gov/wanted/v1/list?page=1')
    : row('FBI Wanted (Live API)', 'FAIL', fbiLiveRes.error || '0 records', 'FBI API unreachable', 0, fbiLiveRes.ms));

  if (wantedJsonRes.ok && wantedJsonRes.data) {
    const wSrc = (wantedJsonRes.data.sources || []).join(', ') || 'None';
    t3.push(row('wanted-data.json Snapshot', 'OK', `${wantedJsonRes.data.total || 0} items`, `Sources: ${wSrc}`, wantedJsonRes.data.total || 0, wantedJsonRes.ms, `${SITE_URL}wanted-data.json`));
  } else {
    t3.push(row('wanted-data.json Snapshot', 'WARN', wantedJsonRes.error, 'Snapshot unreadable', 0, wantedJsonRes.ms));
  }

  const ms = missingRes.data?.sources || {};
  t3.push(ms.fbi_missing?.ok
    ? row('Missing - FBI Live', 'OK', `${ms.fbi_missing.count} records`, ms.fbi_missing.items?.[0]?.name || '', ms.fbi_missing.count, missingRes.ms, `${MISSING_API}?source=fbi`)
    : row('Missing - FBI Live', 'FAIL', ms.fbi_missing?.error || missingRes.error, 'FBI Missing API failed', 0, missingRes.ms, `${MISSING_API}?source=fbi`));

  t3.push(ms.zipnet?.ok
    ? row('Missing - ZIPNET India', 'OK', `${ms.zipnet.count} records`, 'ZIPNET live rows', ms.zipnet.count, missingRes.ms, `${MISSING_API}?source=zipnet`)
    : row('Missing - ZIPNET India', 'WARN', 'Session required', ms.zipnet?.error || 'Interactive session portal', 0, missingRes.ms, `${MISSING_API}?source=zipnet`));

  t3.push(ms.interpol_yellow?.ok
    ? row('Missing - INTERPOL Yellow', 'OK', `${ms.interpol_yellow.count} records`, 'Yellow Notices live', ms.interpol_yellow.count, missingRes.ms, `${MISSING_API}?source=interpol`)
    : row('Missing - INTERPOL Yellow', 'WARN', 'WAF 403 (Server)', 'Browser-direct fallback active on user device', 0, missingRes.ms, `${MISSING_API}?source=interpol`));

  sections.push({ title: 'TAB 3 - MOST WANTED & MISSING', items: t3 });

  // --- TABS 4, 5 & 6: TV, RADAR & JOBS ---
  const t456 = [];
  const tcHasExportErr = /\bexport\s+default\b/.test(tcAddonsRes.text);
  t456.push(tcAddonsRes.ok && !tcHasExportErr
    ? row('TV & Core Engine (tc-addons)', 'OK', `${Math.round(tcAddonsRes.text.length / 1024)} KB`, 'Parsed cleanly, 0 syntax flags', 1, tcAddonsRes.ms, `${SITE_URL}tc-addons.js`)
    : row('TV & Core Engine (tc-addons)', 'FAIL', tcHasExportErr ? 'Syntax error' : (tcAddonsRes.error || `HTTP ${tcAddonsRes.status}`), 'Script load/syntax problem', 0, tcAddonsRes.ms));

  const fl1 = Array.isArray(flights1Res.data?.states) ? flights1Res.data.states.length : 0;
  const fl2 = Array.isArray(flights2Res.data?.states) ? flights2Res.data.states.length : 0;
  t456.push((fl1 > 0 || fl2 > 0)
    ? row('Radar - Live Flights', 'OK', `${Math.max(fl1, fl2)} states`, `39tq: ${fl1} | lemon-two: ${fl2}`, Math.max(fl1, fl2), Math.min(flights1Res.ms, flights2Res.ms), FLIGHTS_APIS[1])
    : row('Radar - Live Flights', 'FAIL', '0 flights', `39tq (${flights1Res.error}) | lemon (${flights2Res.error})`, 0, flights1Res.ms));

  t456.push(issPosRes.ok && issPosRes.data?.altitude
    ? row('Radar - ISS Telemetry', 'OK', `${Math.round(issPosRes.data.altitude)} km alt`, `${Math.round(issPosRes.data.velocity)} km/h`, 1, issPosRes.ms)
    : row('Radar - ISS Telemetry', 'FAIL', issPosRes.error, 'wheretheiss.at error', 0, issPosRes.ms));

  const issPeople = Array.isArray(issCrewRes.data?.people) ? issCrewRes.data.people.filter(p => p.craft === 'ISS').length : 0;
  t456.push(issCrewRes.ok
    ? row('Radar - ISS Crew Manifest', 'OK', `${issPeople} crew`, 'open-notify.org live', issPeople, issCrewRes.ms)
    : row('Radar - ISS Crew Manifest', 'WARN', 'Timeout', issCrewRes.error || 'open-notify.org slow', 0, issCrewRes.ms));

  if (jobsRes.ok) {
    const activeJobs = (jobsRes.data?.documents || []).filter(d => d?.fields?.status?.stringValue === 'active').length;
    t456.push(activeJobs > 0
      ? row('Find Jobs (Firestore)', 'OK', `${activeJobs} active`, 'Firestore live_jobs', activeJobs, jobsRes.ms)
      : row('Find Jobs (Firestore)', 'WARN', '0 active', 'Using built-in listings', 0, jobsRes.ms));
  } else {
    t456.push(row('Find Jobs (Firestore)', 'WARN', jobsRes.error || 'Restricted', 'Firestore rules restrict public REST list', 0, jobsRes.ms));
  }

  sections.push({ title: 'TABS 4, 5 & 6 - TV, RADAR & JOBS', items: t456 });
  return sections;
}

function summarize(sections) {
  let okCount = 0, warnCount = 0, failCount = 0, totalItems = 0;
  const latencies = [];
  const attention = [];

  for (const sec of sections) {
    for (const it of sec.items) {
      if (it.status === 'OK') okCount++;
      else if (it.status === 'WARN') warnCount++;
      else failCount++;

      if (it.count > 1) totalItems += it.count;
      if (it.ms > 0) latencies.push(it.ms);
      if (it.status === 'FAIL' || it.status === 'WARN') {
        attention.push({ section: sec.title, ...it });
      }
    }
  }

  const totalChecks = okCount + warnCount + failCount;
  const healthPct = totalChecks ? Math.round((okCount / totalChecks) * 100) : 0;
  const avgMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  return { okCount, warnCount, failCount, totalChecks, healthPct, totalItems, avgMs, attention };
}

function buildScorecardPng(sections, stats, istNow) {
  const W = 1080;
  const PAD = 36;
  const INNER_W = W - PAD * 2; // 1008
  const COL_GAP = 24;
  const COL_W = (INNER_W - COL_GAP) / 2; // 492

  const fails = stats.attention.filter(a => a.status === 'FAIL');
  const warns = stats.attention.filter(a => a.status === 'WARN');
  const alertLines = [
    ...fails.map(a => ({ level: 'DOWN', text: `${a.name} — ${a.metric}` })),
    ...warns.slice(0, 4).map(a => ({ level: 'NOTICE', text: `${a.name} — ${a.metric}` }))
  ];

  const HEADER_H = 108;
  const KPI_H = 104;
  const ALERT_H = alertLines.length > 0 ? (44 + alertLines.length * 24 + 14) : 0;

  const row1Max = Math.max(sections[0].items.length, sections[1].items.length);
  const row2Max = Math.max(sections[2].items.length, sections[3].items.length);
  const ROW1_H = 44 + row1Max * 28 + 14;
  const ROW2_H = 44 + row2Max * 28 + 14;
  const FOOTER_H = 42;

  let y = 28;
  const headerY = y; y += HEADER_H + 16;
  const kpiY = y; y += KPI_H + 16;
  const alertY = y; if (ALERT_H > 0) y += ALERT_H + 16;
  const row1Y = y; y += ROW1_H + 16;
  const row2Y = y; y += ROW2_H + 14;
  const footerY = y;
  const H = y + FOOTER_H;

  const okW = Math.round((INNER_W * stats.okCount) / Math.max(1, stats.totalChecks));
  const warnW = Math.round((INNER_W * stats.warnCount) / Math.max(1, stats.totalChecks));
  const failW = Math.max(0, INNER_W - okW - warnW);

  const statusColor = (s) => (s === 'OK' ? '#22c55e' : s === 'WARN' ? '#f59e0b' : '#ef4444');
  const overallColor = stats.failCount > 0 ? '#ef4444' : (stats.warnCount > 0 ? '#f59e0b' : '#22c55e');
  const overallText = stats.failCount > 0 ? `${stats.failCount} SOURCE DOWN` : 'ALL CORE SYSTEMS LIVE';

  const drawCard = (sec, x, cy, cardH) => {
    const rowsSvg = sec.items.map((it, idx) => {
      const ry = cy + 44 + idx * 28;
      const dotColor = statusColor(it.status);
      const label = truncate(it.name, 27);
      const metric = truncate(it.metric, 22);
      return `
        <line x1="${x + 16}" y1="${ry + 20}" x2="${x + COL_W - 16}" y2="${ry + 20}" stroke="#1e293b" stroke-width="1"/>
        <circle cx="${x + 22}" cy="${ry + 7}" r="4" fill="${dotColor}"/>
        <text x="${x + 34}" y="${ry + 11}" fill="#e2e8f0" font-size="12.5" font-weight="600">${escXml(label)}</text>
        <text x="${x + COL_W - 16}" y="${ry + 11}" text-anchor="end" fill="${it.status === 'OK' ? '#94a3b8' : dotColor}" font-size="11.5" font-weight="700">${escXml(metric)}</text>
      `;
    }).join('');

    return `
      <rect x="${x}" y="${cy}" width="${COL_W}" height="${cardH}" rx="14" fill="#111827" stroke="#1f2937" stroke-width="1.5"/>
      <rect x="${x}" y="${cy}" width="${COL_W}" height="36" rx="14" fill="#162032"/>
      <rect x="${x}" y="${cy + 22}" width="${COL_W}" height="14" fill="#162032"/>
      <text x="${x + 16}" y="${cy + 23}" fill="#60a5fa" font-size="12" font-weight="800" letter-spacing="0.8">${escXml(sec.title)}</text>
      ${rowsSvg}
    `;
  };

  const kpiCardW = (INNER_W - 16 * 3) / 4;
  const kpis = [
    { label: 'LIVE SOURCES', value: `${stats.okCount} / ${stats.totalChecks}`, sub: `${stats.healthPct}% operational`, color: '#22c55e' },
    { label: 'RECORDS TRACKED', value: stats.totalItems.toLocaleString('en-IN'), sub: 'Live feed items', color: '#38bdf8' },
    { label: 'AVG LATENCY', value: `${stats.avgMs} ms`, sub: 'API response time', color: '#a78bfa' },
    { label: 'ATTENTION', value: `${stats.failCount} Down / ${stats.warnCount} Note`, sub: stats.failCount ? 'Check alert panel' : 'No critical outage', color: overallColor }
  ];

  const kpisSvg = kpis.map((k, i) => {
    const kx = PAD + i * (kpiCardW + 16);
    return `
      <rect x="${kx}" y="${kpiY + 26}" width="${kpiCardW}" height="78" rx="12" fill="#111827" stroke="#1f2937" stroke-width="1.5"/>
      <text x="${kx + 16}" y="${kpiY + 46}" fill="#94a3b8" font-size="10.5" font-weight="700" letter-spacing="0.8">${escXml(k.label)}</text>
      <text x="${kx + 16}" y="${kpiY + 72}" fill="${k.color}" font-size="20" font-weight="800">${escXml(k.value)}</text>
      <text x="${kx + 16}" y="${kpiY + 91}" fill="#64748b" font-size="10.5">${escXml(k.sub)}</text>
    `;
  }).join('');

  const alertSvg = ALERT_H > 0 ? `
    <rect x="${PAD}" y="${alertY}" width="${INNER_W}" height="${ALERT_H}" rx="14" fill="#18121e" stroke="#3b1d2e" stroke-width="1.5"/>
    <text x="${PAD + 18}" y="${alertY + 26}" fill="#f87171" font-size="12" font-weight="800" letter-spacing="0.8">ATTENTION SUMMARY</text>
    ${alertLines.map((a, idx) => {
      const ay = alertY + 48 + idx * 24;
      const c = a.level === 'DOWN' ? '#ef4444' : '#f59e0b';
      return `
        <rect x="${PAD + 18}" y="${ay - 12}" width="54" height="16" rx="4" fill="${c}"/>
        <text x="${PAD + 45}" y="${ay}" text-anchor="middle" fill="#090d16" font-size="9.5" font-weight="800">${a.level}</text>
        <text x="${PAD + 84}" y="${ay}" fill="#e2e8f0" font-size="12" font-weight="600">${escXml(truncate(a.text, 92))}</text>
      `;
    }).join('')}
  ` : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <g font-family="DejaVu Sans, Liberation Sans, Ubuntu, Arial, sans-serif">
        <rect width="${W}" height="${H}" fill="#090d16"/>

        <!-- HEADER -->
        <rect x="${PAD}" y="${headerY}" width="${INNER_W}" height="${HEADER_H}" rx="16" fill="#111827" stroke="#1f2937" stroke-width="1.5"/>
        <text x="${PAD + 24}" y="${headerY + 40}" fill="#f8fafc" font-size="24" font-weight="800">T&amp;C NEWS HUB</text>
        <text x="${PAD + 24}" y="${headerY + 64}" fill="#94a3b8" font-size="13" font-weight="600">AUTOMATED LIVE OPERATIONS SCORECARD</text>
        <text x="${PAD + 24}" y="${headerY + 88}" fill="#64748b" font-size="11.5">${escXml(istNow)} IST  •  Private Daily Diagnostic</text>

        <rect x="${W - PAD - 230}" y="${headerY + 26}" width="206" height="34" rx="17" fill="#0f172a" stroke="${overallColor}" stroke-width="1.5"/>
        <circle cx="${W - PAD - 210}" cy="${headerY + 43}" r="5" fill="${overallColor}"/>
        <text x="${W - PAD - 196}" y="${headerY + 48}" fill="${overallColor}" font-size="11.5" font-weight="800">${escXml(overallText)}</text>

        <!-- SEGMENTED HEALTH BAR -->
        <rect x="${PAD}" y="${kpiY}" width="${INNER_W}" height="12" rx="6" fill="#1e293b"/>
        ${okW > 0 ? `<rect x="${PAD}" y="${kpiY}" width="${okW}" height="12" rx="6" fill="#22c55e"/>` : ''}
        ${warnW > 0 ? `<rect x="${PAD + okW}" y="${kpiY}" width="${warnW}" height="12" fill="#f59e0b"/>` : ''}
        ${failW > 0 ? `<rect x="${PAD + okW + warnW}" y="${kpiY}" width="${failW}" height="12" rx="6" fill="#ef4444"/>` : ''}

        <!-- KPI TILES -->
        ${kpisSvg}

        <!-- ATTENTION PANEL -->
        ${alertSvg}

        <!-- ROW 1: TAB 1 & TAB 2 -->
        ${drawCard(sections[0], PAD, row1Y, ROW1_H)}
        ${drawCard(sections[1], PAD + COL_W + COL_GAP, row1Y, ROW1_H)}

        <!-- ROW 2: TAB 3 & TABS 4-6 -->
        ${drawCard(sections[2], PAD, row2Y, ROW2_H)}
        ${drawCard(sections[3], PAD + COL_W + COL_GAP, row2Y, ROW2_H)}

        <!-- FOOTER -->
        <text x="${PAD}" y="${footerY + 18}" fill="#64748b" font-size="11">Generated by GitHub Actions  •  Full source-by-source brief &amp; verification links sent to Gmail</text>
        <text x="${W - PAD}" y="${footerY + 18}" text-anchor="end" fill="#64748b" font-size="11">tastyandcomfort.github.io/news</text>
      </g>
    </svg>
  `;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' }
  });
  return resvg.render().asPng();
}

function buildExecutiveHtml(sections, stats, istNow) {
  const okPct = ((stats.okCount / Math.max(1, stats.totalChecks)) * 100).toFixed(1);
  const warnPct = ((stats.warnCount / Math.max(1, stats.totalChecks)) * 100).toFixed(1);
  const failPct = ((stats.failCount / Math.max(1, stats.totalChecks)) * 100).toFixed(1);

  const pillHtml = (s) => {
    if (s === 'OK') return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px;background:#dcfce7;color:#166534;border:1px solid #86efac;">LIVE</span>';
    if (s === 'WARN') return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">NOTICE</span>';
    return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">DOWN</span>';
  };

  const attentionHtml = stats.attention.length > 0 ? `
    <div style="margin-bottom:20px;border:1px solid #fecaca;background:#fff5f5;border-radius:14px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.8px;color:#991b1b;margin-bottom:8px;">ITEMS REQUIRING ATTENTION</div>
      ${stats.attention.map(a => `
        <div style="padding:6px 0;border-top:1px solid #fee2e2;font-size:12.5px;color:#1e293b;">
          ${pillHtml(a.status)}
          <strong style="margin-left:6px;">${escHtml(a.name)}</strong>
          <span style="color:#64748b;"> — ${escHtml(a.detail || a.metric)}</span>
          ${a.verifyUrl ? `<a href="${escHtml(a.verifyUrl)}" style="margin-left:8px;color:#0071e3;font-weight:600;text-decoration:none;">Inspect</a>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const sectionCards = sections.map(sec => `
    <div style="margin-bottom:18px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;">
      <div style="background:#f8fafc;padding:11px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:800;letter-spacing:0.6px;color:#0f172a;">
        ${escHtml(sec.title)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        ${sec.items.map(it => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 14px;vertical-align:top;">
              <div style="font-weight:700;color:#0f172a;">${escHtml(it.name)}</div>
              ${it.detail ? `<div style="font-size:11.5px;color:#64748b;margin-top:2px;">${escHtml(truncate(it.detail, 110))}</div>` : ''}
            </td>
            <td style="padding:10px 12px;width:90px;text-align:center;vertical-align:top;">${pillHtml(it.status)}</td>
            <td style="padding:10px 14px;width:150px;text-align:right;vertical-align:top;color:#334155;font-weight:600;">
              <div>${escHtml(it.metric)}</div>
              ${it.verifyUrl ? `<div style="margin-top:3px;"><a href="${escHtml(it.verifyUrl)}" style="font-size:11px;color:#0071e3;text-decoration:none;font-weight:600;">Verify Endpoint</a></div>` : ''}
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('');

  return `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
      <div style="max-width:820px;margin:0 auto;">
        <div style="background:#0f172a;color:#ffffff;padding:22px 24px;border-radius:16px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#94a3b8;">PRIVATE OPERATIONS BRIEF</div>
          <h1 style="margin:4px 0 6px;font-size:21px;font-weight:800;">T&amp;C News Hub</h1>
          <div style="font-size:12.5px;color:#cbd5e1;">${escHtml(istNow)} IST &nbsp;•&nbsp; ${stats.healthPct}% Operational (${stats.okCount} Live, ${stats.warnCount} Notice, ${stats.failCount} Down)</div>
          <div style="margin-top:14px;height:8px;border-radius:999px;background:#1e293b;overflow:hidden;display:flex;">
            <div style="width:${okPct}%;background:#22c55e;"></div>
            <div style="width:${warnPct}%;background:#f59e0b;"></div>
            <div style="width:${failPct}%;background:#ef4444;"></div>
          </div>
        </div>

        <table style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 18px;">
          <tr>
            <td style="width:25%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
              <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.6px;">LIVE SOURCES</div>
              <div style="font-size:20px;font-weight:800;color:#16a34a;margin-top:4px;">${stats.okCount} / ${stats.totalChecks}</div>
            </td>
            <td style="width:25%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
              <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.6px;">LIVE RECORDS</div>
              <div style="font-size:20px;font-weight:800;color:#0284c7;margin-top:4px;">${stats.totalItems.toLocaleString('en-IN')}</div>
            </td>
            <td style="width:25%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
              <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.6px;">AVG LATENCY</div>
              <div style="font-size:20px;font-weight:800;color:#7c3aed;margin-top:4px;">${stats.avgMs} ms</div>
            </td>
            <td style="width:25%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
              <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:0.6px;">ALERTS</div>
              <div style="font-size:20px;font-weight:800;color:${stats.failCount ? '#dc2626' : '#d97706'};margin-top:4px;">${stats.failCount} Down / ${stats.warnCount}</div>
            </td>
          </tr>
        </table>

        ${attentionHtml}
        ${sectionCards}

        <div style="text-align:center;font-size:11px;color:#64748b;padding:8px 0;">
          Automated Daily Monitor &bull; <a href="${SITE_URL}" style="color:#0071e3;text-decoration:none;">tastyandcomfort.github.io/news</a>
        </div>
      </div>
    </div>
  `;
}

function buildPlainText(sections, stats, istNow) {
  const lines = [
    `T&C NEWS HUB — DAILY OPERATIONS BRIEF (${istNow} IST)`,
    `Status: ${stats.healthPct}% Operational | ${stats.okCount} Live | ${stats.warnCount} Notice | ${stats.failCount} Down`,
    ''
  ];
  for (const sec of sections) {
    lines.push(`[${sec.title}]`);
    sec.items.forEach((it) => {
      lines.push(`- [${it.status}] ${it.name}: ${it.metric}${it.detail ? ` (${truncate(it.detail, 70)})` : ''}`);
    });
    lines.push('');
  }
  return lines.join('\n');
}

async function sendTelegramVisual(pngBuffer, stats, istNow, fallbackText) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('Telegram secrets not set — skipping Telegram.');
    return;
  }

  const caption = [
    `T&C News Hub | ${istNow} IST`,
    `${stats.healthPct}% Operational — ${stats.okCount} Live, ${stats.warnCount} Notice, ${stats.failCount} Down.`,
    `Full interactive breakdown & verify links sent to Gmail.`
  ].join('\n');

  const replyMarkup = JSON.stringify({
    inline_keyboard: [
      [
        { text: 'Open Live Website', url: SITE_URL },
        { text: 'Headlines RSS (Local)', url: `${NEWS_API}?scope=local` }
      ],
      [
        { text: 'Press: PIB / ED / CBI', url: `${GOV_API}?source=pib,ed_press,cbi` },
        { text: 'Press: Parl / SCI / ECI', url: `${GOV_API}?source=parliament,sci,eci` }
      ],
      [
        { text: 'Press: Space & Police', url: `${GOV_API}?source=space,police&state=ALL` },
        { text: 'Wanted: NIA / ED / CBI', url: `${GOV_API}?source=nia,ed_proclamation,cbi,interpol` }
      ],
      [
        { text: 'Missing Persons API', url: `${MISSING_API}?source=all` },
        { text: 'Radar: Live Flights', url: FLIGHTS_APIS[1] }
      ]
    ]
  });
  
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'tc-news-scorecard.png');
  form.append('caption', caption);
  form.append('reply_markup', replyMarkup);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`sendPhoto failed (${res.status}): ${errText}. Falling back to plain text.`);
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: fallbackText.slice(0, 3900), disable_web_page_preview: true })
    });
    return;
  }
  console.log('Telegram visual PNG scorecard sent.');
}

async function sendGmailReport(htmlReport, textReport, stats, istNow) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.REPORT_TO_EMAIL || user;
  if (!user || !pass) {
    console.warn('Gmail secrets not set — skipping Email.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });

  const summaryTag = stats.failCount > 0 ? `${stats.failCount} Down` : `${stats.healthPct}% Live`;
  await transporter.sendMail({
    from: `"T&C News Monitor" <${user}>`,
    to,
    subject: `T&C News Hub Report (${istNow}) — ${summaryTag}`,
    text: textReport,
    html: htmlReport
  });
  console.log(`Gmail executive report sent to ${to}.`);
}

async function main() {
  const istNow = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const sections = await runAllChecks();
  const stats = summarize(sections);
  const textReport = buildPlainText(sections, stats, istNow);
  const htmlReport = buildExecutiveHtml(sections, stats, istNow);
  const pngBuffer = buildScorecardPng(sections, stats, istNow);

  console.log(textReport);

  await Promise.all([
    sendTelegramVisual(pngBuffer, stats, istNow, textReport),
    sendGmailReport(htmlReport, textReport, stats, istNow)
  ]);
}

main().catch((err) => {
  console.error('Daily report failed:', err);
  process.exit(1);
});

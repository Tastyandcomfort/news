// scripts/daily-report.mjs — Full All-Tabs Daily Website Monitor (Gmail HTML + Telegram Bot)
import nodemailer from 'nodemailer';

const SITE_URL = 'https://tastyandcomfort.github.io/news/';
const GOV_API = 'https://news-lemon-two.vercel.app/api/gov';
const NEWS_API = 'https://news-lemon-two.vercel.app/api/news';
const MISSING_API = 'https://news-lemon-two.vercel.app/api/missing';
const FLIGHTS_APIS = [
  'https://news-39tq.vercel.app/api/flights',
  'https://news-lemon-two.vercel.app/api/flights'
];

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, max = 95) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

async function fetchWithTimeout(url, timeoutMs = 18000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TC-News-Monitor/1.0',
        ...headers
      },
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

function row(name, status, detail) {
  // status: 'OK' | 'WARN' | 'FAIL'
  return { name, status, detail };
}

async function runAllChecks() {
  const sections = [];

  // Parallel fetches for speed
  const [
    siteRes,
    worldRss, localRss, natRss,
    bulletinsRes, forexRes, usgsRes, espnRes, solarRes,
    govMainRes, govRegionsRes, govMinListRes, govPmoRes, govParlRes, govSciRes, govEciRes, govSpaceRes, govPoliceRes, customPressRes,
    govWantedRes, wantedJsonRes, fbiLiveRes, missingRes,
    flights1Res, flights2Res, issPosRes, issCrewRes, jobsRes
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

    fetchJsonSafe(FLIGHTS_APIS[0], 14000),
    fetchJsonSafe(FLIGHTS_APIS[1], 14000),
    fetchJsonSafe('https://api.wheretheiss.at/v1/satellites/25544', 12000),
    fetchJsonSafe('https://api.open-notify.org/astros.json', 12000),
    fetchJsonSafe('https://firestore.googleapis.com/v1/projects/news-61e62/databases/(default)/documents/live_jobs?pageSize=50', 12000)
  ]);

  // --- TAB 1: HEADLINES & HOME ---
  const t1 = [];
  t1.push(siteRes.ok
    ? row('Live Website (GitHub Pages)', 'OK', `HTTP ${siteRes.status} (${siteRes.ms} ms)`)
    : row('Live Website (GitHub Pages)', 'FAIL', siteRes.error || `HTTP ${siteRes.status}`));

  for (const [label, r] of [['World Highlights RSS', worldRss], ['Telangana Headlines RSS', localRss], ['India Headlines RSS', natRss]]) {
    if (!r.ok) { t1.push(row(label, 'FAIL', r.error || `HTTP ${r.status}`)); continue; }
    const { count, firstTitle } = countRssItems(r.text);
    t1.push(count > 0
      ? row(label, 'OK', `${count} stories | Latest: "${truncate(firstTitle, 70)}"`)
      : row(label, 'FAIL', '0 RSS items returned'));
  }

  if (bulletinsRes.ok) {
    const arr = Array.isArray(bulletinsRes.data) ? bulletinsRes.data : (bulletinsRes.data?.bulletins || []);
    t1.push(arr.length > 0
      ? row('T&C Bulletins (bulletins.json)', 'OK', `${arr.length} published | Latest: "${truncate(arr[0]?.title, 65)}"`)
      : row('T&C Bulletins (bulletins.json)', 'WARN', '0 bulletins published'));
  } else {
    t1.push(row('T&C Bulletins (bulletins.json)', 'WARN', bulletinsRes.error));
  }

  t1.push(forexRes.ok && forexRes.data?.rates?.INR
    ? row('Live Forex (USD/INR)', 'OK', `₹${forexRes.data.rates.INR.toFixed(2)}`)
    : row('Live Forex (USD/INR)', 'FAIL', forexRes.error || 'No INR rate'));

  t1.push(usgsRes.ok && Array.isArray(usgsRes.data?.features)
    ? row('USGS Earthquakes (24h M4.5+)', 'OK', `${usgsRes.data.features.length} events`)
    : row('USGS Earthquakes (24h M4.5+)', 'FAIL', usgsRes.error || 'Feed error'));

  const espnEvents = espnRes.data?.scores?.length || espnRes.data?.events?.length || 0;
  t1.push(espnRes.ok
    ? row('Live Sports Ticker (ESPN)', 'OK', `${espnEvents} match feed(s) checked`)
    : row('Live Sports Ticker (ESPN)', 'FAIL', espnRes.error));

  t1.push(solarRes.ok && solarRes.data?.daily?.sunrise?.length
    ? row('Solar Sunrise/Sunset (Open-Meteo)', 'OK', 'Synced live')
    : row('Solar Sunrise/Sunset (Open-Meteo)', 'FAIL', solarRes.error || 'No daily data'));

  sections.push({ title: 'TAB 1: HEADLINES & HOME', items: t1 });

  // --- TAB 2: PRESS RELEASES ---
  const t2 = [];
  const gMain = govMainRes.data?.sources || {};
  const checkGovBucket = (label, srcObj, treatEmptyAsWarn = false) => {
    if (!srcObj) return row(label, 'FAIL', govMainRes.error || 'No response from /api/gov');
    if (srcObj.ok && srcObj.count > 0) {
      return row(label, 'OK', `${srcObj.count} items | Latest: "${truncate(srcObj.items?.[0]?.title, 65)}"`);
    }
    return row(label, treatEmptyAsWarn ? 'WARN' : 'FAIL', srcObj.error || '0 items returned');
  };

  t2.push(checkGovBucket('PIB All India (RSS)', gMain.pib));
  t2.push(govRegionsRes.ok && govRegionsRes.data?.regions?.length
    ? row('PIB Regions Dropdown', 'OK', `${govRegionsRes.data.regions.length} regions`)
    : row('PIB Regions Dropdown', 'FAIL', govRegionsRes.data?.error || govRegionsRes.error));

  t2.push(govMinListRes.ok && govMinListRes.data?.ministries?.length
    ? row('PIB Ministries Dropdown', 'OK', `${govMinListRes.data.ministries.length} ministries`)
    : row('PIB Ministries Dropdown', 'FAIL', govMinListRes.data?.error || govMinListRes.error));

  t2.push(checkGovBucket('Ministries Sample (PMO)', govPmoRes.data?.sources?.pib_ministry, true));

  const parl = govParlRes.data?.sources || {};
  t2.push(checkGovBucket('Parliament — Rajya Sabha', parl.rajya_sabha, true));
  t2.push(checkGovBucket('Parliament — Lok Sabha', parl.lok_sabha, true));
  t2.push(checkGovBucket('Supreme Court of India', govSciRes.data?.sources?.sci));
  t2.push(checkGovBucket('Election Commission (ECI)', govEciRes.data?.sources?.eci, true));
  t2.push(checkGovBucket('Enforcement Directorate (ED Press)', gMain.ed_press));
  t2.push(checkGovBucket('CBI Press Releases', gMain.cbi, true));

  const sp = govSpaceRes.data?.sources || {};
  t2.push(checkGovBucket('Space — ISRO', sp.isro));
  t2.push(checkGovBucket('Space — NASA', sp.nasa));
  t2.push(checkGovBucket('Space — SpaceX', sp.spacex));

  const pol = govPoliceRes.data?.sources?.police;
  if (pol && pol.items) {
    const dlCount = pol.items.filter(x => x.stateName === 'DELHI').length;
    const klCount = pol.items.filter(x => x.stateName === 'KERALA').length;
    const chdCount = pol.items.filter(x => x.stateName === 'CHANDIGARH').length;
    const status = (dlCount > 0 || klCount > 0) ? (pol.error ? 'WARN' : 'OK') : 'FAIL';
    t2.push(row('State Police (Delhi / Kerala / Chandigarh)', status,
      `Delhi: ${dlCount}, Kerala: ${klCount}, Chandigarh: ${chdCount}${pol.error ? ` | Note: ${truncate(pol.error, 60)}` : ''}`));
  } else {
    t2.push(row('State Police', 'FAIL', govPoliceRes.error || 'No response'));
  }

  if (customPressRes.ok) {
    const cArr = Array.isArray(customPressRes.data) ? customPressRes.data : (customPressRes.data?.items || []);
    t2.push(row('Listed by T&C (press-releases.json)', 'OK', `${cArr.length} custom entries`));
  } else {
    t2.push(row('Listed by T&C (press-releases.json)', 'WARN', customPressRes.error));
  }

  sections.push({ title: 'TAB 2: PRESS RELEASES', items: t2 });

  // --- TAB 3: MOST WANTED & MISSING ---
  const t3 = [];
  const gw = govWantedRes.data?.sources || {};

  t3.push(gw.nia?.ok
    ? row('NIA India Most Wanted', 'OK', `${gw.nia.count} records | Top: "${truncate(gw.nia.items?.[0]?.name, 50)}"`)
    : row('NIA India Most Wanted', 'FAIL', gw.nia?.error || govWantedRes.error || '0 records'));

  t3.push(gw.ed_proclamation?.ok
    ? row('ED Proclamations', 'OK', `${gw.ed_proclamation.count} records`)
    : row('ED Proclamations', 'FAIL', gw.ed_proclamation?.error || govWantedRes.error || '0 records'));

  t3.push(gw.cbi?.redNoticeCount > 0
    ? row('CBI / INTERPOL India Red Notices', 'OK', `${gw.cbi.redNoticeCount} records`)
    : row('CBI / INTERPOL India Red Notices', 'FAIL', gw.cbi?.error || '0 records'));

  t3.push(gw.interpol?.ok
    ? row('INTERPOL Global Red Notices (Server)', 'OK', `${gw.interpol.count} records`)
    : row('INTERPOL Global Red Notices (Server)', 'WARN', `${gw.interpol?.error || 'Restricted'} (browser-direct fallback active on user device)`));

  t3.push(fbiLiveRes.ok && fbiLiveRes.data?.items?.length
    ? row('FBI Most Wanted (Live API)', 'OK', `${fbiLiveRes.data.items.length} records (page 1)`)
    : row('FBI Most Wanted (Live API)', 'FAIL', fbiLiveRes.error || '0 records'));

  if (wantedJsonRes.ok && wantedJsonRes.data) {
    const wSrc = (wantedJsonRes.data.sources || []).join(', ') || 'None';
    t3.push(row('Snapshot File (wanted-data.json)', 'OK', `${wantedJsonRes.data.total || 0} items [${wSrc}] (${wantedJsonRes.data.updatedAt || 'no date'})`));
  } else {
    t3.push(row('Snapshot File (wanted-data.json)', 'WARN', wantedJsonRes.error));
  }

  const ms = missingRes.data?.sources || {};
  t3.push(ms.fbi_missing?.ok
    ? row('Missing — FBI Missing', 'OK', `${ms.fbi_missing.count} records`)
    : row('Missing — FBI Missing', 'FAIL', ms.fbi_missing?.error || missingRes.error));
  t3.push(ms.zipnet?.ok
    ? row('Missing — ZIPNET India', 'OK', `${ms.zipnet.count} records`)
    : row('Missing — ZIPNET India', 'WARN', ms.zipnet?.error || 'Interactive session required'));
  t3.push(ms.interpol_yellow?.ok
    ? row('Missing — INTERPOL Yellow', 'OK', `${ms.interpol_yellow.count} records`)
    : row('Missing — INTERPOL Yellow', 'WARN', ms.interpol_yellow?.error || 'Restricted from server'));

  sections.push({ title: 'TAB 3: MOST WANTED & MISSING', items: t3 });

  // --- TAB 4, 5, 6: TV, RADAR, JOBS ---
  const t456 = [];
  const tcAddonsCheck = await fetchWithTimeout(`${SITE_URL}tc-addons.js?t=${Date.now()}`, 12000);
  const tcHasExportErr = /\bexport\s+default\b/.test(tcAddonsCheck.text);
  t456.push(tcAddonsCheck.ok && !tcHasExportErr
    ? row('Tab 4 & Core JS (tc-addons.js + TV Embeds)', 'OK', `Loaded cleanly (${Math.round(tcAddonsCheck.text.length / 1024)} KB)`)
    : row('Tab 4 & Core JS (tc-addons.js)', 'FAIL', tcHasExportErr ? 'Syntax issue: export keyword found!' : (tcAddonsCheck.error || `HTTP ${tcAddonsCheck.status}`)));

  const fl1Count = Array.isArray(flights1Res.data?.states) ? flights1Res.data.states.length : 0;
  const fl2Count = Array.isArray(flights2Res.data?.states) ? flights2Res.data.states.length : 0;
  t456.push((fl1Count > 0 || fl2Count > 0)
    ? row('Tab 5: Radar — Live Flights', 'OK', `news-39tq: ${fl1Count} states | news-lemon-two: ${fl2Count} states`)
    : row('Tab 5: Radar — Live Flights', 'FAIL', `news-39tq (${flights1Res.error || '0'}) • news-lemon-two (${flights2Res.error || '0'})`));

  t456.push(issPosRes.ok && issPosRes.data?.altitude
    ? row('Tab 5: Radar — ISS Live Position', 'OK', `Alt ${Math.round(issPosRes.data.altitude)} km, Spd ${Math.round(issPosRes.data.velocity)} km/h`)
    : row('Tab 5: Radar — ISS Live Position', 'FAIL', issPosRes.error));

  const issPeople = Array.isArray(issCrewRes.data?.people) ? issCrewRes.data.people.filter(p => p.craft === 'ISS').length : 0;
  t456.push(issCrewRes.ok
    ? row('Tab 5: Radar — ISS Crew Manifest', 'OK', `${issPeople} ISS crew active`)
    : row('Tab 5: Radar — ISS Crew Manifest', 'WARN', issCrewRes.error || 'Timed out'));

  if (jobsRes.ok) {
    const activeJobs = (jobsRes.data?.documents || []).filter(d => d?.fields?.status?.stringValue === 'active').length;
    t456.push(activeJobs > 0
      ? row('Tab 6: Find Jobs (Firestore live_jobs)', 'OK', `${activeJobs} active job(s) in Firestore`)
      : row('Tab 6: Find Jobs (Firestore live_jobs)', 'WARN', '0 active jobs in Firestore (showing built-in sample jobs)'));
  } else {
    t456.push(row('Tab 6: Find Jobs (Firestore live_jobs)', 'WARN', `Firestore REST: ${jobsRes.error}`));
  }

  sections.push({ title: 'TABS 4, 5 & 6: TV, RADAR & JOBS', items: t456 });
  return sections;
}

function buildReports(sections) {
  const istNow = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  let okCount = 0, warnCount = 0, failCount = 0;
  for (const sec of sections) {
    for (const it of sec.items) {
      if (it.status === 'OK') okCount++;
      else if (it.status === 'WARN') warnCount++;
      else failCount++;
    }
  }

  const icon = (s) => (s === 'OK' ? '✅' : s === 'WARN' ? '⚠️' : '❌');

  // Plain-text report for Telegram
  const lines = [
    `📰 T&C NEWS HUB — DAILY STATUS REPORT`,
    `🕒 ${istNow} IST`,
    `📊 Summary: ✅ ${okCount} OK | ⚠️ ${warnCount} Notice | ❌ ${failCount} Down`,
    ``
  ];

  for (const sec of sections) {
    lines.push(`━━ ${sec.title} ━━`);
    sec.items.forEach((it, idx) => {
      lines.push(`${idx + 1}. ${icon(it.status)} ${it.name}: ${it.detail}`);
    });
    lines.push('');
  }

  const textReport = lines.join('\n');

  // Clean HTML report for Gmail
  const badgeStyle = (s) =>
    s === 'OK'
      ? 'background:#dcfce7;color:#166534;border:1px solid #86efac;'
      : s === 'WARN'
        ? 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d;'
        : 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;';

  const sectionHtml = sections.map((sec) => `
    <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#f8fafc;padding:10px 14px;font-weight:800;font-size:13px;color:#0f172a;border-bottom:1px solid #e5e7eb;">
        ${escHtml(sec.title)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${sec.items.map((it, idx) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px;width:28px;color:#64748b;">${idx + 1}.</td>
            <td style="padding:8px 12px;font-weight:600;color:#1e293b;">${escHtml(it.name)}</td>
            <td style="padding:8px 12px;width:72px;">
              <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;${badgeStyle(it.status)}">${it.status}</span>
            </td>
            <td style="padding:8px 12px;color:#475569;">${escHtml(it.detail)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('');

  const htmlReport = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#0f172a;">
      <div style="background:#0071e3;color:#ffffff;padding:16px 20px;border-radius:14px;margin-bottom:18px;">
        <h2 style="margin:0;font-size:18px;">T&amp;C News Hub — Daily All-Tabs Report</h2>
        <p style="margin:6px 0 0;font-size:13px;opacity:0.92;">${escHtml(istNow)} IST • ✅ ${okCount} OK &nbsp;|&nbsp; ⚠️ ${warnCount} Notice &nbsp;|&nbsp; ❌ ${failCount} Down</p>
      </div>
      ${sectionHtml}
      <p style="font-size:11px;color:#64748b;text-align:center;">Automated check from Tastyandcomfort/news • <a href="${SITE_URL}">${SITE_URL}</a></p>
    </div>
  `;

  return { okCount, warnCount, failCount, textReport, htmlReport, istNow };
}

async function sendTelegramChunks(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('Telegram secrets not set — skipping Telegram.');
    return;
  }

  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > 3800) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Telegram API failed (${res.status}): ${errBody}`);
    }
  }
  console.log(`Telegram report sent (${chunks.length} message(s)).`);
}

async function sendGmailReport({ okCount, warnCount, failCount, textReport, htmlReport, istNow }) {
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

  const statusTag = failCount > 0 ? `❌ ${failCount} Down` : '✅ All Core OK';
  await transporter.sendMail({
    from: `"T&C News Monitor" <${user}>`,
    to,
    subject: `T&C News Daily Report (${istNow}) — ${statusTag} | ⚠️ ${warnCount}`,
    text: textReport,
    html: htmlReport
  });
  console.log(`Gmail report sent to ${to}.`);
}

async function main() {
  const sections = await runAllChecks();
  const report = buildReports(sections);
  console.log(report.textReport);

  await Promise.all([
    sendTelegramChunks(report.textReport),
    sendGmailReport(report)
  ]);
}

main().catch((err) => {
  console.error('Daily report failed:', err);
  process.exit(1);
});

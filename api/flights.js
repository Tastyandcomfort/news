// api/flights.js — Real-time Live Flights (adsb.lol + adsb.fi + OpenSky India fallback)
const HEADERS = {
  'User-Agent': 'TAndCNewsHub-Radar/1.0 (https://tastyandcomfort.github.io/news/)',
  'Accept': 'application/json'
};

async function fetchJsonWithTimeout(url, ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function mapAdsbToStates(acList) {
  const states = [];
  for (const a of acList || []) {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
    const onGround = a.alt_baro === 'ground' || a.alt_baro === 0;
    if (onGround) continue;
    const altMeters = typeof a.alt_baro === 'number' ? Math.round(a.alt_baro * 0.3048) : (typeof a.alt_geom === 'number' ? Math.round(a.alt_geom * 0.3048) : 0);
    const speedMs = typeof a.gs === 'number' ? +(a.gs * 0.514444).toFixed(1) : 0;
    const callsign = String(a.flight || a.r || a.hex || 'FLIGHT').trim();
    const trackDeg = typeof a.track === 'number' ? a.track : 0;
    states.push([a.hex || '', callsign, a.ownOp || 'Live ADS-B', null, null, a.lon, a.lat, altMeters, false, speedMs, trackDeg]);
  }
  return states;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  // 1. Try adsb.lol (500 NM radius centered over India)
  try {
    const data = await fetchJsonWithTimeout('https://api.adsb.lol/v2/point/20.5937/78.9629/500');
    const states = mapAdsbToStates(data?.ac);
    if (states.length > 0) return res.status(200).json({ time: Math.floor(Date.now() / 1000), source: 'adsb.lol', states });
  } catch {}

  // 2. Try adsb.fi (250 NM radius centered over India)
  try {
    const data = await fetchJsonWithTimeout('https://opendata.adsb.fi/api/v2/lat/20.5937/lon/78.9629/dist/250');
    const states = mapAdsbToStates(data?.ac || data?.aircraft);
    if (states.length > 0) return res.status(200).json({ time: Math.floor(Date.now() / 1000), source: 'adsb.fi', states });
  } catch {}

  // 3. Try OpenSky Network (India bounding box)
  try {
    const data = await fetchJsonWithTimeout('https://opensky-network.org/api/states/all?lamin=6&lomin=67&lamax=37&lomax=98');
    if (Array.isArray(data?.states) && data.states.length > 0) return res.status(200).json({ time: data.time, source: 'opensky', states: data.states });
  } catch {}

  return res.status(200).json({ time: Math.floor(Date.now() / 1000), source: 'unavailable', states: [] });
}

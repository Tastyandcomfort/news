// api/intel.js - Direct Relay to World Monitor API
export default async function handler(req, res) {
  // Allow GitHub Pages to fetch freely without CORS blocks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Forward the request directly to World Monitor's public API endpoint
    const response = await fetch('https://www.worldmonitor.app/api/bootstrap', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `World Monitor HTTP ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to stream live World Monitor telemetry' });
  }
}

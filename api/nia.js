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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const niaPages = [
    'https://nia.mha.gov.in/wanted.htm',
    'https://nia.mha.gov.in/wanted.htm?page=1'
  ];

  const seenNames = new Set();
  const items = [];
  const debugStatuses = [];

  for (const pageUrl of niaPages) {
    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Referer': 'https://nia.mha.gov.in/'
        }
      });

      debugStatuses.push({ url: pageUrl, status: response.status });
      if (!response.ok) continue;

      const html = await response.text();
      const baseOrigin = 'https://nia.mha.gov.in';
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

        items.push({
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
      debugStatuses.push({ url: pageUrl, error: err.message });
    }
  }

  return res.status(200).json({
    ok: items.length > 0,
    count: items.length,
    debugStatuses,
    items: items.slice(0, 40)
  });
}

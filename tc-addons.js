/* T&C News Hub — Bulletins, Official Govt (PIB A-Z, ED, CBI), Missing Persons (All India & Global), Apple Reader & Flash Fix */
(function () {
  const GOV_API_BASE = 'https://news-lemon-two.vercel.app';
  window.tcNewsRegistry = window.tcNewsRegistry || {};

  let currentReaderStory = null;
  let bulletinsDataset = [];
  let currentBulletin = null;
  let isBulletinArchiveView = false;

  let currentGovAgency = 'all';
  let currentPibRegid = '3';
  let pibRegionsList = [
    { regid: '3', name: 'All India (National HQ — All Ministries A–Z)' },
    { regid: '1', name: 'PIB Delhi' }, { regid: '2', name: 'PIB Mumbai' }, { regid: '5', name: 'PIB Hyderabad' },
    { regid: '6', name: 'PIB Chennai' }, { regid: '7', name: 'PIB Chandigarh' }, { regid: '8', name: 'PIB Kolkata' },
    { regid: '12', name: 'PIB Guwahati' }, { regid: '14', name: 'PIB Bhubaneswar' }, { regid: '20', name: 'PIB Bengaluru' },
    { regid: '22', name: 'PIB Ahmedabad' }, { regid: '24', name: 'PIB Thiruvananthapuram' }
  ];
  let liveGovCache = { pib: null, ed_press: null, cbi: null };

  let liveEdProclamations = [];
  let liveEdStatus = { ok: false, error: '' };
  let liveCbiData = { ok: false, directAccessible: false, items: [], redNotices: [], error: '' };
  let missingDataset = [];
  let missingSourcesMeta = {};

  const INDIA_OFFICIAL_MISSING_PORTALS = [
    { state: 'National — TrackChild (Missing Children, All States)', url: 'https://trackthemissingchild.gov.in/trackchild/index.php' },
    { state: 'National — Khoya-Paya (Citizen Missing Children Portal)', url: 'https://khoyapaya.gov.in/mpp/home' },
    { state: 'National — Digital Police (CCTNS Citizen Services)', url: 'https://digitalpolice.gov.in/' },
    { state: 'National — ZIPNET (8 North/Central States Live)', url: 'https://zipnet.delhipolice.gov.in/victims/missingpersons/' },
    { state: 'Andaman & Nicobar Islands Police', url: 'https://police.andaman.gov.in/' },
    { state: 'Andhra Pradesh Police (Citizen Portal)', url: 'https://citizen.appolice.gov.in/' },
    { state: 'Arunachal Pradesh Police', url: 'https://arunpol.nic.in/' },
    { state: 'Assam Police (Citizen Portal)', url: 'https://assampolice.gov.in/' },
    { state: 'Bihar Police', url: 'https://police.bihar.gov.in/' },
    { state: 'Chandigarh Police', url: 'https://chandigarhpolice.gov.in/' },
    { state: 'Chhattisgarh Police (Citizen Portal)', url: 'https://cgpolice.gov.in/' },
    { state: 'Dadra & Nagar Haveli and Daman & Diu Police', url: 'https://dnhddpolice.gov.in/' },
    { state: 'Delhi Police', url: 'https://delhipolice.gov.in/' },
    { state: 'Goa Police', url: 'https://citizen.goapolice.gov.in/' },
    { state: 'Gujarat Police (Citizen Portal)', url: 'https://gujhome.gujarat.gov.in/portal/' },
    { state: 'Haryana Police', url: 'https://haryanapolice.gov.in/' },
    { state: 'Himachal Pradesh Police', url: 'https://citizenportal.hppolice.gov.in/' },
    { state: 'Jammu & Kashmir Police', url: 'https://jkpolice.gov.in/' },
    { state: 'Jharkhand Police', url: 'https://jhpolice.gov.in/' },
    { state: 'Karnataka State Police (KSP)', url: 'https://ksp.karnataka.gov.in/' },
    { state: 'Kerala Police (Thuna)', url: 'https://thuna.keralapolice.gov.in/' },
    { state: 'Ladakh Police', url: 'https://police.ladakh.gov.in/' },
    { state: 'Lakshadweep Police', url: 'https://lakshadweeppolice.gov.in/' },
    { state: 'Madhya Pradesh Police', url: 'https://citizen.mppolice.gov.in/' },
    { state: 'Maharashtra Police', url: 'https://citizen.mahapolice.gov.in/' },
    { state: 'Manipur Police', url: 'https://manipurpolice.gov.in/' },
    { state: 'Meghalaya Police', url: 'https://megpolice.gov.in/' },
    { state: 'Mizoram Police', url: 'https://police.mizoram.gov.in/' },
    { state: 'Nagaland Police', url: 'https://police.nagaland.gov.in/' },
    { state: 'Odisha Police', url: 'https://citizenportal-op.gov.in/' },
    { state: 'Puducherry Police', url: 'https://police.py.gov.in/' },
    { state: 'Punjab Police', url: 'https://punjabpolice.gov.in/' },
    { state: 'Rajasthan Police', url: 'https://police.rajasthan.gov.in/' },
    { state: 'Sikkim Police', url: 'https://police.sikkim.gov.in/' },
    { state: 'Tamil Nadu Police', url: 'https://eservices.tnpolice.gov.in/' },
    { state: 'Telangana Police', url: 'https://www.tspolice.gov.in/' },
    { state: 'Tripura Police', url: 'https://tripurapolice.gov.in/' },
    { state: 'Uttar Pradesh Police', url: 'https://uppolice.gov.in/' },
    { state: 'Uttarakhand Police', url: 'https://uttarakhandpolice.uk.gov.in/' },
    { state: 'West Bengal Police', url: 'https://wbpolice.gov.in/' }
  ];

  const addonStyle = document.createElement('style');
  addonStyle.textContent = `
    .flash-ticker-viewport:hover .flash-ticker-track { animation-play-state: running !important; }
    @media (hover: hover) and (pointer: fine) {
      .flash-ticker-viewport:hover .flash-ticker-track { animation-play-state: paused !important; }
    }
    .flash-ticker-track.ticker-paused { animation-play-state: paused !important; }
  `;
  document.head.appendChild(addonStyle);

  function injectAddonUI() {
    if (!document.getElementById('news-reader-modal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="news-reader-modal" class="hidden fixed inset-0 z-[124] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md transition-all overflow-y-auto">
          <div class="apple-card max-w-xl w-full p-5 sm:p-6 shadow-2xl relative border border-blue-500/25 my-auto">
            <div class="flex items-center justify-between pb-3 border-b mb-4" style="border-color: var(--border-color);">
              <div class="flex items-center gap-2 flex-wrap">
                <span id="reader-modal-scope" class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/15 text-blue-500 border border-blue-500/30">NEWS</span>
                <span id="reader-modal-source" class="text-xs font-bold" style="color: var(--text-main);">T&amp;C News Hub</span>
              </div>
              <button onclick="closeNewsReader()" class="w-7 h-7 rounded-full flex items-center justify-center text-xs" style="background-color: var(--bg-sub); color: var(--text-sub);"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="space-y-3.5 max-h-[65vh] overflow-y-auto pr-1">
              <img id="reader-modal-img" src="" alt="" referrerpolicy="no-referrer" class="hidden w-full max-h-56 object-cover rounded-2xl border" style="border-color: var(--border-color);" onerror="this.classList.add('hidden')">
              <h3 id="reader-modal-title" class="text-base sm:text-lg font-extrabold leading-snug" style="color: var(--text-main);">Headline</h3>
              <p id="reader-modal-time" class="text-[11px] flex items-center gap-1.5" style="color: var(--text-sub);"><i class="fa-regular fa-clock text-blue-500"></i> <span>Live Feed</span></p>
              <div class="p-3.5 rounded-2xl border text-xs sm:text-[13px] leading-relaxed" style="background-color: var(--bg-sub); border-color: var(--border-color); color: var(--text-main);">
                <p id="reader-modal-summary">Loading story brief...</p>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5" style="border-color: var(--border-color);">
              <button onclick="shareCurrentReaderStory()" id="reader-share-btn" class="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border" style="background-color: var(--bg-sub); color: var(--text-main); border-color: var(--border-color);">
                <i class="fa-solid fa-share-nodes text-blue-500"></i> <span>Share via T&amp;C News</span>
              </button>
              <a id="reader-modal-origin-link" href="#" target="_blank" rel="noopener" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2">
                <span>Open Original Source</span> <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </a>
            </div>
          </div>
        </div>
      `);
    }

    if (!document.getElementById('bulletin-modal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="bulletin-modal" class="hidden fixed inset-0 z-[126] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md transition-all overflow-y-auto">
          <div class="apple-card max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative border border-amber-500/30 my-auto">
            <div class="flex items-center justify-between pb-3 border-b mb-4" style="border-color: var(--border-color);">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-sm font-bold"><i class="fa-solid fa-file-shield"></i></div>
                <div>
                  <h3 id="bulletin-modal-header" class="text-sm font-extrabold tracking-wide" style="color: var(--text-main);">T&amp;C NEWS | BULLETIN</h3>
                  <p id="bulletin-modal-date" class="text-[10px] font-bold text-amber-500"></p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="toggleBulletinArchiveView()" id="bulletin-archive-toggle-btn" class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold border" style="background-color: var(--bg-sub); color: var(--text-main); border-color: var(--border-color);">All Bulletins</button>
                <button onclick="closeBulletinModal()" class="w-7 h-7 rounded-full flex items-center justify-center text-xs" style="background-color: var(--bg-sub); color: var(--text-sub);"><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>
            <div id="bulletin-modal-body" class="space-y-3 text-xs max-h-[66vh] overflow-y-auto pr-1"></div>
            <div id="bulletin-modal-footer" class="mt-4 pt-3 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5" style="border-color: var(--border-color);">
              <button onclick="shareCurrentBulletin()" id="bulletin-share-btn" class="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border" style="background-color: var(--bg-sub); color: var(--text-main); border-color: var(--border-color);">
                <i class="fa-solid fa-share-nodes text-amber-500"></i> <span>Share T&amp;C Bulletin</span>
              </button>
              <a id="bulletin-pdf-link" href="#" target="_blank" rel="noopener" class="hidden px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md transition-all items-center justify-center gap-2">
                <i class="fa-solid fa-file-pdf"></i> <span>Open Bulletin PDF</span>
              </a>
            </div>
          </div>
        </div>
      `);
    }

    const newsView = document.getElementById('view-news');
    if (newsView && !document.getElementById('bulletin-home-section')) {
      const firstCard = newsView.firstElementChild;
      if (firstCard) {
        firstCard.insertAdjacentHTML('afterend', `
          <div id="bulletin-home-section" class="apple-card p-4 border border-amber-500/25">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 mb-3" style="border-color: var(--border-color);">
              <div class="flex items-center gap-2 flex-wrap">
                <i class="fa-solid fa-file-shield text-amber-500 text-sm"></i>
                <h2 class="text-xs font-extrabold uppercase tracking-wider text-amber-500">T&amp;C News | Official Bulletins</h2>
                <span id="bulletin-count-pill" class="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/25 px-2 py-0.5 rounded-full font-bold">Latest</span>
              </div>
              <button onclick="openBulletinArchive()" class="self-start sm:self-auto px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-sm transition-all flex items-center gap-1.5">
                <span>All Bulletins</span> <i class="fa-solid fa-arrow-right text-[9px]"></i>
              </button>
            </div>
            <div id="bulletin-home-card">
              <div class="text-xs italic py-2" style="color: var(--text-sub);">Loading T&amp;C News Bulletins...</div>
            </div>
          </div>
        `);
      }
    }

    const feedContainer = document.getElementById('news-feed-container');
    if (feedContainer && !document.getElementById('gov-controls-bar')) {
      feedContainer.insertAdjacentHTML('beforebegin', `
        <div id="gov-controls-bar" class="hidden mb-4 p-3 rounded-2xl border space-y-2.5" style="background-color: var(--bg-sub); border-color: var(--border-color);">
          <div class="flex items-center gap-1.5 overflow-x-auto desktop-scrollbar pb-1">
            <button type="button" onclick="setGovAgencyFilter('all', this)" class="choice-pill selected">All Govt Releases</button>
            <button type="button" onclick="setGovAgencyFilter('pib', this)" class="choice-pill">🇮🇳 PIB India (A–Z)</button>
            <button type="button" onclick="setGovAgencyFilter('ed_press', this)" class="choice-pill">⚖️ ED Press Releases</button>
            <button type="button" onclick="setGovAgencyFilter('cbi', this)" class="choice-pill">🕵️ CBI Official</button>
          </div>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select id="pib-region-select" onchange="onPibRegionChange(this.value)" class="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer flex-1" style="background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);"></select>
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl flex-1" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
              <i class="fa-solid fa-magnifying-glass text-xs" style="color: var(--text-sub);"></i>
              <input type="text" id="gov-search-input" oninput="renderGovFeedFromCache()" placeholder="Filter PIB ministries, ED zones, CBI..." class="bg-transparent text-xs focus:outline-none w-full" style="color: var(--text-main);">
            </div>
          </div>
          <div id="gov-status-banner" class="hidden text-[10.5px] leading-relaxed" style="color: var(--text-sub);"></div>
        </div>
      `);
      populatePibRegionDropdown();
    }

    const wantedDir = document.getElementById('wanted-directory-container');
    if (wantedDir && !document.getElementById('missing-controls-bar')) {
      wantedDir.insertAdjacentHTML('beforebegin', `
        <div id="missing-controls-bar" class="hidden mb-4 p-3.5 rounded-2xl border border-blue-500/25 space-y-3" style="background-color: var(--bg-sub);">
          <div>
            <h4 class="text-xs font-extrabold text-blue-500 flex items-center gap-1.5"><i class="fa-solid fa-landmark"></i> Search Indian Missing Persons on Official Govt Portals (All 36 States &amp; UTs A–Z)</h4>
            <p class="text-[10.5px] mt-0.5" style="color: var(--text-sub);">Indian state police &amp; TrackChild missing-person searches open on official .gov.in portals. Pick any state below and tap <b>Open</b>:</p>
          </div>
          <div class="flex items-center gap-2">
            <select id="india-state-portal-select" class="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer" style="background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
              ${INDIA_OFFICIAL_MISSING_PORTALS.map((p, idx) => `<option value="${idx}">${escapeHtml(p.state)}</option>`).join('')}
            </select>
            <button type="button" onclick="openSelectedStatePortal()" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold whitespace-nowrap shadow-sm">Open ↗</button>
          </div>
          <div id="missing-source-status" class="text-[10.5px] pt-1 border-t leading-relaxed" style="border-color: var(--border-color); color: var(--text-sub);"></div>
        </div>
      `);
    }
  }

  function populatePibRegionDropdown() {
    const sel = document.getElementById('pib-region-select');
    if (!sel) return;
    sel.innerHTML = pibRegionsList.map(r => `<option value="${escapeHtml(r.regid)}" ${r.regid === currentPibRegid ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  }

  async function loadPibRegionsFromServer() {
    try {
      const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib_regions`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.regions) && data.regions.length > 0) {
        pibRegionsList = data.regions;
        populatePibRegionDropdown();
      }
    } catch {}
  }

  window.openSelectedStatePortal = function () {
    const sel = document.getElementById('india-state-portal-select');
    const idx = Number(sel?.value || 0);
    const entry = INDIA_OFFICIAL_MISSING_PORTALS[idx];
    if (entry?.url) window.open(entry.url, '_blank', 'noopener');
  };

  window.setGovAgencyFilter = function (agency, btnEl) {
    currentGovAgency = agency;
    document.querySelectorAll('#gov-controls-bar .choice-pill').forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');
    const regSel = document.getElementById('pib-region-select');
    if (regSel) regSel.classList.toggle('hidden', agency === 'ed_press' || agency === 'cbi');
    renderGovFeedFromCache();
  };

  window.onPibRegionChange = function (regid) {
    currentPibRegid = regid || '3';
    if (typeof currentScope !== 'undefined' && currentScope === 'gov') {
      window.fetchPortalNews();
    }
  };

  // Auto-translate non-English PIB text when user's app is set to English
  async function smartTranslate(text, targetLang) {
    if (!text) return '';
    if (targetLang === 'en') {
      if (!/[\u0900-\u0D7F]/.test(text)) return text;
      const key = `auto-en:${text}`;
      if (typeof translationCache !== 'undefined' && translationCache[key]) return translationCache[key];
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        if (data && data[0]) {
          const out = data[0].map(s => s[0]).join('');
          if (typeof translationCache !== 'undefined') translationCache[key] = out;
          return out;
        }
      } catch {}
      return text;
    }
    return typeof translateText === 'function' ? await translateText(text, targetLang) : text;
  }

  function resolveBulletinPdfUrl(raw) {
    if (!raw) return '';
    const val = String(raw).trim();
    if (/^https?:\/\//i.test(val)) return val;
    if (val.includes('/')) {
      const parts = val.split('/');
      const file = parts.pop();
      return `${parts.join('/')}/${encodeURIComponent(file)}`;
    }
    return `./Bulletin-files/${encodeURIComponent(val)}`;
  }

  // 2. Bulletins Engine
  window.fetchBulletins = async function () {
    try {
      const res = await fetch(`./bulletins.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        bulletinsDataset = Array.isArray(data) ? data : (Array.isArray(data?.bulletins) ? data.bulletins : []);
      }
    } catch {}
    renderBulletinHomeCard();
  };

  function renderBulletinHomeCard() {
    const box = document.getElementById('bulletin-home-card');
    const pill = document.getElementById('bulletin-count-pill');
    if (!box) return;
    if (!bulletinsDataset.length) {
      if (pill) pill.textContent = '0 Published';
      box.innerHTML = `<div class="text-xs py-2" style="color: var(--text-sub);">No bulletins published yet.</div>`;
      return;
    }
    const latest = bulletinsDataset[0];
    if (pill) pill.textContent = `${bulletinsDataset.length} Published`;
    const previewText = latest.paragraphs?.[0] || latest.closingNote || '';

    box.innerHTML = `
      <div class="p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-amber-500/40" style="background-color: var(--bg-sub); border-color: var(--border-color);">
        <div class="min-w-0 flex-grow cursor-pointer" onclick="openBulletinById('${escapeHtml(latest.id)}')">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="px-2 py-0.5 rounded bg-amber-500 text-white text-[9.5px] font-black">${escapeHtml(latest.dateBadge || latest.dateText || 'BULLETIN')}</span>
            <span class="text-[10px] font-extrabold text-amber-500 uppercase">${escapeHtml(latest.city || '')}${latest.category ? ' • ' + escapeHtml(latest.category) : ''}</span>
          </div>
          <h4 class="text-xs sm:text-sm font-extrabold leading-snug" style="color: var(--text-main);">${escapeHtml(latest.title)}</h4>
          <p class="text-[11px] mt-1 line-clamp-2" style="color: var(--text-sub);">${escapeHtml(previewText)}</p>
        </div>
        <button type="button" onclick="openBulletinById('${escapeHtml(latest.id)}')" class="self-end sm:self-center px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-sm transition-all whitespace-nowrap flex-shrink-0">Read Bulletin</button>
      </div>
    `;
  }

  window.openBulletinById = function (id) {
    if (!bulletinsDataset.length) return;
    currentBulletin = bulletinsDataset.find((b) => b.id === id) || bulletinsDataset[0];
    isBulletinArchiveView = false;
    renderBulletinModalContent();
    document.getElementById('bulletin-modal').classList.remove('hidden');
  };

  window.openBulletinArchive = function () {
    if (!currentBulletin && bulletinsDataset.length) currentBulletin = bulletinsDataset[0];
    isBulletinArchiveView = true;
    renderBulletinModalContent();
    document.getElementById('bulletin-modal').classList.remove('hidden');
  };

  window.toggleBulletinArchiveView = function () {
    isBulletinArchiveView = !isBulletinArchiveView;
    renderBulletinModalContent();
  };

  function renderBulletinModalContent() {
    const body = document.getElementById('bulletin-modal-body');
    const header = document.getElementById('bulletin-modal-header');
    const dateEl = document.getElementById('bulletin-modal-date');
    const toggleBtn = document.getElementById('bulletin-archive-toggle-btn');
    const footer = document.getElementById('bulletin-modal-footer');
    const pdfLink = document.getElementById('bulletin-pdf-link');

    if (isBulletinArchiveView) {
      header.textContent = 'T&C NEWS | BULLETIN ARCHIVE';
      dateEl.textContent = `${bulletinsDataset.length} Publications`;
      toggleBtn.textContent = bulletinsDataset.length ? 'Back to Reader' : 'Close';
      footer.classList.add('hidden');
      body.innerHTML = bulletinsDataset.length ? bulletinsDataset.map((b) => `
        <div onclick="openBulletinById('${escapeHtml(b.id)}')" class="p-3.5 rounded-2xl border cursor-pointer transition-all hover:border-amber-500/40 space-y-1" style="background-color: var(--bg-sub); border-color: var(--border-color);">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded bg-amber-500 text-white text-[9.5px] font-black">${escapeHtml(b.dateBadge || b.dateText)}</span>
            <span class="text-[10px] font-bold text-amber-500">${escapeHtml(b.city || '')} • ${escapeHtml(b.category || '')}</span>
          </div>
          <h4 class="text-xs sm:text-sm font-extrabold" style="color: var(--text-main);">${escapeHtml(b.title)}</h4>
          <p class="text-[11px] line-clamp-2" style="color: var(--text-sub);">${escapeHtml(b.paragraphs?.[0] || '')}</p>
        </div>
      `).join('') : '<p class="text-center py-6">No bulletins published yet.</p>';
      return;
    }

    const b = currentBulletin || bulletinsDataset[0];
    if (!b) return;
    header.textContent = 'T&C NEWS | BULLETIN';
    dateEl.textContent = `${b.dateBadge || b.dateText}${b.city ? ' • ' + b.city : ''}`;
    toggleBtn.textContent = 'All Bulletins';
    footer.classList.remove('hidden');

    const resolvedPdf = resolveBulletinPdfUrl(b.pdfUrl);
    if (resolvedPdf) {
      pdfLink.href = resolvedPdf;
      pdfLink.classList.remove('hidden'); pdfLink.classList.add('inline-flex');
    } else {
      pdfLink.classList.add('hidden'); pdfLink.classList.remove('inline-flex');
    }

    body.innerHTML = `
      <div class="p-4 rounded-2xl border space-y-1.5 text-center" style="background-color: var(--bg-sub); border-color: var(--border-color);">
        <p class="text-[10px] font-bold tracking-widest uppercase text-amber-500">${escapeHtml(b.city || '')}${b.category ? ' • ' + escapeHtml(b.category) : ''}</p>
        <h4 class="text-sm sm:text-base font-extrabold" style="color: var(--text-main);">${escapeHtml(b.title)}</h4>
        <p class="text-[11px] font-semibold" style="color: var(--text-sub);">Date: ${escapeHtml(b.dateText || b.dateBadge || '')}</p>
      </div>
      <div class="p-4 rounded-2xl border space-y-2.5 leading-relaxed" style="background-color: var(--bg-sub); border-color: var(--border-color); color: var(--text-main);">
        ${(b.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>
      ${(b.checklist && b.checklist.length) ? `
        <div class="p-4 rounded-2xl border space-y-1.5" style="background-color: var(--bg-sub); border-color: var(--border-color); color: var(--text-main);">
          <p class="font-extrabold text-amber-500 text-xs">${escapeHtml(b.checklistTitle || 'CITIZEN ADVISORY')}</p>
          <ul class="space-y-1">${b.checklist.map((c) => `<li><i class="fa-solid fa-check text-green-500 mr-1.5 text-[10px]"></i>${escapeHtml(c)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${b.contacts ? `<div class="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 font-bold text-center">${escapeHtml(b.contacts)}</div>` : ''}
      ${b.closingNote ? `<p class="text-[11px] leading-relaxed px-1" style="color: var(--text-main);">${escapeHtml(b.closingNote)}</p>` : ''}
      ${b.disclaimer ? `<p class="text-[10px] italic border-t pt-2.5" style="border-color: var(--border-color); color: var(--text-sub);">${escapeHtml(b.disclaimer)}</p>` : ''}
    `;
  }

  window.closeBulletinModal = function () {
    document.getElementById('bulletin-modal').classList.add('hidden');
    if (window.location.search.includes('bulletin=')) window.history.replaceState({}, '', window.location.pathname);
  };

  window.shareCurrentBulletin = async function () {
    if (!currentBulletin) return;
    const url = `https://tastyandcomfort.github.io/news/?bulletin=${encodeURIComponent(currentBulletin.id)}`;
    const text = `📢 T&C News Bulletin (${currentBulletin.dateBadge || ''}): ${currentBulletin.city ? currentBulletin.city + ' — ' : ''}${currentBulletin.title}`;
    const btnEl = document.getElementById('bulletin-share-btn');
    if (navigator.share) {
      try { await navigator.share({ title: 'T&C News Bulletin', text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      if (btnEl) { const old = btnEl.innerHTML; btnEl.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> <span>Bulletin Link Copied!</span>'; setTimeout(() => { btnEl.innerHTML = old; }, 1800); }
    } catch { prompt('Copy Bulletin link:', url); }
  };

  // 3. Apple In-App News Reader & Deep-Link Sharing
  function encodeStoryPayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeStoryPayload(str) {
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  function formatPrettyDate(isoOrStr) {
    if (!isoOrStr) return 'Latest Official Release';
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return String(isoOrStr);
    const day = d.getDate();
    const ord = (day > 3 && day < 21) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `Published at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${day}${ord} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function extractRssMeta(item, scopeLabel) {
    const rawTitle = item.querySelector('title')?.textContent?.trim() || 'News Story';
    const link = item.querySelector('link')?.textContent?.trim() || '#';
    const pubDateStr = item.querySelector('pubDate')?.textContent || '';
    const rawDesc = item.querySelector('description')?.textContent || '';

    let sourceName = 'Trusted by T&C';
    if (link.includes('tv9')) sourceName = 'TV9 Telugu';
    else if (link.includes('france24')) sourceName = 'France24';
    else if (link.includes('hindu')) sourceName = 'The Hindu';
    else if (link.includes('indiatimes')) sourceName = 'Times of India';
    else if (link.includes('news.google')) sourceName = 'Google News';

    const formattedTime = pubDateStr ? formatPrettyDate(pubDateStr) : 'Live Feed';
    const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
    const mediaEl = item.getElementsByTagName('media:content')[0] || item.querySelector('enclosure');
    const image = mediaEl?.getAttribute('url') || imgMatch?.[1] || '';

    const cleanDesc = rawDesc
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();

    return { rawTitle, link, sourceName, formattedTime, cleanDesc, image, scope: scopeLabel };
  }

  function registerNewsStory(story) {
    const id = 'st_' + Math.random().toString(36).slice(2, 10);
    window.tcNewsRegistry[id] = story;
    return id;
  }

  window.openNewsReaderById = function (id) {
    const story = window.tcNewsRegistry[id];
    if (story) window.openNewsReader(story);
  };

  window.openNewsReader = async function (story) {
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const title = await smartTranslate(story.title, lang);
    let summary = story.summary ? await smartTranslate(story.summary, lang) : '';
    if (!summary || summary.toLowerCase() === title.toLowerCase()) {
      summary = `Read the full report directly from ${story.source || 'the official publisher'} using the button below.`;
    }

    currentReaderStory = { ...story, title, summary };
    document.getElementById('reader-modal-scope').textContent = (story.scope || 'NEWS').toUpperCase();
    document.getElementById('reader-modal-source').textContent = story.source || 'T&C News Hub';
    document.getElementById('reader-modal-title').textContent = title;
    document.getElementById('reader-modal-time').querySelector('span').textContent = story.time || 'Live Feed';
    document.getElementById('reader-modal-summary').textContent = summary;
    document.getElementById('reader-modal-origin-link').href = story.link || 'https://tastyandcomfort.github.io/news/';

    const imgEl = document.getElementById('reader-modal-img');
    if (story.image && story.image.startsWith('http')) { imgEl.src = story.image; imgEl.classList.remove('hidden'); }
    else { imgEl.classList.add('hidden'); }

    document.getElementById('news-reader-modal').classList.remove('hidden');
  };

  window.closeNewsReader = function () {
    document.getElementById('news-reader-modal').classList.add('hidden');
    if (window.location.search.includes('story=')) window.history.replaceState({}, '', window.location.pathname);
  };

  async function shareStoryObject(story, btnEl) {
    const token = encodeStoryPayload({
      t: String(story.title || '').slice(0, 180),
      d: String(story.summary || '').slice(0, 260),
      u: story.link || 'https://tastyandcomfort.github.io/news/',
      s: story.source || 'T&C News Hub',
      c: story.scope || 'NEWS',
      p: story.time || ''
    });
    const shareUrl = `https://tastyandcomfort.github.io/news/?story=${token}`;
    const shareText = `📰 T&C News Hub — ${story.title}`;

    if (navigator.share) {
      try { await navigator.share({ title: `T&C News Hub: ${story.title}`, text: shareText, url: shareUrl }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      if (btnEl) {
        const oldHtml = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> <span>T&amp;C Link Copied!</span>';
        setTimeout(() => { btnEl.innerHTML = oldHtml; }, 1800);
      }
    } catch { prompt('Copy this T&C News link:', shareUrl); }
  }

  window.shareCurrentReaderStory = function () {
    if (currentReaderStory) shareStoryObject(currentReaderStory, document.getElementById('reader-share-btn'));
  };

  window.shareNewsCardById = function (id, btnEl) {
    const story = window.tcNewsRegistry[id];
    if (story) shareStoryObject(story, btnEl);
  };

  // 4. Govt Releases Engine (PIB A-Z, ED Press Releases, CBI Press Releases)
  async function fetchLiveGovReleases() {
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const feedContainer = document.getElementById('news-feed-container');
    const badge = document.getElementById('news-status-badge');
    const refreshIcon = document.getElementById('refresh-icon');

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    badge.textContent = 'Syncing Govt Feeds...';
    feedContainer.innerHTML = '<div class="text-center py-8 text-xs" style="color: var(--text-sub);"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Fetching live PIB (A–Z), ED &amp; CBI official releases...</div>';

    try {
      const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib,ed_press,cbi&regid=${encodeURIComponent(currentPibRegid)}&lang=${encodeURIComponent(lang)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      liveGovCache.pib = data?.sources?.pib || { ok: false, items: [], error: 'PIB unavailable' };
      liveGovCache.ed_press = data?.sources?.ed_press || { ok: false, items: [], error: 'ED unavailable' };
      liveGovCache.cbi = data?.sources?.cbi || { ok: false, items: [], error: 'CBI unavailable' };
      await window.renderGovFeedFromCache();
    } catch (err) {
      feedContainer.innerHTML = `<div class="p-4 text-center text-xs text-red-500 font-semibold">Official Government feed temporarily unreachable (${escapeHtml(err.message)}).</div>`;
      badge.textContent = 'Error';
    } finally {
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
  }

  window.renderGovFeedFromCache = async function () {
    const feedContainer = document.getElementById('news-feed-container');
    const badge = document.getElementById('news-status-badge');
    const banner = document.getElementById('gov-status-banner');
    if (!feedContainer) return;

    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const query = (document.getElementById('gov-search-input')?.value || '').trim().toLowerCase();
    const selectedDateStr = document.getElementById('news-date-picker')?.value || REAL_TODAY_DATE;
    const isDateFiltered = selectedDateStr && selectedDateStr !== REAL_TODAY_DATE;

    let combined = [];
    if (currentGovAgency === 'all' || currentGovAgency === 'pib') combined.push(...(liveGovCache.pib?.items || []));
    if (currentGovAgency === 'all' || currentGovAgency === 'ed_press') combined.push(...(liveGovCache.ed_press?.items || []));
    if (currentGovAgency === 'all' || currentGovAgency === 'cbi') combined.push(...(liveGovCache.cbi?.items || []));

    if (query) combined = combined.filter(it => `${it.title} ${it.summary} ${it.department} ${it.verifiedBy}`.toLowerCase().includes(query));
    if (isDateFiltered) combined = combined.filter(it => it.publishedAt && getLocalDateStr(new Date(it.publishedAt)) === selectedDateStr);

    combined.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    if (banner) {
      const notes = [];
      if ((currentGovAgency === 'all' || currentGovAgency === 'cbi') && liveGovCache.cbi && !liveGovCache.cbi.directAccessible) {
        notes.push(`<span><i class="fa-solid fa-circle-info text-amber-500 mr-1"></i><b>CBI Portal:</b> Restricted. <a href="https://cbi.gov.in/press-releases" target="_blank" rel="noopener" class="text-blue-500 font-bold underline">cbi.gov.in ↗</a></span>`);
      }
      if ((currentGovAgency === 'all' || currentGovAgency === 'ed_press') && liveGovCache.ed_press && !liveGovCache.ed_press.ok) {
        notes.push(`<span><i class="fa-solid fa-triangle-exclamation text-amber-500 mr-1"></i><b>ED Portal:</b> ${escapeHtml(liveGovCache.ed_press.error || 'Unavailable')}. <a href="https://enforcementdirectorate.gov.in/media/press-release/" target="_blank" rel="noopener" class="text-blue-500 font-bold underline">ED Press Releases ↗</a></span>`);
      }
      if ((currentGovAgency === 'all' || currentGovAgency === 'pib') && liveGovCache.pib && !liveGovCache.pib.ok) {
        notes.push(`<span><i class="fa-solid fa-triangle-exclamation text-amber-500 mr-1"></i><b>PIB Portal:</b> ${escapeHtml(liveGovCache.pib.error || 'Unavailable')}. <a href="https://pib.gov.in" target="_blank" rel="noopener" class="text-blue-500 font-bold underline">pib.gov.in ↗</a></span>`);
      }
      banner.innerHTML = notes.join(' • ');
      banner.classList.toggle('hidden', notes.length === 0);
    }

    if (combined.length === 0) {
      feedContainer.innerHTML = `<div class="p-6 rounded-xl text-center space-y-2" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);"><i class="fa-solid fa-landmark text-2xl text-amber-500"></i><p class="text-xs font-bold" style="color: var(--text-main);">No matching live official releases found.</p><p class="text-[11px]" style="color: var(--text-sub);">Try switching PIB region/agency filters, clearing the search box, or resetting the date to Today.</p></div>`;
      badge.textContent = '0 Releases';
      return;
    }

    const badgeColors = {
      PIB: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      ED: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      CBI: 'bg-red-500/15 text-red-500 border-red-500/30'
    };

    const rendered = await Promise.all(combined.slice(0, 45).map(async (item) => {
      const title = await smartTranslate(item.title, lang);
      const timeStr = item.publishedAt ? formatPrettyDate(item.publishedAt) : (item.dateText || 'Latest Official Release');
      const storyId = registerNewsStory({
        scope: `${item.agency} OFFICIAL`, source: item.verifiedBy || item.department,
        title, summary: item.summary || title, time: timeStr, link: item.link, image: ''
      });
      return `
        <div class="p-3.5 rounded-xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-500/35" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);">
          <div class="flex-grow cursor-pointer" onclick="openNewsReaderById('${storyId}')">
            <div class="flex items-center gap-2 flex-wrap mb-1.5">
              <span class="px-2 py-0.5 rounded text-[9.5px] font-black border uppercase ${badgeColors[item.agency] || 'bg-blue-500/10 text-blue-500 border-blue-500/30'}">${escapeHtml(item.agency)}</span>
              <span class="text-[10px] font-bold" style="color: var(--text-sub);">${escapeHtml(item.department)}</span>
            </div>
            <h4 class="text-xs md:text-sm font-semibold line-clamp-2 hover:text-blue-500 transition-colors" style="color: var(--text-main);">${escapeHtml(title)}</h4>
            <div class="flex items-center gap-3 mt-2 text-[10px]" style="color: var(--text-sub);">
              <span><i class="fa-regular fa-clock mr-1"></i>${escapeHtml(timeStr)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end md:self-center flex-shrink-0">
            <button type="button" onclick="shareNewsCardById('${storyId}', this)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);" title="Share via T&C News"><i class="fa-solid fa-share-nodes text-blue-500 text-[10px]"></i></button>
            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border border-blue-500/30"><i class="fa-solid ${item.pdfUrl ? 'fa-file-pdf' : 'fa-circle-check'} text-[10px]"></i> ${escapeHtml(item.verifiedBy || 'Official')}</a>
          </div>
        </div>
      `;
    }));

    feedContainer.innerHTML = rendered.join('');
    badge.textContent = `Live (${combined.length} Official Releases)`;
  };

  // 5. Flash Scroller, Headlines & World Highlights
  window.refreshLiveFlashTicker = async function () {
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const scopes = [
      { key: 'local', label: 'TELANGANA', badgeClass: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
      { key: 'national', label: 'INDIA', badgeClass: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
      { key: 'world', label: 'WORLD', badgeClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' }
    ];

    const collected = [];
    await Promise.allSettled([
      ...scopes.map(async (s) => {
        try {
          const res = await fetch(`${GOV_API_BASE}/api/news?scope=${s.key}`);
          if (!res.ok) return;
          const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
          const items = Array.from(xml.querySelectorAll('item')).slice(0, 4);
          for (const item of items) {
            const meta = extractRssMeta(item, s.label);
            const title = await smartTranslate(meta.rawTitle, lang);
            const storyId = registerNewsStory({
              scope: s.label, source: meta.sourceName, title,
              summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
            });
            collected.push({ type: 'news', storyId, label: s.label, badgeClass: s.badgeClass, text: title });
          }
        } catch {}
      }),
      (async () => {
        try {
          const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib,ed_press,cbi&regid=3&lang=${encodeURIComponent(lang)}`);
          if (!res.ok) return;
          const data = await res.json();
          const govSlice = [
            ...(data?.sources?.pib?.items || []).slice(0, 2),
            ...(data?.sources?.ed_press?.items || []).slice(0, 2),
            ...(data?.sources?.cbi?.items || []).slice(0, 2)
          ];
          for (const g of govSlice) {
            const title = await smartTranslate(g.title, lang);
            const storyId = registerNewsStory({
              scope: g.agency, source: g.verifiedBy, title,
              summary: g.summary, time: g.publishedAt ? formatPrettyDate(g.publishedAt) : g.dateText, link: g.link, image: ''
            });
            collected.push({
              type: 'news', storyId, label: g.agency,
              badgeClass: g.agency === 'CBI' ? 'bg-red-500/15 text-red-500 border-red-500/30' : (g.agency === 'ED' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' : 'bg-amber-500/15 text-amber-500 border-amber-500/30'),
              text: title
            });
          }
        } catch {}
      })()
    ]);

    if (collected.length > 0 && typeof flashNewsEntries !== 'undefined') flashNewsEntries = collected;
    window.renderLiveFlashTrack();
  };

  window.renderLiveFlashTrack = function () {
    const track = document.getElementById('live-flash-track');
    if (!track) return;

    const wList = (typeof wantedDataset !== 'undefined' ? wantedDataset : []) || [];
    const alertEntries = wList.slice(0, 3).map((item) => ({
      type: 'wanted', id: item.id, label: 'ALERT',
      badgeClass: 'bg-red-500/15 text-red-500 border-red-500/30',
      text: `${item.name} • ${item.department}`
    }));

    const fList = (typeof flashNewsEntries !== 'undefined' ? flashNewsEntries : []) || [];
    const combined = [...fList, ...alertEntries];
    if (combined.length === 0) return;

    const buildItemHtml = (entry) => {
      if (entry.type === 'wanted') {
        return `<button type="button" onclick="openWantedDossier('${escapeHtml(entry.id)}')" class="inline-flex items-center gap-2 px-4 text-[11.5px] font-semibold hover:text-red-500 transition-colors whitespace-nowrap" style="color: var(--text-main);"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border ${entry.badgeClass}">${entry.label}</span><span>${escapeHtml(entry.text)}</span><span class="opacity-30 pl-2">•</span></button>`;
      }
      return `<button type="button" onclick="openNewsReaderById('${escapeHtml(entry.storyId)}')" class="inline-flex items-center gap-2 px-4 text-[11.5px] font-semibold hover:text-blue-500 transition-colors whitespace-nowrap" style="color: var(--text-main);"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border ${entry.badgeClass}">${entry.label}</span><span>${escapeHtml(entry.text)}</span><span class="opacity-30 pl-2">•</span></button>`;
    };

    const singlePassHtml = combined.map(buildItemHtml).join('');
    track.innerHTML = singlePassHtml + singlePassHtml;

    const totalChars = combined.reduce((sum, e) => sum + e.text.length + 14, 0);
    track.style.setProperty('--ticker-duration', `${Math.max(30, Math.min(120, Math.round(totalChars * 0.14)))}s`);
    if (typeof isFlashPaused !== 'undefined' && !isFlashPaused) track.classList.remove('ticker-paused');
  };

  window.fetchPortalNews = async function () {
    const scope = typeof currentScope !== 'undefined' ? currentScope : 'local';
    const govBar = document.getElementById('gov-controls-bar');
    if (govBar) govBar.classList.toggle('hidden', scope !== 'gov');

    if (scope === 'gov') { await fetchLiveGovReleases(); return; }

    const feedContainer = document.getElementById('news-feed-container');
    const badge = document.getElementById('news-status-badge');
    const selectedDateStr = document.getElementById('news-date-picker')?.value || REAL_TODAY_DATE;
    const refreshIcon = document.getElementById('refresh-icon');
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    badge.textContent = "Updating...";
    feedContainer.innerHTML = '<div class="text-center py-8 text-xs" style="color: var(--text-sub);"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading stories...</div>';

    try {
      const res = await fetch(`${GOV_API_BASE}/api/news?scope=${scope}&date=${selectedDateStr}`);
      if (!res.ok) throw new Error("API error");
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      let filteredItems = items.filter(item => {
        const pubDate = item.querySelector("pubDate")?.textContent;
        return pubDate ? getLocalDateStr(new Date(pubDate)) === selectedDateStr : false;
      });
      if (filteredItems.length < 10 && selectedDateStr === REAL_TODAY_DATE && items.length > 0) filteredItems = items.slice(0, 15);

      if (filteredItems.length === 0) {
        const scopeLabel = scope === 'local' ? 'Telangana State' : (scope === 'national' ? 'India' : 'World');
        const googleArchiveUrl = `https://www.google.com/search?q=${encodeURIComponent(scopeLabel + ' news ' + selectedDateStr)}&tbm=nws`;
        feedContainer.innerHTML = `<div class="p-6 rounded-xl text-center flex flex-col items-center gap-3" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);"><i class="fa-solid fa-calendar-xmark text-2xl text-amber-500"></i><div><h4 class="text-xs font-bold" style="color: var(--text-main);">No Stories Found for ${selectedDateStr}</h4><p class="text-[11px] mt-1" style="color: var(--text-sub);">No direct RSS records matched this exact date. Check the official news archive source below:</p></div><a href="${googleArchiveUrl}" target="_blank" rel="noopener" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-blue-500 transition-all flex items-center gap-1.5"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Open News Source Archive (${selectedDateStr})</a></div>`;
        badge.textContent = "No Records for Date";
        return;
      }

      let html = '';
      for (const item of filteredItems) {
        const meta = extractRssMeta(item, scope);
        const title = await smartTranslate(meta.rawTitle, lang);
        const storyId = registerNewsStory({
          scope, source: meta.sourceName, title,
          summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
        });

        html += `
          <div class="p-3.5 rounded-xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-500/35" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);">
            <div class="flex-grow cursor-pointer" onclick="openNewsReaderById('${storyId}')">
              <h4 class="text-xs md:text-sm font-semibold line-clamp-2 hover:text-blue-500 transition-colors" style="color: var(--text-main);">${escapeHtml(title)}</h4>
              <div class="flex items-center gap-3 mt-2 text-[10px]" style="color: var(--text-sub);">
                <span class="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-bold uppercase">${scope} • ${lang.toUpperCase()}</span>
                <span><i class="fa-regular fa-clock mr-1"></i>${meta.formattedTime}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 self-end md:self-center flex-shrink-0">
              <button type="button" onclick="shareNewsCardById('${storyId}', this)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);" title="Share via T&C News"><i class="fa-solid fa-share-nodes text-blue-500 text-[10px]"></i></button>
              <a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border border-blue-500/30"><i class="fa-solid fa-circle-check text-[10px]"></i> ${meta.sourceName}</a>
            </div>
          </div>
        `;
      }
      feedContainer.innerHTML = html;
      badge.textContent = `Live (${filteredItems.length} Stories)`;
    } catch {
      feedContainer.innerHTML = `<div class="p-4 text-center text-xs text-red-500 font-semibold">News feed temporarily unavailable.</div>`;
      badge.textContent = "Error";
    } finally {
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
  };

  window.fetchPinnedWorldNews = async function () {
    const container = document.getElementById('pinned-world-news');
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    try {
      const res = await fetch(`${GOV_API_BASE}/api/news?scope=world`);
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      let html = '';
      for (const item of items.slice(0, 3)) {
        const meta = extractRssMeta(item, 'world');
        const title = await smartTranslate(meta.rawTitle, lang);
        const storyId = registerNewsStory({
          scope: 'world', source: meta.sourceName, title,
          summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
        });
        html += `<button type="button" onclick="openNewsReaderById('${storyId}')" class="text-left p-2.5 rounded-xl text-xs transition-all line-clamp-2 hover:border-amber-500/40" style="background-color: var(--bg-sub); color: var(--text-main); border: 1px solid var(--border-color);">• ${escapeHtml(title)}</button>`;
      }
      container.innerHTML = html;
    } catch {
      container.innerHTML = '<div class="text-xs" style="color: var(--text-sub);">Highlights loading...</div>';
    }
  };

  // 6. Live ED Proclamations, CBI Red Notices & Missing Persons inside Most Wanted Tab
  async function fetchLiveWantedExtras() {
    await Promise.allSettled([
      (async () => {
        try {
          const res = await fetch(`${GOV_API_BASE}/api/gov?source=ed_proclamation,cbi`);
          if (!res.ok) return;
          const data = await res.json();
          const edData = data?.sources?.ed_proclamation;
          if (edData) {
            liveEdStatus = { ok: !!edData.ok, error: edData.error || '' };
            liveEdProclamations = Array.isArray(edData.items) ? edData.items : [];
            if (liveEdProclamations.length > 0 && typeof wantedDataset !== 'undefined') {
              wantedDataset = [...wantedDataset.filter(i => i.agency !== 'ED'), ...liveEdProclamations];
            }
          }
          if (data?.sources?.cbi) {
            liveCbiData = data.sources.cbi;
            const rn = Array.isArray(liveCbiData.redNotices) ? liveCbiData.redNotices : [];
            if (rn.length > 0 && typeof wantedDataset !== 'undefined') {
              wantedDataset = [...wantedDataset.filter(i => i.agency !== 'CBI'), ...rn];
            }
          }
        } catch {}
      })(),
      fetchLiveMissingPersons()
    ]);
    if (typeof window.renderWantedHomeStrip === 'function') window.renderWantedHomeStrip();
    window.renderWantedDirectory();
  }

  async function fetchLiveMissingPersons() {
    try {
      const res = await fetch(`${GOV_API_BASE}/api/missing?source=all`);
      if (!res.ok) return;
      const data = await res.json();
      missingSourcesMeta = data?.sources || {};
      const zip = missingSourcesMeta.zipnet?.items || [];
      const fbiM = missingSourcesMeta.fbi_missing?.items || [];
      const intY = missingSourcesMeta.interpol_yellow?.items || [];
      missingDataset = [...zip, ...fbiM, ...intY];
    } catch {}
    window.renderWantedDirectory();
  }

  const origOpenDossier = window.openWantedDossier;
  window.openWantedDossier = function (id) {
    const foundMissing = missingDataset.find(x => x.id === id);
    if (foundMissing && typeof wantedDataset !== 'undefined' && !wantedDataset.some(x => x.id === id)) {
      wantedDataset.push(foundMissing);
    }
    if (typeof origOpenDossier === 'function') origOpenDossier(id);
  };

  const origRenderWantedDir = window.renderWantedDirectory;
  window.renderWantedDirectory = function () {
    const agency = typeof currentWantedAgency !== 'undefined' ? currentWantedAgency : 'all';
    const missingBar = document.getElementById('missing-controls-bar');
    if (missingBar) missingBar.classList.toggle('hidden', agency !== 'MISSING');

    if (agency === 'MISSING') {
      renderMissingDirectoryView();
      return;
    }

    if (typeof origRenderWantedDir === 'function') origRenderWantedDir();

    const container = document.getElementById('wanted-directory-container');
    if (!container) return;

    if (agency === 'ED' && liveEdProclamations.length === 0) {
      container.innerHTML = `<div class="p-6 rounded-2xl text-center space-y-3 border border-amber-500/30" style="background-color: var(--bg-sub);"><i class="fa-solid fa-scale-balanced text-2xl text-amber-500"></i><h4 class="text-xs sm:text-sm font-extrabold" style="color: var(--text-main);">ED Proclamation Data Temporarily Unavailable</h4><p class="text-[11px] max-w-md mx-auto leading-relaxed" style="color: var(--text-sub);">${escapeHtml(liveEdStatus.error || 'Could not load ED proclamations right now. Check the official ED portal directly:')}</p><a href="https://enforcementdirectorate.gov.in/wanted/notice-for-proclamation/" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Open Official ED Proclamation Notices</a></div>`;
    } else if (agency === 'CBI' && (!liveCbiData.redNotices || liveCbiData.redNotices.length === 0)) {
      container.innerHTML = `<div class="p-6 rounded-2xl text-center space-y-3 border border-amber-500/30" style="background-color: var(--bg-sub);"><i class="fa-solid fa-shield-halved text-2xl text-amber-500"></i><h4 class="text-xs sm:text-sm font-extrabold" style="color: var(--text-main);">CBI Red Notices Temporarily Unavailable</h4><p class="text-[11px] max-w-md mx-auto leading-relaxed" style="color: var(--text-sub);">Could not load CBI's Red Notice table right now. View directly on CBI's official portal:</p><a href="https://cbi.gov.in/interpol-red-notice" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Open Official CBI Red Notices</a></div>`;
    }
  };

  function renderMissingDirectoryView() {
    const container = document.getElementById('wanted-directory-container');
    const countBadge = document.getElementById('wanted-count-badge');
    const statusBox = document.getElementById('missing-source-status');
    if (!container) return;

    const query = (document.getElementById('wanted-search-input')?.value || '').trim().toLowerCase();
    const sortMode = document.getElementById('wanted-sort-select')?.value || 'latest';

    let list = missingDataset.filter(item =>
      !query || [item.name, ...(item.aliases || []), item.department, item.location, item.charges, item.stateName].join(' ').toLowerCase().includes(query)
    );

    if (sortMode === 'latest') list.sort((a, b) => new Date(b.updatedAt || b.publishedAt || 0) - new Date(a.updatedAt || a.publishedAt || 0));
    else if (sortMode === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (countBadge) countBadge.innerHTML = `<span class="live-dot-red" style="width:6px;height:6px;"></span> ${list.length} Live Missing Records`;

    if (statusBox) {
      const fbiMeta = missingSourcesMeta.fbi_missing;
      const intMeta = missingSourcesMeta.interpol_yellow;
      statusBox.innerHTML = [
        `<b>Live Feed — FBI Missing:</b> ${fbiMeta?.ok ? `${fbiMeta.count} live records` : escapeHtml(fbiMeta?.error || 'Unavailable')}`,
        `<b>INTERPOL Yellow:</b> ${intMeta?.ok ? `${intMeta.count} live` : `Restricted by server — <a href="https://www.interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Open INTERPOL ↗</a>`}`
      ].join(' • ');
    }

    if (list.length === 0) {
      container.innerHTML = `<div class="p-6 rounded-2xl text-center space-y-2 border" style="background-color: var(--bg-sub); border-color: var(--border-color);"><i class="fa-solid fa-magnifying-glass text-xl text-blue-500"></i><p class="text-xs font-bold" style="color: var(--text-main);">No matching missing person records found.</p><p class="text-[11px]" style="color: var(--text-sub);">Clear your search box or use the All-India State Portal selector above.</p></div>`;
      return;
    }

    container.innerHTML = list.map(item => {
      const photoHtml = item.photo
        ? `<img src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" class="w-16 h-20 sm:w-20 sm:h-24 rounded-xl object-cover border flex-shrink-0" style="border-color: var(--border-color);"><div style="display:none; border-color: var(--border-color);" class="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-blue-500/10 text-blue-500 border items-center justify-center flex-shrink-0"><i class="fa-solid fa-person-circle-question text-2xl"></i></div>`
        : `<div class="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-blue-500/10 text-blue-500 border flex items-center justify-center flex-shrink-0" style="border-color: var(--border-color);"><i class="fa-solid fa-person-circle-question text-2xl"></i></div>`;

      return `
        <div class="p-4 rounded-2xl border transition-all hover:border-blue-500/40" style="background-color: var(--bg-sub); border-color: var(--border-color);">
          <div class="flex items-start gap-3.5">
            ${photoHtml}
            <div class="min-w-0 flex-grow">
              <div class="flex items-center gap-1.5 flex-wrap mb-1">
                <span class="text-[9.5px] font-black px-2 py-0.5 rounded bg-blue-600 text-white uppercase">${escapeHtml(item.noticeType || 'MISSING')}</span>
                ${item.stateName ? `<span class="text-[9.5px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">${escapeHtml(item.stateName)}</span>` : ''}
              </div>
              <h4 class="text-sm font-extrabold leading-snug" style="color: var(--text-main);">${escapeHtml(item.name)}</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 text-[11px]" style="color: var(--text-sub);">
                <p class="truncate"><i class="fa-solid fa-building-shield mr-1.5 text-blue-500"></i><b>Dept:</b> <span style="color: var(--text-main);">${escapeHtml(item.department)}</span></p>
                <p class="truncate"><i class="fa-solid fa-location-dot mr-1.5 text-red-500"></i><b>Area:</b> <span style="color: var(--text-main);">${escapeHtml(item.location)}</span></p>
              </div>
              <p class="text-[11px] mt-1.5 line-clamp-2" style="color: var(--text-sub);">${escapeHtml(item.charges)}</p>
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2.5" style="border-color: var(--border-color);">
            <span class="text-[10px]" style="color: var(--text-sub);"><i class="fa-regular fa-clock mr-1 text-blue-500"></i><b>Reported:</b> ${escapeHtml(formatAgencyTimestamp(item.publishedAt || item.updatedAt))}</span>
            <div class="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button onclick="openWantedDossier('${escapeHtml(item.id)}')" class="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);"><i class="fa-solid fa-file-lines mr-1 text-[10px]"></i> Full Dossier</button>
              <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border border-blue-500/30"><i class="fa-solid fa-circle-check text-[10px]"></i> Verified by ${escapeHtml(item.verifiedBy)}</a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const origCloseActivePlayer = window.closeActivePlayer;
  window.closeActivePlayer = function () {
    if (typeof origCloseActivePlayer === 'function') origCloseActivePlayer();
    if (window.tcPendingReload) { window.tcPendingReload = false; window.location.reload(); }
  };

  const origChangeLanguage = window.changeLanguage;
  window.changeLanguage = function (langCode) {
    if (typeof origChangeLanguage === 'function') origChangeLanguage(langCode);
    if (typeof currentScope !== 'undefined' && currentScope === 'gov') {
      document.getElementById('active-scope-title').textContent = 'Official Govt Releases (PIB A–Z · ED · CBI)';
    }
    window.fetchPinnedWorldNews();
    window.refreshLiveFlashTicker();
  };

  const origManualRefresh = window.manualHubRefresh;
  window.manualHubRefresh = async function () {
    if (typeof origManualRefresh === 'function') await origManualRefresh();
    await Promise.allSettled([window.fetchBulletins(), window.refreshLiveFlashTicker(), fetchLiveWantedExtras()]);
  };

  document.addEventListener('DOMContentLoaded', () => {
    injectAddonUI();
    window.fetchBulletins();
    loadPibRegionsFromServer();
    fetchLiveWantedExtras();

    const ensureFlashPlaying = () => {
      const t = document.getElementById('live-flash-track');
      if (t && (typeof isFlashPaused === 'undefined' || !isFlashPaused)) t.classList.remove('ticker-paused');
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ensureFlashPlaying(); });
    window.addEventListener('pageshow', ensureFlashPlaying);
    window.addEventListener('focus', ensureFlashPlaying);

    const urlParams = new URLSearchParams(window.location.search);
    const sharedStoryParam = urlParams.get('story');
    if (sharedStoryParam) {
      const decoded = decodeStoryPayload(sharedStoryParam);
      if (decoded && decoded.t) {
        window.openNewsReader({
          scope: decoded.c || 'NEWS', source: decoded.s || 'T&C News Hub',
          title: decoded.t, summary: decoded.d || '',
          time: decoded.p || 'Shared via T&C News Hub',
          link: decoded.u || 'https://tastyandcomfort.github.io/news/', image: decoded.i || ''
        });
      }
    }
    const sharedBulletinId = urlParams.get('bulletin');
    if (sharedBulletinId) setTimeout(() => window.openBulletinById(sharedBulletinId), 400);
  });
})();

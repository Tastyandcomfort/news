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
    { state: 'Madhya Pradesh Police (Citizen Portal)', url: 'https://citizen.mppolice.gov.in/' },
    { state: 'Maharashtra Police (Citizen Portal)', url: 'https://citizen.mahapolice.gov.in/' },
    { state: 'Manipur Police', url: 'https://manipurpolice.gov.in/' },
    { state: 'Meghalaya Police', url: 'https://megpolice.gov.in/' },
    { state: 'Mizoram Police', url: 'https://police.mizoram.gov.in/' },
    { state: 'Nagaland Police', url: 'https://police.nagaland.gov.in/' },
    { state: 'Odisha Police (Citizen Portal)', url: 'https://citizenportal-op.gov.in/' },
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
            <button type="button" onclick="setGovAgencyFilter('pib', this)" class="choice-pill"> PIB India </button>
            <button type="button" onclick="setGovAgencyFilter('ed_press', this)" class="choice-pill"> ED Press Releases</button>
            <button type="button" onclick="setGovAgencyFilter('cbi', this)" class="choice-pill"> CBI </button>
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

/* T&C News Hub — Bulletins, Live Press Releases Hub (12h Auto-Sync / Manual Refresh, No Cache/Fallbacks), Apple Reader & Share */
(function () {
  const GOV_API_BASE = 'https://news-lemon-two.vercel.app';
  const PRESS_AUTO_SYNC_MS = 12 * 60 * 60 * 1000; // 12 hours
  window.tcNewsRegistry = window.tcNewsRegistry || {};

  let currentReaderStory = null;
  let bulletinsDataset = [];
  let currentBulletin = null;
  let isBulletinArchiveView = false;

  // Press Releases Live State (No cached item arrays, no static fallback lists)
  let pressInitialized = false;
  let lastPressSyncAt = 0;
  let pressAutoSyncTimer = null;
  let currentPressCategory = 'all';
  let currentPibRegid = '3';
  let currentMinistryId = '';
  let currentSpaceFilter = 'ALL';
  let currentPoliceState = 'ALL';
  let customPressReleases = [];
  let pressLiveItems = [];
  let pressStatusNotes = [];
  let pibRegionsList = [];
  let pibMinistriesList = [];

  // Most Wanted & Missing State
  let liveEdProclamations = [];
  let liveEdStatus = { ok: false, error: '' };
  let liveCbiData = { ok: false, directAccessible: false, items: [], redNotices: [], error: '' };
  let missingDataset = [];
  let missingSourcesMeta = {};

  const STATE_POLICE_PORTALS = [
    { key: 'ALL', name: 'All Live Police Feeds (Delhi, Kerala & Chandigarh)', url: 'https://digitalpolice.gov.in/', live: true },
    { key: 'DELHI', name: 'Delhi Police (Live Official Feed)', url: 'https://delhipolice.gov.in/newpressrelease.aspx', live: true },
    { key: 'KERALA', name: 'Kerala Police (Live Official Feed)', url: 'https://keralapolice.gov.in/page/press-releases', live: true },
    { key: 'CHANDIGARH', name: 'Chandigarh Police (Live Official Feed)', url: 'https://chandigarhpolice.gov.in/press-release.html', live: true },
    { key: 'ANDAMAN', name: 'Andaman & Nicobar Islands Police', url: 'https://police.andaman.gov.in/' },
    { key: 'ANDHRA PRADESH', name: 'Andhra Pradesh Police', url: 'https://citizen.appolice.gov.in/' },
    { key: 'ARUNACHAL PRADESH', name: 'Arunachal Pradesh Police', url: 'https://arunpol.nic.in/' },
    { key: 'ASSAM', name: 'Assam Police', url: 'https://assampolice.gov.in/' },
    { key: 'BIHAR', name: 'Bihar Police', url: 'https://police.bihar.gov.in/' },
    { key: 'CHHATTISGARH', name: 'Chhattisgarh Police', url: 'https://cgpolice.gov.in/' },
    { key: 'DNHDD', name: 'Dadra & Nagar Haveli and Daman & Diu Police', url: 'https://dnhddpolice.gov.in/' },
    { key: 'GOA', name: 'Goa Police', url: 'https://citizen.goapolice.gov.in/' },
    { key: 'GUJARAT', name: 'Gujarat Police', url: 'https://gujhome.gujarat.gov.in/portal/' },
    { key: 'HARYANA', name: 'Haryana Police', url: 'https://haryanapolice.gov.in/' },
    { key: 'HIMACHAL PRADESH', name: 'Himachal Pradesh Police', url: 'https://citizenportal.hppolice.gov.in/' },
    { key: 'JAMMU & KASHMIR', name: 'Jammu & Kashmir Police', url: 'https://jkpolice.gov.in/' },
    { key: 'JHARKHAND', name: 'Jharkhand Police', url: 'https://jhpolice.gov.in/' },
    { key: 'KARNATAKA', name: 'Karnataka State Police', url: 'https://ksp.karnataka.gov.in/' },
    { key: 'LADAKH', name: 'Ladakh Police', url: 'https://police.ladakh.gov.in/' },
    { key: 'LAKSHADWEEP', name: 'Lakshadweep Police', url: 'https://lakshadweeppolice.gov.in/' },
    { key: 'MADHYA PRADESH', name: 'Madhya Pradesh Police', url: 'https://citizen.mppolice.gov.in/' },
    { key: 'MAHARASHTRA', name: 'Maharashtra Police', url: 'https://citizen.mahapolice.gov.in/' },
    { key: 'MANIPUR', name: 'Manipur Police', url: 'https://manipurpolice.gov.in/' },
    { key: 'MEGHALAYA', name: 'Meghalaya Police', url: 'https://megpolice.gov.in/' },
    { key: 'MIZORAM', name: 'Mizoram Police', url: 'https://police.mizoram.gov.in/' },
    { key: 'NAGALAND', name: 'Nagaland Police', url: 'https://police.nagaland.gov.in/' },
    { key: 'ODISHA', name: 'Odisha Police', url: 'https://citizenportal-op.gov.in/' },
    { key: 'PUDUCHERRY', name: 'Puducherry Police', url: 'https://police.py.gov.in/' },
    { key: 'PUNJAB', name: 'Punjab Police', url: 'https://punjabpolice.gov.in/' },
    { key: 'RAJASTHAN', name: 'Rajasthan Police', url: 'https://police.rajasthan.gov.in/' },
    { key: 'SIKKIM', name: 'Sikkim Police', url: 'https://police.sikkim.gov.in/' },
    { key: 'TAMIL NADU', name: 'Tamil Nadu Police', url: 'https://eservices.tnpolice.gov.in/' },
    { key: 'TELANGANA', name: 'Telangana Police', url: 'https://www.tspolice.gov.in/' },
    { key: 'TRIPURA', name: 'Tripura Police', url: 'https://tripurapolice.gov.in/' },
    { key: 'UTTAR PRADESH', name: 'Uttar Pradesh Police', url: 'https://uppolice.gov.in/' },
    { key: 'UTTARAKHAND', name: 'Uttarakhand Police', url: 'https://uttarakhandpolice.uk.gov.in/' },
    { key: 'WEST BENGAL', name: 'West Bengal Police', url: 'https://wbpolice.gov.in/' }
  ];

  const INDIA_OFFICIAL_MISSING_PORTALS = [
    { state: 'National — TrackChild (Missing Children, All States)', url: 'https://trackthemissingchild.gov.in/trackchild/index.php' },
    { state: 'National — Khoya-Paya (Citizen Missing Children Portal)', url: 'https://khoyapaya.gov.in/mpp/home' },
    { state: 'National — Digital Police (CCTNS Citizen Services)', url: 'https://digitalpolice.gov.in/' },
    { state: 'National — ZIPNET (8 North/Central States Live)', url: 'https://zipnet.delhipolice.gov.in/victims/missingpersons/' },
    ...STATE_POLICE_PORTALS.filter(s => s.key !== 'ALL').map(s => ({ state: s.name.replace(/\s*\(Live Official Feed\)/i, ''), url: s.url }))
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
          <div class="apple-card max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative border border-blue-500/25 my-auto">
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
                <div id="reader-modal-summary" class="space-y-2.5 whitespace-pre-line">Loading story brief...</div>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2" style="border-color: var(--border-color);">
              <div class="flex items-center gap-2 flex-wrap">
                <button onclick="shareCurrentReaderStory()" id="reader-share-btn" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border" style="background-color: var(--bg-sub); color: var(--text-main); border-color: var(--border-color);">
                  <i class="fa-solid fa-share-nodes text-blue-500"></i> <span>Share</span>
                </button>
              </div>
              <a id="reader-modal-origin-link" href="#" target="_blank" rel="noopener" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2">
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

  window.openSelectedStatePortal = function () {
    const sel = document.getElementById('india-state-portal-select');
    const idx = Number(sel?.value || 0);
    const entry = INDIA_OFFICIAL_MISSING_PORTALS[idx];
    if (entry?.url) window.open(entry.url, '_blank', 'noopener');
  };

  async function smartTranslate(text, targetLang) {
    if (!text) return '';
    if (targetLang === 'en') {
      if (!/[\u0900-\u0D7F]/.test(text)) return text;
      const key = `auto-en:${text.slice(0, 120)}`;
      if (typeof translationCache !== 'undefined' && translationCache[key]) return translationCache[key];
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text.slice(0, 1800))}`);
        const data = await res.json();
        if (data && data[0]) {
          const out = data[0].map(s => s[0]).join('');
          if (typeof translationCache !== 'undefined') translationCache[key] = out;
          return out;
        }
      } catch {}
      return text;
    }
    return typeof translateText === 'function' ? await translateText(text.slice(0, 1800), targetLang) : text;
  }

  function resolveRelativePdf(folderName, raw) {
    if (!raw) return '';
    const val = String(raw).trim();
    if (/^https?:\/\//i.test(val)) return val;
    if (val.includes('/')) {
      const parts = val.split('/');
      const file = parts.pop();
      return `${parts.join('/')}/${encodeURIComponent(file)}`;
    }
    return `./${folderName}/${encodeURIComponent(val)}`;
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

    const resolvedPdf = resolveRelativePdf('Bulletin-files', b.pdfUrl);
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

  // 3. Apple In-App News & Official Document Reader + Deep-Link Share
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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ord = (day) => (day > 3 && day < 21) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
    const dateOnly = String(isoOrStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const y = Number(dateOnly[1]), m = Number(dateOnly[2]) - 1, d = Number(dateOnly[3]);
      return `${d}${ord(d)} ${months[m]} ${y}`;
    }
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return String(isoOrStr);
    const day = d.getDate();
    if (!String(isoOrStr).includes('T') && !/\d{1,2}:\d{2}/.test(String(isoOrStr))) {
      return `${day}${ord(day)} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return `Published at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${day}${ord(day)} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function extractRssMeta(item, scopeLabel) {
    const rawTitle = item.querySelector('title')?.textContent?.trim() || 'News Story';
    const link = item.querySelector('link')?.textContent?.trim() || '#';
    const pubDateStr = item.querySelector('pubDate')?.textContent || '';
    const rawDesc = item.querySelector('description')?.textContent || '';
    const explicitSource = item.querySelector('source')?.textContent?.trim() || '';

    let sourceName = explicitSource || 'Official Feed';
    if (link.includes('bbc.co') || link.includes('bbc.com')) sourceName = 'BBC News';
    else if (link.includes('france24')) sourceName = 'France24';
    else if (link.includes('skynews')) sourceName = 'Sky News';
    else if (link.includes('aljazeera')) sourceName = 'Al Jazeera';
    else if (link.includes('thehindu')) sourceName = 'The Hindu';
    else if (link.includes('indiatimes')) sourceName = 'Times of India';
    else if (link.includes('ndtv')) sourceName = 'NDTV';
    else if (link.includes('hindustantimes')) sourceName = 'Hindustan Times';
    else if (link.includes('telanganatoday')) sourceName = 'Telangana Today';
    else if (link.includes('tv9')) sourceName = 'TV9 Telugu';
    else if (link.includes('news.google')) sourceName = 'Google News';

    const formattedTime = pubDateStr ? formatPrettyDate(pubDateStr) : 'Live Feed';
    const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
    const mediaEl = item.getElementsByTagName('media:content')[0] || item.getElementsByTagName('media:thumbnail')[0] || item.querySelector('enclosure');
    let image = mediaEl?.getAttribute('url') || imgMatch?.[1] || '';
    if (image && image.startsWith('http://')) image = image.replace(/^http:\/\//i, 'https://');

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
      summary = `Official release from ${story.source || 'the publisher'}. Tap "Open Original Source" below to view the source page.`;
    }

    currentReaderStory = { ...story, title, summary };
    document.getElementById('reader-modal-scope').textContent = (story.scope || 'NEWS').toUpperCase();
    document.getElementById('reader-modal-source').textContent = story.source || 'T&C News Hub';
    document.getElementById('reader-modal-title').textContent = title;
    document.getElementById('reader-modal-time').querySelector('span').textContent = story.time || 'Live Feed';
    document.getElementById('reader-modal-summary').textContent = summary;

    const originLink = document.getElementById('reader-modal-origin-link');
    originLink.href = story.link || 'https://tastyandcomfort.github.io/news/';
    const originBtnText = originLink.querySelector('span');
    if (originBtnText) originBtnText.textContent = story.isPdf ? 'Open Official PDF' : `Verified: ${story.source || 'Original'}`;

    const imgEl = document.getElementById('reader-modal-img');
    if (story.image && story.image.startsWith('http')) { imgEl.src = story.image; imgEl.classList.remove('hidden'); }
    else { imgEl.classList.add('hidden'); }

    document.getElementById('news-reader-modal').classList.remove('hidden');

    const docTarget = story.pageUrl || story.link;
    if (story.isOfficialDoc && docTarget && /^https?:\/\//i.test(docTarget)) {
      const summaryBox = document.getElementById('reader-modal-summary');
      const loadingNote = document.createElement('p');
      loadingNote.className = 'text-[11px] italic opacity-75 pt-2';
      loadingNote.textContent = 'Loading full official release document...';
      summaryBox.appendChild(loadingNote);

      try {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=read_article&url=${encodeURIComponent(docTarget)}&_ts=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const doc = await res.json();
          if (currentReaderStory?.link !== story.link) return;
          if (doc?.publishedAt) {
            const pretty = formatPrettyDate(doc.publishedAt);
            document.getElementById('reader-modal-time').querySelector('span').textContent = pretty;
            currentReaderStory.time = pretty;
          }
          if (doc?.pdfUrl) {
            originLink.href = doc.pdfUrl;
            if (originBtnText) originBtnText.textContent = 'Open Official PDF';
            currentReaderStory.link = doc.pdfUrl;
          }
          if (doc?.ok && doc.text) {
            const fullText = await smartTranslate(doc.text, lang);
            summaryBox.textContent = fullText;
            currentReaderStory.summary = fullText;
          } else {
            loadingNote.remove();
          }
        } else {
          loadingNote.remove();
        }
      } catch {
        loadingNote.remove();
      }
    }
  };

  window.printCurrentReaderDoc = function () {
    if (!currentReaderStory) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { window.print(); return; }
    const doc = w.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><title>T&C News Hub — Official Document</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:740px;margin:32px auto;padding:0 20px;line-height:1.6;color:#111} .meta{color:#555;font-size:13px;border-bottom:1px solid #ddd;padding-bottom:10px;margin-bottom:18px} h1{font-size:20px;margin:0 0 8px} .body{white-space:pre-line;font-size:14px} .foot{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:12px;color:#555}</style></head><body></body></html>');
    doc.close();
    const h1 = doc.createElement('h1'); h1.textContent = currentReaderStory.title || '';
    const meta = doc.createElement('div'); meta.className = 'meta'; meta.textContent = `${currentReaderStory.scope || 'OFFICIAL'} • ${currentReaderStory.source || ''} • ${currentReaderStory.time || ''}`;
    const body = doc.createElement('div'); body.className = 'body'; body.textContent = currentReaderStory.summary || '';
    const foot = doc.createElement('div'); foot.className = 'foot'; foot.textContent = `Source: ${currentReaderStory.link || ''} — Printed via T&C News Hub`;
    doc.body.append(h1, meta, body, foot);
    w.focus();
    setTimeout(() => w.print(), 250);
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
        btnEl.innerHTML = '<i class="fa-solid fa-check text-green-500"></i> <span>Link Copied!</span>';
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

  // 4. LIVE PRESS RELEASES HUB ENGINE (No Cache, No Fallbacks, 12h Auto-Sync + Manual Refresh)
  async function loadCustomPressReleases() {
    try {
      const res = await fetch(`./press-releases.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) { customPressReleases = []; return; }
      const raw = await res.json();
      const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
      customPressReleases = arr.map((it, idx) => {
        const pdfLink = resolveRelativePdf('press-release', it.pdfUrl || it.pdf || '');
        const link = pdfLink || it.link || 'https://tastyandcomfort.github.io/news/';
        return {
          id: it.id || `custom-pr-${idx}`,
          agency: (it.agency || 'T&C RELEASE').toUpperCase(),
          verifiedBy: it.source || 'T&C Verified',
          department: it.department || it.category || 'Posted by T&C',
          title: it.title || 'Press Release',
          summary: it.summary || it.text || it.title || '',
          publishedAt: it.publishedAt || null,
          dateText: it.dateText || it.date || 'T&C Press Release',
          link,
          pdfUrl: pdfLink,
          image: it.image || '',
          isCustom: true
        };
      });
    } catch {
      customPressReleases = [];
    }
  }

  async function loadPibListsForPressHub() {
    const [regRes, minRes] = await Promise.allSettled([
      fetch(`${GOV_API_BASE}/api/gov?source=pib_regions&_ts=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      fetch(`${GOV_API_BASE}/api/gov?source=pib_ministries&_ts=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
    ]);

    pibRegionsList = (regRes.status === 'fulfilled' && Array.isArray(regRes.value?.regions)) ? regRes.value.regions : [];
    if (pibRegionsList.length > 0 && !pibRegionsList.some(r => r.regid === currentPibRegid)) {
      currentPibRegid = pibRegionsList[0].regid;
    }

    pibMinistriesList = (minRes.status === 'fulfilled' && Array.isArray(minRes.value?.ministries))
      ? minRes.value.ministries.filter(m => m.minid !== '0')
      : [];
    if (pibMinistriesList.length > 0 && !pibMinistriesList.some(m => m.minid === currentMinistryId)) {
      currentMinistryId = pibMinistriesList[0].minid;
    }

    renderPressSubcontrols();
  }

  function renderPressSubcontrols() {
    const box = document.getElementById('press-subcontrols');
    if (!box) return;

    let extraHtml = '';
    if (currentPressCategory === 'all') {
      extraHtml = pibRegionsList.length > 0
        ? `<select id="press-pib-region-select" onchange="onPressPibRegionChange(this.value)" class="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer flex-1" style="background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">${pibRegionsList.map(r => `<option value="${escapeHtml(r.regid)}" ${r.regid === currentPibRegid ? 'selected' : ''}>PIB Region: ${escapeHtml(r.name)}</option>`).join('')}</select>`
        : `<span class="text-[11px] px-3 py-2 rounded-xl border flex-1" style="background-color: var(--bg-card); color: var(--text-sub); border-color: var(--border-color);">PIB Regions: Waiting for live server list...</span>`;
    } else if (currentPressCategory === 'ministries') {
      extraHtml = pibMinistriesList.length > 0
        ? `<select id="press-ministry-select" onchange="onPressMinistryChange(this.value)" class="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer flex-1" style="background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">${pibMinistriesList.map(m => `<option value="${escapeHtml(m.minid)}" ${m.minid === currentMinistryId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select>`
        : `<span class="text-[11px] px-3 py-2 rounded-xl border flex-1" style="background-color: var(--bg-card); color: var(--text-sub); border-color: var(--border-color);">Ministries: Waiting for live PIB dropdown...</span>`;
    } else if (currentPressCategory === 'space') {
      extraHtml = `
        <div class="flex items-center gap-1.5 flex-wrap">
          <button type="button" onclick="onPressSpaceFilter('ALL', this)" class="choice-pill ${currentSpaceFilter === 'ALL' ? 'selected' : ''}">All Space</button>
          <button type="button" onclick="onPressSpaceFilter('ISRO', this)" class="choice-pill ${currentSpaceFilter === 'ISRO' ? 'selected' : ''}">ISRO</button>
          <button type="button" onclick="onPressSpaceFilter('NASA', this)" class="choice-pill ${currentSpaceFilter === 'NASA' ? 'selected' : ''}">NASA</button>
          <button type="button" onclick="onPressSpaceFilter('SPACEX', this)" class="choice-pill ${currentSpaceFilter === 'SPACEX' ? 'selected' : ''}">SpaceX</button>
        </div>
      `;
    } else if (currentPressCategory === 'police') {
      const selStateObj = STATE_POLICE_PORTALS.find(s => s.key === currentPoliceState);
      extraHtml = `
        <div class="flex items-center gap-2 flex-1">
          <select id="press-police-select" onchange="onPressPoliceStateChange(this.value)" class="px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer w-full" style="background-color: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
            ${STATE_POLICE_PORTALS.map(s => `<option value="${escapeHtml(s.key)}" ${s.key === currentPoliceState ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>
          ${selStateObj ? `<a href="${escapeHtml(selStateObj.url)}" target="_blank" rel="noopener" class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold whitespace-nowrap">Portal ↗</a>` : ''}
        </div>
      `;
    }

    const searchVal = document.getElementById('press-search-input')?.value || '';
    box.innerHTML = `
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        ${extraHtml}
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl flex-1" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
          <i class="fa-solid fa-magnifying-glass text-xs" style="color: var(--text-sub);"></i>
          <input type="text" id="press-search-input" value="${escapeHtml(searchVal)}" oninput="renderPressFeed()" placeholder="Search press releases, dates, departments..." class="bg-transparent text-xs focus:outline-none w-full" style="color: var(--text-main);">
        </div>
        <button type="button" onclick="manualPressSync()" class="px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);" title="Fetch fresh live data now (also auto-syncs every 12h)">
          <i id="press-refresh-icon" class="fa-solid fa-arrows-rotate text-blue-500"></i> <span>Sync Live</span>
        </button>
      </div>
    `;
  }

  function startPressAutoSyncScheduler() {
    if (pressAutoSyncTimer) clearInterval(pressAutoSyncTimer);
    pressAutoSyncTimer = setInterval(() => {
      const pressView = document.getElementById('view-press');
      if (pressView && !pressView.classList.contains('hidden')) {
        window.manualPressSync();
      }
    }, PRESS_AUTO_SYNC_MS);
  }

  window.manualPressSync = async function () {
    await loadPibListsForPressHub();
    await window.fetchPressCategory(true);
  };

  window.initOrRefreshPressTab = async function () {
    const needsSync = !pressInitialized || !lastPressSyncAt || (Date.now() - lastPressSyncAt >= PRESS_AUTO_SYNC_MS);
    if (!pressInitialized) {
      pressInitialized = true;
      startPressAutoSyncScheduler();
      renderPressSubcontrols();
    }
    if (needsSync) {
      await loadPibListsForPressHub();
      await window.fetchPressCategory(true);
    }
  };

  window.selectPressCategory = function (cat, btnEl) {
    currentPressCategory = cat;
    document.querySelectorAll('#press-category-pills .choice-pill').forEach(b => b.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');
    renderPressSubcontrols();
    window.fetchPressCategory(true);
  };

  window.onPressPibRegionChange = function (val) { currentPibRegid = val || '3'; window.fetchPressCategory(true); };
  window.onPressMinistryChange = function (val) { currentMinistryId = val || ''; window.fetchPressCategory(true); };
  window.onPressSpaceFilter = function (val) { currentSpaceFilter = val; renderPressSubcontrols(); window.renderPressFeed(); };
  window.onPressPoliceStateChange = function (val) {
    currentPoliceState = val || 'ALL';
    renderPressSubcontrols();
    if (val === 'ALL' || val === 'DELHI' || val === 'KERALA' || val === 'CHANDIGARH') {
      window.fetchPressCategory(true);
    } else {
      pressLiveItems = [];
      pressStatusNotes = [];
      window.renderPressFeed();
    }
  };

  window.fetchPressCategory = async function () {
    const container = document.getElementById('press-feed-container');
    const badge = document.getElementById('press-count-badge');
    const icon = document.getElementById('press-refresh-icon');
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';

    if (icon) icon.classList.add('fa-spin');
    if (badge) badge.textContent = 'Syncing Live...';
    if (container) container.innerHTML = '<div class="text-center py-10 text-xs" style="color: var(--text-sub);"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Fetching live official press releases...</div>';

    await loadCustomPressReleases();
    const collected = [];
    const notes = [];

    try {
      if (currentPressCategory === 'custom') {
        collected.push(...customPressReleases);
      } else if (currentPressCategory === 'all') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib,ed_press,cbi&regid=${encodeURIComponent(currentPibRegid || '3')}&lang=${encodeURIComponent(lang)}&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...customPressReleases);
        if (d?.sources?.pib?.items) collected.push(...d.sources.pib.items);
        if (d?.sources?.ed_press?.items) collected.push(...d.sources.ed_press.items);
        if (d?.sources?.cbi?.items) collected.push(...d.sources.cbi.items);
        if (d?.sources?.pib && !d.sources.pib.ok && d.sources.pib.error) notes.push(`<b>PIB:</b> ${escapeHtml(d.sources.pib.error)}`);
        if (d?.sources?.ed_press && !d.sources.ed_press.ok && d.sources.ed_press.error) notes.push(`<b>ED:</b> ${escapeHtml(d.sources.ed_press.error)}`);
        if (d?.sources?.cbi && !d.sources.cbi.ok && d.sources.cbi.error) notes.push(`<b>CBI:</b> ${escapeHtml(d.sources.cbi.error)}`);
      } else if (currentPressCategory === 'ministries') {
        if (!currentMinistryId) {
          notes.push('<b>Ministries:</b> Live PIB ministries list is unavailable right now. <a href="https://www.pib.gov.in/AllRel.aspx?reg=3&lang=1" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Open PIB Archive ↗</a>');
        } else {
          const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib_ministry&minid=${encodeURIComponent(currentMinistryId)}&_ts=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const d = await res.json();
          const mData = d?.sources?.pib_ministry;
          collected.push(...(mData?.items || []));
          if (mData && !mData.ok) notes.push(`<b>${escapeHtml(mData.ministryName || 'Ministry')}:</b> ${escapeHtml(mData.error || 'No recent releases found')}. <a href="https://www.pib.gov.in/AllRel.aspx?reg=3&lang=1" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Open PIB Archive ↗</a>`);
        }
      } else if (currentPressCategory === 'parliament') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=parliament&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...customPressReleases.filter(x => /RAJYA|LOK|PARLIAMENT|SANSAD/i.test(`${x.agency} ${x.department}`)));
        collected.push(...(d?.sources?.rajya_sabha?.items || []));
        collected.push(...(d?.sources?.lok_sabha?.items || []));
        if (!d?.sources?.rajya_sabha?.ok && d?.sources?.rajya_sabha?.error) notes.push(`<b>Rajya Sabha:</b> ${escapeHtml(d.sources.rajya_sabha.error)}`);
        if (!d?.sources?.lok_sabha?.ok && d?.sources?.lok_sabha?.error) notes.push(`<b>Lok Sabha:</b> ${escapeHtml(d.sources.lok_sabha.error)}`);
        notes.push(`<b>Parliament Portals:</b> <a href="https://sansad.in/rs" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Rajya Sabha (sansad.in/rs) ↗</a> • <a href="https://sansad.in/ls" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Lok Sabha (sansad.in/ls) ↗</a>`);
      } else if (currentPressCategory === 'sci') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=sci&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...customPressReleases.filter(x => /SUPREME|COURT|SCI/i.test(`${x.agency} ${x.department}`)));
        collected.push(...(d?.sources?.sci?.items || []));
        if (!d?.sources?.sci?.ok) notes.push(`<b>Supreme Court:</b> ${escapeHtml(d?.sources?.sci?.error || 'Unavailable')} — <a href="https://www.sci.gov.in/press-release/" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">sci.gov.in ↗</a>`);
      } else if (currentPressCategory === 'eci') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=eci&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...customPressReleases.filter(x => /ECI|ELECTION/i.test(`${x.agency} ${x.department}`)));
        collected.push(...(d?.sources?.eci?.items || []));
        if (!d?.sources?.eci?.ok && d?.sources?.eci?.error) notes.push(`<b>ECI:</b> ${escapeHtml(d.sources.eci.error)}`);
        notes.push(`<b>Election Commission Direct:</b> <a href="https://www.eci.gov.in/press-releases" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Open ECI Press Releases (eci.gov.in) ↗</a>`);
      } else if (currentPressCategory === 'ed') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=ed_press&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...(d?.sources?.ed_press?.items || []));
        if (!d?.sources?.ed_press?.ok && d?.sources?.ed_press?.error) notes.push(`<b>ED:</b> ${escapeHtml(d.sources.ed_press.error)}`);
      } else if (currentPressCategory === 'cbi') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=cbi&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...(d?.sources?.cbi?.items || []));
        if (!d?.sources?.cbi?.ok && d?.sources?.cbi?.error) notes.push(`<b>CBI:</b> ${escapeHtml(d.sources.cbi.error)}`);
      } else if (currentPressCategory === 'space') {
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=space&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...(d?.sources?.isro?.items || []));
        collected.push(...(d?.sources?.nasa?.items || []));
        collected.push(...(d?.sources?.spacex?.items || []));
        if (d?.sources?.isro && !d.sources.isro.ok) notes.push(`<b>ISRO:</b> ${escapeHtml(d.sources.isro.error || 'Unavailable')}`);
        if (d?.sources?.nasa && !d.sources.nasa.ok) notes.push(`<b>NASA:</b> ${escapeHtml(d.sources.nasa.error || 'Unavailable')}`);
        if (d?.sources?.spacex && !d.sources.spacex.ok) notes.push(`<b>SpaceX:</b> ${escapeHtml(d.sources.spacex.error || 'Unavailable')}`);
      } else if (currentPressCategory === 'police') {
        const st = (currentPoliceState === 'DELHI' || currentPoliceState === 'KERALA' || currentPoliceState === 'CHANDIGARH') ? currentPoliceState : 'ALL';
        const res = await fetch(`${GOV_API_BASE}/api/gov?source=police&state=${encodeURIComponent(st)}&_ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        collected.push(...(d?.sources?.police?.items || []));
        if (d?.sources?.police?.error) notes.push(`<b>State Police Status:</b> ${escapeHtml(d.sources.police.error)}`);
      }

      lastPressSyncAt = Date.now();
    } catch (err) {
      notes.push(`<b>Live Server Error:</b> ${escapeHtml(err.message || 'Unable to reach /api/gov')}`);
    }

    pressLiveItems = collected;
    pressStatusNotes = notes;
    if (icon) icon.classList.remove('fa-spin');
    await window.renderPressFeed();
  };

  window.renderPressFeed = async function () {
    const container = document.getElementById('press-feed-container');
    const badge = document.getElementById('press-count-badge');
    const banner = document.getElementById('press-status-banner');
    if (!container) return;

    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const query = (document.getElementById('press-search-input')?.value || '').trim().toLowerCase();

    let list = [...pressLiveItems];
    if (currentPressCategory === 'space' && currentSpaceFilter !== 'ALL') {
      list = list.filter(it => it.agency === currentSpaceFilter);
    }
    if (currentPressCategory === 'police' && currentPoliceState !== 'ALL') {
      const selObj = STATE_POLICE_PORTALS.find(s => s.key === currentPoliceState);
      list = selObj?.live ? list.filter(it => it.stateName === currentPoliceState) : [];
    }
    if (query) {
      list = list.filter(it => `${it.title} ${it.summary} ${it.department} ${it.agency} ${it.verifiedBy}`.toLowerCase().includes(query));
    }

    if (currentPressCategory !== 'space') {
      list.sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    }

    if (banner) {
      const notes = [...pressStatusNotes];
      if (currentPressCategory === 'police') {
        const selObj = STATE_POLICE_PORTALS.find(s => s.key === currentPoliceState);
        if (selObj && !selObj.live) {
          notes.push(`<b>${escapeHtml(selObj.name)}:</b> This state portal does not publish an open unauthenticated press-release API/table (login/CAPTCHA-gated citizen portal). <a href="${escapeHtml(selObj.url)}" target="_blank" rel="noopener" class="text-blue-500 underline font-bold">Open Official ${escapeHtml(selObj.name)} Portal ↗</a>`);
        }
      }
      banner.innerHTML = notes.join(' • ');
      banner.classList.toggle('hidden', notes.length === 0);
    }

    const syncClock = lastPressSyncAt
      ? new Date(lastPressSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    if (badge) {
      badge.textContent = syncClock
        ? `${list.length} Live • Synced ${syncClock} (12h Auto)`
        : `${list.length} Live Releases`;
    }

    if (list.length === 0) {
      if (currentPressCategory === 'custom') {
        container.innerHTML = `<div class="p-6 rounded-2xl text-center space-y-2 border" style="background-color: var(--bg-sub); border-color: var(--border-color);"><i class="fa-solid fa-file-pdf text-2xl text-amber-500"></i><h4 class="text-xs font-bold" style="color: var(--text-main);">No T&amp;C Custom Press Releases Yet</h4><p class="text-[11px] max-w-md mx-auto" style="color: var(--text-sub);">Upload PDF files to the <b>press-release/</b> folder in your repo root and add entries to <b>press-releases.json</b> — your custom <b>source</b> name will appear automatically.</p></div>`;
      } else {
        container.innerHTML = `<div class="p-6 rounded-2xl text-center space-y-2 border" style="background-color: var(--bg-sub); border-color: var(--border-color);"><i class="fa-solid fa-landmark text-2xl text-blue-500"></i><p class="text-xs font-bold" style="color: var(--text-main);">No live releases returned for this selection right now.</p><p class="text-[11px]" style="color: var(--text-sub);">Click <b>Sync Live</b> to retry immediately or check the official portal links above.</p></div>`;
      }
      return;
    }

    const badgeColors = {
      PIB: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      MINISTRY: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      'RAJYA SABHA': 'bg-rose-500/15 text-rose-500 border-rose-500/30',
      'LOK SABHA': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
      'SUPREME COURT': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      ECI: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      ED: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      CBI: 'bg-red-500/15 text-red-500 border-red-500/30',
      ISRO: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      NASA: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      SPACEX: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      POLICE: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    };

    const cards = await Promise.all(list.slice(0, 45).map(async (item) => {
      const title = await smartTranslate(item.title, lang);
      const timeStr = item.publishedAt ? formatPrettyDate(item.publishedAt) : (item.dateText || 'Official Release');
      const isPdf = Boolean(item.pdfUrl || /\.pdf$/i.test(item.link || ''));
      const storyId = registerNewsStory({
        scope: item.agency || 'OFFICIAL',
        source: item.verifiedBy || item.department,
        title,
        summary: item.summary || title,
        time: timeStr,
        link: item.link,
        pageUrl: item.pageUrl || item.link,
        image: item.image || '',
        isPdf,
        isOfficialDoc: !item.isCustom && item.agency !== 'SPACEX'
      });
      const thumbHtml = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" class="w-16 h-14 sm:w-20 sm:h-16 rounded-xl object-cover border flex-shrink-0" style="border-color: var(--border-color);">`
        : '';

      return `
        <div class="p-3.5 rounded-xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-500/35" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);">
          <div class="flex items-start gap-3 flex-grow min-w-0 cursor-pointer" onclick="openNewsReaderById('${storyId}')">
            ${thumbHtml}
            <div class="min-w-0 flex-grow">
              <div class="flex items-center gap-2 flex-wrap mb-1.5">
                <span class="px-2 py-0.5 rounded text-[9.5px] font-black border uppercase ${badgeColors[item.agency] || 'bg-amber-500/15 text-amber-500 border-amber-500/30'}">${escapeHtml(item.agency)}</span>
                <span class="text-[10px] font-bold" style="color: var(--text-sub);">${escapeHtml(item.department)}</span>
              </div>
              <h4 class="text-xs md:text-sm font-semibold line-clamp-2 hover:text-blue-500 transition-colors" style="color: var(--text-main);">${escapeHtml(title)}</h4>
              <div class="flex items-center gap-3 mt-2 text-[10px]" style="color: var(--text-sub);">
                <span><i class="fa-regular fa-clock mr-1"></i>${escapeHtml(timeStr)}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end md:self-center flex-shrink-0">
            <button type="button" onclick="shareNewsCardById('${storyId}', this)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);" title="Share via T&C News"><i class="fa-solid fa-share-nodes text-blue-500 text-[10px]"></i></button>
            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border border-blue-500/30"><i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-circle-check'} text-[10px]"></i> ${escapeHtml(item.verifiedBy || 'Official')}</a>
          </div>
        </div>
      `;
    }));

    container.innerHTML = cards.join('');
  };

  // 5. Flash Scroller, Headlines (with Photos) & World Highlights (with Photos)
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
          const res = await fetch(`${GOV_API_BASE}/api/news?scope=${s.key}&_ts=${Date.now()}`, { cache: 'no-store' });
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
          const res = await fetch(`${GOV_API_BASE}/api/gov?source=pib,ed_press,cbi&regid=3&lang=${encodeURIComponent(lang)}&_ts=${Date.now()}`, { cache: 'no-store' });
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
              summary: g.summary, time: g.publishedAt ? formatPrettyDate(g.publishedAt) : g.dateText,
              link: g.link, pageUrl: g.link, image: '', isOfficialDoc: true
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
    const feedContainer = document.getElementById('news-feed-container');
    const badge = document.getElementById('news-status-badge');
    const selectedDateStr = document.getElementById('news-date-picker')?.value || REAL_TODAY_DATE;
    const refreshIcon = document.getElementById('refresh-icon');
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    badge.textContent = "Updating...";
    feedContainer.innerHTML = '<div class="text-center py-8 text-xs" style="color: var(--text-sub);"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading stories...</div>';

    try {
      const res = await fetch(`${GOV_API_BASE}/api/news?scope=${scope}&date=${selectedDateStr}&_ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error("API error");
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      let filteredItems = items.filter(item => {
        const pubDate = item.querySelector("pubDate")?.textContent;
        return pubDate ? getLocalDateStr(new Date(pubDate)) === selectedDateStr : false;
      });
      if (filteredItems.length < 10 && selectedDateStr === REAL_TODAY_DATE && items.length > 0) filteredItems = items.slice(0, 24);

      if (filteredItems.length === 0) {
        const scopeLabel = scope === 'local' ? 'Telangana State' : (scope === 'national' ? 'India' : 'World');
        const googleArchiveUrl = `https://www.google.com/search?q=${encodeURIComponent(scopeLabel + ' news ' + selectedDateStr)}&tbm=nws`;
        feedContainer.innerHTML = `<div class="p-6 rounded-xl text-center flex flex-col items-center gap-3" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);"><i class="fa-solid fa-calendar-xmark text-2xl text-amber-500"></i><div><h4 class="text-xs font-bold" style="color: var(--text-main);">No Stories Found for ${selectedDateStr}</h4><p class="text-[11px] mt-1" style="color: var(--text-sub);">No direct RSS records matched this exact date. Check the official news archive source below:</p></div><a href="${googleArchiveUrl}" target="_blank" rel="noopener" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-blue-500 transition-all flex items-center gap-1.5"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Open News Source Archive (${selectedDateStr})</a></div>`;
        badge.textContent = "No Records for Date";
        return;
      }

      const cards = await Promise.all(filteredItems.map(async (item) => {
        const meta = extractRssMeta(item, scope);
        const title = await smartTranslate(meta.rawTitle, lang);
        const storyId = registerNewsStory({
          scope, source: meta.sourceName, title,
          summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
        });
        const thumbHtml = meta.image
          ? `<img src="${escapeHtml(meta.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" class="w-16 h-14 sm:w-20 sm:h-16 rounded-xl object-cover border flex-shrink-0" style="border-color: var(--border-color);">`
          : '';

        return `
          <div class="p-3.5 rounded-xl transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-500/35" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);">
            <div class="flex items-start gap-3 flex-grow min-w-0 cursor-pointer" onclick="openNewsReaderById('${storyId}')">
              ${thumbHtml}
              <div class="min-w-0 flex-grow">
                <h4 class="text-xs md:text-sm font-semibold line-clamp-2 hover:text-blue-500 transition-colors" style="color: var(--text-main);">${escapeHtml(title)}</h4>
                <div class="flex items-center gap-2.5 flex-wrap mt-2 text-[10px]" style="color: var(--text-sub);">
                  <span class="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-bold uppercase">${scope} • ${lang.toUpperCase()}</span>
                  <span><i class="fa-regular fa-clock mr-1"></i>${meta.formattedTime}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 self-end md:self-center flex-shrink-0">
              <button type="button" onclick="shareNewsCardById('${storyId}', this)" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1" style="background-color: var(--bg-card); color: var(--text-main); border-color: var(--border-color);" title="Share via T&C News"><i class="fa-solid fa-share-nodes text-blue-500 text-[10px]"></i></button>
              <a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border border-blue-500/30"><i class="fa-solid fa-circle-check text-[10px]"></i> ${escapeHtml(meta.sourceName)}</a>
            </div>
          </div>
        `;
      }));

      feedContainer.innerHTML = cards.join('');
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
      const res = await fetch(`${GOV_API_BASE}/api/news?scope=world&_ts=${Date.now()}`, { cache: 'no-store' });
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      const cards = await Promise.all(items.slice(0, 3).map(async (item) => {
        const meta = extractRssMeta(item, 'world');
        const title = await smartTranslate(meta.rawTitle, lang);
        const storyId = registerNewsStory({
          scope: 'world', source: meta.sourceName, title,
          summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
        });
        const thumbHtml = meta.image
          ? `<img src="${escapeHtml(meta.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" class="w-12 h-10 rounded-lg object-cover border flex-shrink-0" style="border-color: var(--border-color);">`
          : '';
        return `<button type="button" onclick="openNewsReaderById('${storyId}')" class="text-left p-2.5 rounded-xl text-xs transition-all hover:border-amber-500/40 flex items-center gap-2.5" style="background-color: var(--bg-sub); color: var(--text-main); border: 1px solid var(--border-color);">${thumbHtml}<span class="line-clamp-2 min-w-0">• ${escapeHtml(title)}</span></button>`;
      }));
      container.innerHTML = cards.join('');
    } catch {
      container.innerHTML = '<div class="text-xs" style="color: var(--text-sub);">Highlights loading...</div>';
    }
  };

  // 6. Live ED Proclamations, CBI Red Notices & Missing Persons inside Most Wanted Tab
  async function fetchLiveWantedExtras() {
    await Promise.allSettled([
      (async () => {
        try {
          const res = await fetch(`${GOV_API_BASE}/api/gov?source=ed_proclamation,cbi&_ts=${Date.now()}`, { cache: 'no-store' });
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
      const res = await fetch(`${GOV_API_BASE}/api/missing?source=all&_ts=${Date.now()}`, { cache: 'no-store' });
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

    if (agency === 'MISSING') { renderMissingDirectoryView(); return; }
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

    if (countBadge) countBadge.innerHTML = `<i class="fa-solid fa-shield-halved text-[10px]"></i> ${list.length} Live Missing Records`;

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
    window.fetchPinnedWorldNews();
    window.refreshLiveFlashTicker();
    const pressView = document.getElementById('view-press');
    if (pressInitialized && pressView && !pressView.classList.contains('hidden')) {
      window.manualPressSync();
    } else {
      lastPressSyncAt = 0;
    }
  };

  const origManualRefresh = window.manualHubRefresh;
  window.manualHubRefresh = async function () {
    if (typeof origManualRefresh === 'function') await origManualRefresh();
    const tasks = [window.fetchBulletins(), window.refreshLiveFlashTicker(), fetchLiveWantedExtras()];
    if (pressInitialized) tasks.push(window.manualPressSync());
    await Promise.allSettled(tasks);
  };

  document.addEventListener('DOMContentLoaded', () => {
    injectAddonUI();
    window.fetchBulletins();
    fetchLiveWantedExtras();

    const ensureFlashPlaying = () => {
      const t = document.getElementById('live-flash-track');
      if (t && (typeof isFlashPaused === 'undefined' || !isFlashPaused)) t.classList.remove('ticker-paused');
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        ensureFlashPlaying();
        const pressView = document.getElementById('view-press');
        if (pressInitialized && pressView && !pressView.classList.contains('hidden') && Date.now() - lastPressSyncAt >= PRESS_AUTO_SYNC_MS) {
          window.manualPressSync();
        }
      }
    });
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

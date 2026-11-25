/* T&C News Hub — Bulletins, Apple Reader Pop-Up, Share Links, Flash Fix & Safe Auto-Updater */
(function () {
  window.tcNewsRegistry = window.tcNewsRegistry || {};
  let currentReaderStory = null;
  let bulletinsDataset = [];
  let currentBulletin = null;
  let isBulletinArchiveView = false;

  // 1. Inject mobile-safe hover CSS & modal containers
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
      const readerHtml = `
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
                <span>Open Original Story</span> <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              </a>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', readerHtml);
    }

    if (!document.getElementById('bulletin-modal')) {
      const bulletinModalHtml = `
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
      `;
      document.body.insertAdjacentHTML('beforeend', bulletinModalHtml);
    }

    const newsView = document.getElementById('view-news');
    if (newsView && !document.getElementById('bulletin-home-section')) {
      const cardHtml = `
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
      `;
      const firstCard = newsView.firstElementChild;
      if (firstCard) firstCard.insertAdjacentHTML('afterend', cardHtml);
    }
  }

  // 2. Bulletins Engine (Reads bulletins.json)
  window.fetchBulletins = async function () {
    try {
      const res = await fetch(`./bulletins.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.bulletins) ? data.bulletins : []);
        bulletinsDataset = list;
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

    if (b.pdfUrl) {
      pdfLink.href = b.pdfUrl;
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

    let formattedTime = 'Live Feed';
    if (pubDateStr) {
      const d = new Date(pubDateStr);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const ord = (day > 3 && day < 21) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        formattedTime = `Published at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${day}${ord} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    }

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
    const title = typeof translateText === 'function' ? await translateText(story.title, lang) : story.title;
    let summary = (story.summary && typeof translateText === 'function') ? await translateText(story.summary, lang) : (story.summary || '');
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

  // 4. Upgrade Flash Scroller, Headlines, World Highlights, Language & Refresh
  window.refreshLiveFlashTicker = async function () {
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';
    const scopes = [
      { key: 'local', label: 'TELANGANA', badgeClass: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
      { key: 'national', label: 'INDIA', badgeClass: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
      { key: 'world', label: 'WORLD', badgeClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' }
    ];

    const collected = [];
    await Promise.allSettled(
      scopes.map(async (s) => {
        try {
          const res = await fetch(`https://news-lemon-two.vercel.app/api/news?scope=${s.key}`);
          if (!res.ok) return;
          const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
          const items = Array.from(xml.querySelectorAll('item')).slice(0, 4);
          for (const item of items) {
            const meta = extractRssMeta(item, s.label);
            const title = typeof translateText === 'function' ? await translateText(meta.rawTitle, lang) : meta.rawTitle;
            const storyId = registerNewsStory({
              scope: s.label, source: meta.sourceName, title,
              summary: meta.cleanDesc, time: meta.formattedTime, link: meta.link, image: meta.image
            });
            collected.push({ type: 'news', storyId, label: s.label, badgeClass: s.badgeClass, text: title });
          }
        } catch {}
      })
    );

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
    const feedContainer = document.getElementById('news-feed-container');
    const badge = document.getElementById('news-status-badge');
    const selectedDateStr = document.getElementById('news-date-picker')?.value || REAL_TODAY_DATE;
    const refreshIcon = document.getElementById('refresh-icon');
    const scope = typeof currentScope !== 'undefined' ? currentScope : 'local';
    const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en';

    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    badge.textContent = "Updating...";
    feedContainer.innerHTML = '<div class="text-center py-8 text-xs" style="color: var(--text-sub);"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading stories...</div>';

    try {
      const res = await fetch(`https://news-lemon-two.vercel.app/api/news?scope=${scope}&date=${selectedDateStr}`);
      if (!res.ok) throw new Error("API error");
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      let filteredItems = items.filter(item => {
        const pubDate = item.querySelector("pubDate")?.textContent;
        return pubDate ? getLocalDateStr(new Date(pubDate)) === selectedDateStr : false;
      });

      if (filteredItems.length < 10 && selectedDateStr === REAL_TODAY_DATE && items.length > 0) {
        filteredItems = items.slice(0, 15);
      }

      if (filteredItems.length === 0) {
        const scopeLabel = scope === 'local' ? 'Telangana State' : (scope === 'national' ? 'India' : 'World');
        const googleArchiveUrl = `https://www.google.com/search?q=${encodeURIComponent(scopeLabel + ' news ' + selectedDateStr)}&tbm=nws`;
        feedContainer.innerHTML = `
          <div class="p-6 rounded-xl text-center flex flex-col items-center gap-3" style="background-color: var(--bg-sub); border: 1px solid var(--border-color);">
            <i class="fa-solid fa-calendar-xmark text-2xl text-amber-500"></i>
            <div><h4 class="text-xs font-bold" style="color: var(--text-main);">No Stories Found for ${selectedDateStr}</h4><p class="text-[11px] mt-1" style="color: var(--text-sub);">No direct RSS records matched this exact date. Check the official news archive source below:</p></div>
            <a href="${googleArchiveUrl}" target="_blank" rel="noopener" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-blue-500 transition-all flex items-center gap-1.5"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Open News Source Archive (${selectedDateStr})</a>
          </div>
        `;
        badge.textContent = "No Records for Date";
        return;
      }

      let html = '';
      for (const item of filteredItems) {
        const meta = extractRssMeta(item, scope);
        const title = typeof translateText === 'function' ? await translateText(meta.rawTitle, lang) : meta.rawTitle;
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
      const res = await fetch('https://news-lemon-two.vercel.app/api/news?scope=world');
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      let items = Array.from(xml.querySelectorAll("item"));
      items.sort((a, b) => new Date(b.querySelector("pubDate")?.textContent || 0) - new Date(a.querySelector("pubDate")?.textContent || 0));

      let html = '';
      for (const item of items.slice(0, 3)) {
        const meta = extractRssMeta(item, 'world');
        const title = typeof translateText === 'function' ? await translateText(meta.rawTitle, lang) : meta.rawTitle;
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
  };

  const origManualRefresh = window.manualHubRefresh;
  window.manualHubRefresh = async function () {
    if (typeof origManualRefresh === 'function') await origManualRefresh();
    await Promise.allSettled([window.fetchBulletins(), window.refreshLiveFlashTicker()]);
  };

  // 5. DOM Ready Hooks (Resume Flash on phone return + Open Shared Links)
  document.addEventListener('DOMContentLoaded', () => {
    injectAddonUI();
    window.fetchBulletins();

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
    if (sharedBulletinId) {
      setTimeout(() => window.openBulletinById(sharedBulletinId), 400);
    }
  });
})();

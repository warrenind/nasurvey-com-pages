/* Wrapped in an IIFE: this file and its sibling are loaded as two
   classic <script> tags, and top-level `const` declarations share one
   global lexical scope. Both files declared `root` and `siteUrl`, so the
   second one to load died with "Identifier 'root' has already been
   declared" and never ran. Scoping each file keeps its helpers private. */
(() => {
  const root = window.NASS_ROOT || './';

  function siteUrl(path) {
    return /^(#|mailto:|tel:|https?:|data:)/i.test(path) ? path : root + path.replace(/^\/+/, '');
  }

  const searchRoots = new Map(Object.entries({
    compasses: 'compass',
    forester: 'forest',
    foresters: 'forest',
    forestry: 'forest',
    levels: 'level',
    leveling: 'level',
    levelling: 'level',
    stations: 'station',
    totalstations: 'totalstation',
    tripods: 'tripod',
    theodolites: 'theodolite',
    lasers: 'laser',
    receivers: 'receiver',
    detectors: 'detector',
    batteries: 'battery',
    chargers: 'charger',
    cables: 'cable',
    targets: 'target',
    prisms: 'prism',
    scales: 'scale',
    rods: 'rod',
    mounts: 'mount',
    stands: 'stand',
    books: 'book'
  }));

  function searchTerms(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((word) => searchRoots.get(word) || word);
  }

  function compact(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function buildSearchIndex(text) {
    const source = String(text || '');
    const positions = new Map();
    searchTerms(source).forEach((word, index) => {
      if (!positions.has(word)) positions.set(word, index);
    });
    return { words: [...positions.keys()], positions, compact: compact(source) };
  }

  function makeScorer(rawQuery) {
    const query = String(rawQuery || '').trim().toLowerCase();
    const terms = searchTerms(query);
    const compactTerms = terms.map(compact);
    const needle = compact(query);
    return (index) => {
      let hits = 0;
      let score = 0;
      for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
        const term = terms[termIndex];
        const exactAt = index.positions.get(term);
        let best = exactAt === undefined ? 0 : 120 - Math.min(exactAt, 40);
        if (!best) {
          const termCompact = compactTerms[termIndex];
          for (let wordIndex = 0; wordIndex < index.words.length; wordIndex += 1) {
            const word = index.words[wordIndex];
            let value = 0;
            if (term.length >= 3 && word.startsWith(term)) value = 85;
            else if (term.length >= 4 && word.includes(term)) value = 45;
            if (value) {
              value -= Math.min(index.positions.get(word), 40);
              if (value > best) best = value;
            }
          }
          if (!best && termCompact.length >= 4 && index.compact.includes(termCompact)) best = 35;
        }
        if (best > 0) {
          hits += 1;
          score += best + Math.max(0, 12 - termIndex * 2);
        }
      }
      if (needle.length >= 3 && index.compact.includes(needle)) score += 180;
      return { hits, score, all: terms.length > 0 && hits === terms.length };
    };
  }

  function rankByScore(a, b) {
    return b.match.hits - a.match.hits || b.match.score - a.match.score;
  }

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
  }

  const cards = [...document.querySelectorAll('[data-product]')];
  const cardIndex = new WeakMap();
  const cardMeta = new WeakMap();
  cards.forEach((card) => {
    const categories = (card.dataset.categories || '').split('|').filter(Boolean);
    if (card.dataset.category && !categories.includes(card.dataset.category)) categories.push(card.dataset.category);
    cardIndex.set(card, buildSearchIndex(card.dataset.search));
    cardMeta.set(card, {
      category: (card.dataset.category || '').toLowerCase(),
      categories: new Set(categories.map((value) => value.toLowerCase())),
      facets: {
        brand: new Set((card.dataset.brand || '').split('|').filter(Boolean)),
        condition: new Set((card.dataset.condition || '').split('|').filter(Boolean)),
        category: new Set(categories)
      },
      notAvailable: card.querySelector('.product-image span')?.textContent.trim() === 'Not available'
    });
  });
  const cardImageEntries = cards
    .map((card) => ({ card, img: card.querySelector('[data-card-image]') }))
    .filter((entry) => entry.img);
  const cardImageByCard = new Map(cardImageEntries.map((entry) => [entry.card, entry.img]));
  const imageFocusRadius = 3;
  const imagePrimerRadius = 24;
  let cardImageObserver = null;

  function visibleImageEntries() {
    return cardImageEntries.filter(({ card }) => !card.hidden).sort((left, right) => {
      const a = left.card.getBoundingClientRect();
      const b = right.card.getBoundingClientRect();
      return a.top - b.top || a.left - b.left;
    });
  }

  function imageAnchorIndex(visible) {
    const midpoint = window.innerHeight / 2;
    let anchor = 0;
    let best = Infinity;
    visible.forEach(({ card }, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.bottom) / 2 - midpoint);
      if (distance < best) {
        best = distance;
        anchor = index;
      }
    });
    return anchor;
  }

  if ('IntersectionObserver' in window && cardImageEntries.length) {
    cardImageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = cardImageByCard.get(entry.target);
        if (!img || entry.target.hidden || img.dataset.loadState === 'priority') return;
        const rect = entry.boundingClientRect;
        const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', onScreen ? 'high' : 'low');
        img.dataset.loadState = onScreen ? 'priority' : 'prefetched';
        cardImageObserver.unobserve(entry.target);
      });
    }, { rootMargin: '2000px 0px' });
  }

  function syncCardImageLoading() {
    cardImageEntries.forEach(({ card, img }) => {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('fetchpriority', 'low');
      img.dataset.loadState = 'background';
      if (cardImageObserver) cardImageObserver.unobserve(card);
    });
    const visible = visibleImageEntries();
    const anchor = imageAnchorIndex(visible);
    visible.forEach(({ card, img }, index) => {
      const distance = Math.abs(index - anchor);
      if (distance <= imageFocusRadius) {
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'high');
        img.dataset.loadState = 'priority';
      } else if (distance <= imagePrimerRadius) {
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'low');
        img.dataset.loadState = 'primer';
      } else if (cardImageObserver) {
        cardImageObserver.observe(card);
      }
    });
  }

  function focusCardImages() {
    const visible = visibleImageEntries();
    if (!visible.length) return;
    const anchor = imageAnchorIndex(visible);
    visible.forEach(({ card, img }, index) => {
      if (Math.abs(index - anchor) > imageFocusRadius || img.dataset.loadState === 'priority') return;
      img.setAttribute('loading', 'eager');
      img.setAttribute('fetchpriority', 'high');
      img.dataset.loadState = 'priority';
      cardImageObserver?.unobserve(card);
    });
  }

  const scheduleImageFocus = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (fn) => setTimeout(fn, 16);
  let imageScrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (imageScrollFrame) return;
    imageScrollFrame = scheduleImageFocus(() => {
      imageScrollFrame = 0;
      focusCardImages();
    });
  }, { passive: true });

  syncCardImageLoading();
  window.addEventListener('pageshow', syncCardImageLoading);

  const inputs = [...document.querySelectorAll('.filter-input')];
  const search = document.querySelector('#catalog-search');
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty-state');
  const askTeamHref = empty?.querySelector('a')?.getAttribute('href') || '#';
  const clear = document.querySelector('#clear-filters');
  const includeNotAvailable = document.querySelector('#include-not-available');
  const filterPanel = document.querySelector('.filters');
  const searchLabel = document.querySelector('.search-label');
  const filterToggle = document.querySelector('#filter-toggle');
  const filterBody = document.querySelector('#catalog-filter-body');
  const archivedToggle = includeNotAvailable || (() => {
    if (!filterPanel || !searchLabel) return null;
    const label = document.createElement('label');
    label.className = 'availability-toggle';
    label.innerHTML = '<input id="include-not-available" type="checkbox" checked> Include not available';
    if (filterBody) filterBody.insertAdjacentElement('afterbegin', label);
    else (filterToggle || searchLabel).insertAdjacentElement('afterend', label);
    return label.querySelector('input');
  })();
  // `?category=` is not one of the sidebar facets -- there is no checkbox to show
  // it and nothing that ever cleared it, so a catalog opened from such a link
  // looked locked to a single section. Surface it as a chip that can be removed.
  // The main page groups the fine-grained catalog categories into broad families
  // ("Levels and transits" spans Automatic/Smart-digital levels and Level rods),
  // so the value is a comma-separated list and a product matches any of them.
  const parseCategories = (raw) =>
    String(raw || '').split(',').map((value) => value.trim()).filter(Boolean);
  let categoryQuery = parseCategories(new URLSearchParams(window.location.search).get('category'));

  function inCategory(card, values) {
    const meta = cardMeta.get(card);
    if (!meta) return false;
    return values.some((value) => {
      const target = value.toLowerCase();
      return meta.category === target || meta.categories.has(target);
    });
  }
    // The availability toggle starts checked, so "clear" has to restore that
    // default rather than unchecking it -- unchecking hides the not-available
    // products, so clearing the filters would silently drop results.
    const archivedDefault = archivedToggle ? archivedToggle.checked : false;

  const activeFilters = document.querySelector('#active-filters');

  function stripCategoryParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('category');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function renderCategoryFilter() {
    if (!activeFilters) return;
    activeFilters.textContent = '';
  }

  activeFilters?.addEventListener('click', (event) => {
    return;
  });

  // Category is special: a product exposes one primary `data-category` plus a
  // `data-categories` list (joined with `|`). A facet value can live in either.
  function cardFacetValues(card, key) {
    const values = cardMeta.get(card)?.facets[key];
    return values ? [...values] : (card.dataset[key] || '').split('|').filter(Boolean);
  }

  function currentSelection() {
    return inputs.reduce((filters, input) => {
      const key = input.dataset.filter;
      if (!filters[key]) filters[key] = [];
      if (input.checked) filters[key].push(input.value);
      return filters;
    }, { brand: [], condition: [], category: [] });
  }

  function cardMatch(card, context) {
    if (!context.scorer) return { hits: 0, score: 0, all: true };
    let match = context.cache.get(card);
    if (!match) {
      match = context.scorer(cardIndex.get(card));
      context.cache.set(card, match);
    }
    return match;
  }

  // `skipKey` drops one facet from the test so that facet's options can be
  // evaluated against every *other* active filter (standard faceted search).
  function cardBaseMatches(card, { category, showArchived, selected, skipKey }) {
    const meta = cardMeta.get(card);
    if (!meta) return false;
    const matchesCategory = !category.length || inCategory(card, category);
    if (!matchesCategory || (!showArchived && meta.notAvailable)) return false;
    return Object.entries(selected).every(([key, values]) => {
      if (key === skipKey || !values.length) return true;
      const cell = meta.facets[key] || new Set();
      return values.some((value) => cell.has(value));
    });
  }

  function syncFilterOptions(context) {
    const keys = [...new Set(inputs.map((input) => input.dataset.filter))];
    const available = {};
    keys.forEach((key) => { available[key] = new Set(); });
    cards.forEach((card) => {
      if (context.query && !cardMatch(card, context).all) return;
      keys.forEach((key) => {
        if (!cardBaseMatches(card, { ...context, skipKey: key })) return;
        cardFacetValues(card, key).forEach((value) => available[key].add(value));
      });
    });
    inputs.forEach((input) => {
      const key = input.dataset.filter;
      const label = input.closest('label');
      if (label) label.hidden = !(available[key]?.has(input.value) || input.checked);
    });
  }

  // Product gallery: the main image, its thumbnails, the step buttons and the
  // counter all read from one index, so any way of moving through the photos
  // leaves the rest of the controls in step.
  const productGallery = document.querySelector('[data-product-gallery]');
  if (productGallery) {
    const main = productGallery.querySelector('[data-gallery-main]');
    const thumbs = [...productGallery.querySelectorAll('button[data-gallery-thumb]')];
    const slides = thumbs.length
      ? thumbs.map((thumb) => ({ src: thumb.dataset.galleryThumb, alt: thumb.dataset.galleryAlt || main?.alt || '' }))
      : main
        ? [{ src: main.dataset.galleryThumb || main.src, alt: main.dataset.galleryAlt || main.alt }]
        : [];
    const counter = productGallery.querySelector('[data-gallery-counter]');
    const stage = productGallery.querySelector('.gallery-stage');
    const openButton = productGallery.querySelector('[data-gallery-open]');
    const lightbox = productGallery.querySelector('[data-lightbox]');
    const lightboxImage = lightbox?.querySelector('[data-lightbox-image]');
    const lightboxCounter = lightbox?.querySelector('[data-lightbox-counter]');
    const lightboxStage = lightbox?.querySelector('[data-lightbox-stage]');
    let current = 0;
    let lastFocus = null;
    let touchStart = null;
    const preload = (index) => {
      if (slides.length < 2) return;
      const next = slides[(index + slides.length) % slides.length];
      if (next) new Image().src = next.src;
    };
    const renderLightbox = () => {
      const slide = slides[current];
      if (!slide) return;
      if (lightboxImage && lightboxImage.getAttribute('src') !== slide.src) {
        lightboxImage.style.opacity = '0';
        lightboxImage.src = slide.src;
        if (slide.alt) lightboxImage.alt = slide.alt;
        const fade = () => { lightboxImage.style.opacity = '1'; };
        if (lightboxImage.decode) lightboxImage.decode().then(fade).catch(fade);
        else fade();
      }
      if (lightboxCounter) lightboxCounter.textContent = `${current + 1} / ${slides.length}`;
    };
    const show = (index) => {
      if (!slides.length) return;
      current = (index + slides.length) % slides.length;
      const slide = slides[current];
      if (main) {
        main.style.opacity = '0';
        main.src = slide.src;
        if (slide.alt) main.alt = slide.alt;
        const fade = () => { main.style.opacity = '1'; };
        if (main.decode) main.decode().then(fade).catch(fade);
        else fade();
      }
      if (openButton) openButton.href = slide.src;
      thumbs.forEach((other, i) => {
        other.classList.toggle('active', i === current);
        if (i === current) other.setAttribute('aria-current', 'true');
        else other.removeAttribute('aria-current');
      });
      if (counter) counter.textContent = `${current + 1} / ${slides.length}`;
      preload(current + 1);
      preload(current - 1);
      if (lightbox?.open) renderLightbox();
    };
    const lockPage = (locked) => {
      document.documentElement.classList.toggle('is-lightbox-open', locked);
      document.body.classList.toggle('is-lightbox-open', locked);
    };
    const closeLightbox = () => {
      if (!lightbox?.open) return;
      if (typeof lightbox.close === 'function') lightbox.close();
      else {
        lightbox.removeAttribute('open');
        lockPage(false);
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      }
    };
    const openLightbox = (event) => {
      if (!lightbox || !slides.length) return;
      event?.preventDefault();
      lastFocus = event?.currentTarget || document.activeElement;
      renderLightbox();
      if (typeof lightbox.showModal === 'function') lightbox.showModal();
      else lightbox.setAttribute('open', '');
      lockPage(true);
    };
    openButton?.addEventListener('click', openLightbox);
    thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => show(i)));
    productGallery.querySelector('[data-gallery-step="prev"]')?.addEventListener('click', () => show(current - 1));
    productGallery.querySelector('[data-gallery-step="next"]')?.addEventListener('click', () => show(current + 1));
    stage?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    });
    lightbox?.querySelector('[data-lightbox-step="prev"]')?.addEventListener('click', () => show(current - 1));
    lightbox?.querySelector('[data-lightbox-step="next"]')?.addEventListener('click', () => show(current + 1));
    lightbox?.addEventListener('click', (event) => {
      if (event.target === lightbox || event.target.classList?.contains('lightbox-inner') || event.target.classList?.contains('lightbox-stage') || event.target.closest?.('[data-lightbox-close]')) closeLightbox();
    });
    lightbox?.addEventListener('close', () => {
      lockPage(false);
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    });
    lightbox?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    });
    lightboxStage?.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    lightboxStage?.addEventListener('touchend', (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      const threshold = Math.max(window.innerWidth, window.innerHeight) * 0.08;
      touchStart = null;
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.2) show(current + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  const gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    const galleryImages = [
      { src: siteUrl('/assets/images/survey-image-old.jpeg'), alt: 'Historic surveying work from the NASS archive' },
      { src: siteUrl('/assets/images/polar-theodolite.jpeg'), alt: 'Polar theodolite in the NASS archive' },
      { src: siteUrl('/assets/images/nass-ra-calibration.jpg'), alt: 'NASS repair and calibration equipment' },
      { src: siteUrl('/assets/images/About-NASS.jpg'), alt: 'North American Survey Supply in Northeast Philadelphia' }
    ];
    const galleryImage = gallery.querySelector('img');
    const galleryCount = gallery.querySelector('[data-gallery-count]');
    let galleryIndex = 0;
    let galleryTimer;
    const showGalleryImage = (index) => {
      galleryIndex = (index + galleryImages.length) % galleryImages.length;
      galleryImage.style.transition = 'none';
      galleryImage.style.opacity = '0';
      galleryImage.src = galleryImages[galleryIndex].src;
      galleryImage.alt = galleryImages[galleryIndex].alt;
      void galleryImage.offsetWidth;
      galleryImage.style.transition = '';
      galleryImage.style.opacity = '1';
      if (galleryCount) galleryCount.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
    };
    const startGalleryTimer = (delay) => {
      window.clearInterval(galleryTimer);
      galleryTimer = window.setInterval(() => {
        showGalleryImage(galleryIndex + 1);
        startGalleryTimer(8000);
      }, delay);
    };
    const handleGalleryNav = (index) => {
      showGalleryImage(index);
      startGalleryTimer(16000);
    };
    gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', () => handleGalleryNav(galleryIndex - 1));
    gallery.querySelector('[data-gallery-next]')?.addEventListener('click', () => handleGalleryNav(galleryIndex + 1));
    startGalleryTimer(8000);
  }

  function applyFilters(context) {
    if (!cards.length) return;
    const { rawQuery, query } = context;
    const exact = [];
    const close = [];
    let stateChanged = false;
    cards.forEach((card) => {
      if (!card.hidden) { card.hidden = true; stateChanged = true; }
      if (card.style.order !== '') { card.style.order = ''; stateChanged = true; }
      if (card.dataset.recommended) delete card.dataset.recommended;
      if (!cardBaseMatches(card, context)) return;
      if (!query) {
        exact.push({ card, match: { hits: 0, score: 0 } });
        return;
      }
      const match = cardMatch(card, context);
      if (match.all) exact.push({ card, match });
      else if (match.hits) close.push({ card, match });
    });
    let shown = exact;
    let fallback = false;
    if (!shown.length && query && close.length) {
      shown = close.sort(rankByScore).slice(0, 8);
      fallback = true;
      shown.forEach(({ card }) => { card.dataset.recommended = 'true'; });
    }
    shown.forEach(({ card, match }) => {
      if (card.hidden) { card.hidden = false; stateChanged = true; }
      const order = query ? String(Math.max(0, 1000 - Math.min(match.score, 999))) : '';
      if (card.style.order !== order) { card.style.order = order; stateChanged = true; }
    });
    const visible = shown.length;
    if (count) count.textContent = visible;
    if (empty) {
      empty.hidden = query ? !(visible === 0 || fallback) : visible !== 0;
      const emptyTitle = empty.querySelector('#empty-title');
      const emptyCopy = empty.querySelector('#empty-copy');
      if (emptyTitle) emptyTitle.textContent = query ? `No exact matches for “${rawQuery}”.` : 'No equipment matches those filters.';
      if (emptyCopy) {
        if (fallback) emptyCopy.innerHTML = 'Closest results are shown above. Try a wider term or <a href="' + askTeamHref + '">ask the team</a>.';
        else if (query) emptyCopy.innerHTML = 'Try a wider term, clear a filter, or <a href="' + askTeamHref + '">ask the team</a>.';
        else emptyCopy.innerHTML = 'Clear a filter or <a href="' + askTeamHref + '">ask the team</a>.';
      }
    }
    if (stateChanged) syncCardImageLoading();
  }

  // Recompute both the grid and the sidebar at once so options only ever offer
  // values that still lead to a product under the current selection.
  function updateCatalog() {
    const rawQuery = (search?.value || '').trim();
    const query = rawQuery.toLowerCase();
    const context = {
      rawQuery,
      query,
      scorer: query ? makeScorer(query) : null,
      cache: new WeakMap(),
      category: categoryQuery,
      showArchived: archivedToggle?.checked || false,
      selected: currentSelection(),
      skipKey: null
    };
    applyFilters(context);
    syncFilterOptions(context);
  }

  // Long filter lists (brands, and the fine-grained categories) start folded.
  // Collapsing is visual only: every input stays in the DOM, so a value reached
  // by URL or by filtering still works and `syncFilterOptions` keeps hiding rows.
  document.querySelectorAll('[data-filter-more-toggle]').forEach((button) => {
    const wrapper = button.previousElementSibling;
    if (!wrapper || !wrapper.matches('[data-filter-more]')) return;
    const moreLabel = button.textContent.trim();
    button.dataset.moreLabel = moreLabel;
    wrapper.hidden = true;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      wrapper.hidden = open;
      button.textContent = open ? button.dataset.moreLabel : 'Show fewer';
    });
  });

  document.documentElement.classList.add('js');
  if (filterToggle && filterBody) filterPanel?.classList.add('is-collapsed');
  filterToggle?.addEventListener('click', () => {
    if (!filterBody) return;
    const open = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', String(!open));
    filterToggle.textContent = open ? 'Show filters' : 'Hide filters';
    filterBody.classList.toggle('is-open', !open);
    filterPanel?.classList.toggle('is-collapsed', open);
  });

  inputs.forEach((input) => input.addEventListener('change', updateCatalog));
  search?.addEventListener('input', updateCatalog);
  clear?.addEventListener('click', () => {
    inputs.forEach((input) => { input.checked = false; });
    if (search) search.value = '';
    if (archivedToggle) archivedToggle.checked = archivedDefault;
    // Clear means clear: an unreadable `?category=` would otherwise survive and
    // leave the sidebar empty of options to click.
    categoryQuery = [];
    stripCategoryParam();
    renderCategoryFilter();
    updateCatalog();
  });

  archivedToggle?.addEventListener('change', updateCatalog);

  const query = new URLSearchParams(window.location.search);
  ['brand', 'condition'].forEach((key) => {
    const value = query.get(key);
    const input = inputs.find((item) => item.dataset.filter === key && item.value === value);
    if (input) input.checked = true;
  });
  renderCategoryFilter();
  updateCatalog();

  // Field notes: search, tag filter chips, and "show more" paging.
  const noteCards = [...document.querySelectorAll('[data-note]')];
  const noteIndex = new WeakMap();
  noteCards.forEach((card) => noteIndex.set(card, buildSearchIndex(card.dataset.search)));
  if (noteCards.length) {
    const noteSearch = document.querySelector('#notes-search');
    const noteCount = document.querySelector('#notes-count');
    const notesEmpty = document.querySelector('#notes-empty');
    const noteMore = document.querySelector('#note-more');
    const tagFilters = document.querySelector('#notes-tag-filters');
    const PAGE = 15;
    let limit = PAGE;
    let matched = 0;

    // Build one toggle chip per unique group found on the cards, in document order.
    const groups = [];
    noteCards.forEach((card) => {
      const value = (card.dataset.group || '').trim();
      if (value && !groups.includes(value)) groups.push(value);
    });
    const chips = [];
    if (tagFilters && groups.length) {
      groups.forEach((value) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip';
        chip.textContent = value;
        chip.setAttribute('aria-pressed', 'false');
        tagFilters.appendChild(chip);
        chips.push(chip);
      });
    }

    function syncChips() {
      const q = (noteSearch?.value || '').trim().toLowerCase();
      chips.forEach((chip) => {
        const active = chip.textContent.trim().toLowerCase() === q;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
    }

    function showNotes() {
      let shown = 0;
      noteCards.forEach((card) => {
        const show = card.matched && shown < limit;
        card.hidden = !show;
        if (show) shown += 1;
      });
      if (noteMore) noteMore.hidden = matched <= limit;
    }

    function filterNotes() {
      const rawQuery = (noteSearch?.value || '').trim();
      const q = rawQuery.toLowerCase();
      const scorer = q ? makeScorer(q) : null;
      const exact = [];
      const close = [];
      limit = PAGE;
      noteCards.forEach((card) => {
        card.matched = false;
        card.style.order = '';
        delete card.dataset.recommended;
        if (!q) {
          exact.push({ card, match: { hits: 0, score: 0 } });
          return;
        }
        const match = scorer(noteIndex.get(card));
        if (match.all) exact.push({ card, match });
        else if (match.hits) close.push({ card, match });
      });
      let results = exact;
      let fallback = false;
      if (!results.length && q && close.length) {
        results = close.sort(rankByScore).slice(0, 6);
        fallback = true;
        results.forEach(({ card }) => { card.dataset.recommended = 'true'; });
      }
      results.forEach(({ card, match }) => {
        card.matched = true;
        if (q) card.style.order = String(Math.max(0, 1000 - Math.min(match.score, 999)));
      });
      matched = results.length;
      showNotes();
      if (noteCount) noteCount.textContent = matched;
      if (notesEmpty) {
        notesEmpty.hidden = q ? !(matched === 0 || fallback) : matched !== 0;
        const emptyTitle = notesEmpty.querySelector('#notes-empty-title');
        const emptyCopy = notesEmpty.querySelector('#notes-empty-copy');
        if (emptyTitle) emptyTitle.textContent = q ? `No exact field-note matches for “${rawQuery}”.` : 'No field notes match.';
        if (emptyCopy) emptyCopy.innerHTML = fallback ? 'Closest notes are shown below. Try a wider term, like <em>level</em>, <em>telescope</em>, or <em>calibration</em>.' : 'Try a wider term, like <em>level</em>, <em>telescope</em>, or <em>calibration</em>.';
      }
      syncChips();
    }

    noteSearch?.addEventListener('input', () => { limit = PAGE; filterNotes(); });
    noteMore?.addEventListener('click', () => { limit *= 2; showNotes(); });

    noteCards.forEach((card) => {
      const tag = card.querySelector('.note-tag');
      if (tag) tag.addEventListener('click', (e) => {
        e.preventDefault();
        if (noteSearch) { noteSearch.value = (tag.textContent || '').trim(); limit = PAGE; filterNotes(); }
        noteSearch?.focus();
      });
    });

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!noteSearch) return;
        const label = chip.textContent.trim();
        const isActive = chip.classList.contains('is-active');
        noteSearch.value = isActive ? '' : label;
        limit = PAGE;
        filterNotes();
        if (!isActive) noteSearch.focus();
      });
    });

    filterNotes();
  }
})();

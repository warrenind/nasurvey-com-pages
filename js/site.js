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
  const inputs = [...document.querySelectorAll('.filter-input')];
  const search = document.querySelector('#catalog-search');
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('#empty-state');
  const clear = document.querySelector('#clear-filters');
  const includeNotAvailable = document.querySelector('#include-not-available');
  const filterPanel = document.querySelector('.filters');
  const searchLabel = document.querySelector('.search-label');
  const archivedToggle = includeNotAvailable || (() => {
    if (!filterPanel || !searchLabel) return null;
    const label = document.createElement('label');
    label.className = 'availability-toggle';
    label.innerHTML = '<input id="include-not-available" type="checkbox" checked> Include not available';
    searchLabel.insertAdjacentElement('afterend', label);
    return label.querySelector('input');
  })();
  // `?category=` is not one of the sidebar facets -- there is no checkbox to show
  // it and nothing that ever cleared it, so a catalog opened from such a link
  // looked locked to a single section. Surface it as a chip that can be removed.
  let categoryQuery = new URLSearchParams(window.location.search).get('category');

  function inCategory(card, value) {
    const target = value.toLowerCase();
    return (card.dataset.category || '').toLowerCase() === target
      || (card.dataset.categories || '').toLowerCase().split('|').includes(target);
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

  const norm = (s) => s.replace(/[^a-z0-9]+/g, '');

  // Category is special: a product exposes one primary `data-category` plus a
  // `data-categories` list (joined with `|`). A facet value can live in either.
  function cardFacetValues(card, key) {
    if (key === 'category') {
      const values = (card.dataset.categories || '').split('|').filter(Boolean);
      if (card.dataset.category && !values.includes(card.dataset.category)) values.push(card.dataset.category);
      return values;
    }
    return (card.dataset[key] || '').split('|');
  }

  function currentSelection() {
    return inputs.reduce((filters, input) => {
      const key = input.dataset.filter;
      if (!filters[key]) filters[key] = [];
      if (input.checked) filters[key].push(input.value);
      return filters;
    }, { brand: [], condition: [], category: [] });
  }

  // `skipKey` drops one facet from the test so that facet's options can be
  // evaluated against every *other* active filter (standard faceted search).
  function cardMatches(card, { query, category, showArchived, selected, skipKey }) {
    const s = card.dataset.search.toLowerCase();
    const matchesSearch = !query || s.includes(query) || norm(s).includes(norm(query));
    const matchesCategory = !category || inCategory(card, category);
    const isNotAvailable = card.querySelector('.product-image span')?.textContent.trim() === 'Not available';
    if (!matchesSearch || !matchesCategory || (!showArchived && isNotAvailable)) return false;
    return Object.entries(selected).every(([key, values]) => {
      if (key === skipKey || !values.length) return true;
      const cell = cardFacetValues(card, key);
      return values.some((value) => cell.includes(value));
    });
  }

  function syncFilterOptions() {
    const context = {
      query: (search?.value || '').trim().toLowerCase(),
      category: categoryQuery,
      showArchived: archivedToggle?.checked || false,
      selected: currentSelection(),
      skipKey: null
    };
    inputs.forEach((input) => {
      const key = input.dataset.filter;
      const available = cards.some((card) => cardMatches(card, { ...context, skipKey: key })
        && cardFacetValues(card, key).includes(input.value));
      const label = input.closest('label');
      if (label) label.hidden = !(available || input.checked);
    });
  }

  const galleryMain = document.querySelector('[data-gallery-main]');
  const galleryThumbs = [...document.querySelectorAll('[data-gallery-thumb]')];
  if (galleryMain && galleryThumbs.length) {
    galleryThumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        galleryMain.src = thumb.dataset.galleryThumb;
        galleryThumbs.forEach((other) => other.classList.toggle('active', other === thumb));
      });
    });
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

  function applyFilters() {
    if (!cards.length) return;
    const context = {
      query: (search?.value || '').trim().toLowerCase(),
      category: categoryQuery,
      showArchived: archivedToggle?.checked || false,
      selected: currentSelection(),
      skipKey: null
    };
    let visible = 0;
    cards.forEach((card) => {
      const show = cardMatches(card, context);
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (count) count.textContent = visible;
    if (empty) empty.hidden = visible !== 0;
  }

  // Recompute both the grid and the sidebar at once so options only ever offer
  // values that still lead to a product under the current selection.
  function updateCatalog() {
    applyFilters();
    syncFilterOptions();
  }

  inputs.forEach((input) => input.addEventListener('change', updateCatalog));
  search?.addEventListener('input', updateCatalog);
  clear?.addEventListener('click', () => {
    inputs.forEach((input) => { input.checked = false; });
    if (search) search.value = '';
    if (archivedToggle) archivedToggle.checked = archivedDefault;
    // Clear means clear: an unreadable `?category=` would otherwise survive and
    // leave the sidebar empty of options to click.
    categoryQuery = '';
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
      const q = (noteSearch?.value || '').trim().toLowerCase();
      matched = 0;
      noteCards.forEach((card) => {
        card.matched = !q || card.dataset.search.toLowerCase().includes(q);
        if (card.matched) matched += 1;
      });
      showNotes();
      if (noteCount) noteCount.textContent = matched;
      if (notesEmpty) notesEmpty.hidden = matched !== 0;
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

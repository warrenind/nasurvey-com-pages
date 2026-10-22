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
  // The main page groups the fine-grained catalog categories into broad families
  // ("Levels and transits" spans Automatic/Smart-digital levels and Level rods),
  // so the value is a comma-separated list and a product matches any of them.
  const parseCategories = (raw) =>
    String(raw || '').split(',').map((value) => value.trim()).filter(Boolean);
  let categoryQuery = parseCategories(new URLSearchParams(window.location.search).get('category'));

  function inCategory(card, values) {
    const primary = (card.dataset.category || '').toLowerCase();
    const list = (card.dataset.categories || '').toLowerCase().split('|');
    return values.some((value) => {
      const target = value.toLowerCase();
      return primary === target || list.includes(target);
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
    const matchesCategory = !category.length || inCategory(card, category);
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

  // Product gallery: the main image, its thumbnails, the step buttons and the
  // counter all read from one index, so any way of moving through the photos
  // leaves the rest of the controls in step.
  const productGallery = document.querySelector('[data-product-gallery]');
  if (productGallery) {
    const main = productGallery.querySelector('[data-gallery-main]');
    const thumbs = [...productGallery.querySelectorAll('[data-gallery-thumb]')];
    const counter = productGallery.querySelector('[data-gallery-counter]');
    const stage = productGallery.querySelector('.gallery-stage');
    let current = 0;
    const preload = (index) => {
      const next = thumbs[(index + thumbs.length) % thumbs.length];
      if (next) new Image().src = next.dataset.galleryThumb;
    };
    const show = (index) => {
      if (!thumbs.length) return;
      current = (index + thumbs.length) % thumbs.length;
      const thumb = thumbs[current];
      if (main) {
        main.style.opacity = '0';
        main.src = thumb.dataset.galleryThumb;
        if (thumb.dataset.galleryAlt) main.alt = thumb.dataset.galleryAlt;
        const fade = () => { main.style.opacity = '1'; };
        if (main.decode) main.decode().then(fade).catch(fade);
        else fade();
      }
      thumbs.forEach((other, i) => {
        other.classList.toggle('active', i === current);
        if (i === current) other.setAttribute('aria-current', 'true');
        else other.removeAttribute('aria-current');
      });
      if (counter) counter.textContent = `${current + 1} / ${thumbs.length}`;
      preload(current + 1);
      preload(current - 1);
    };
    thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => show(i)));
    productGallery.querySelector('[data-gallery-step="prev"]')?.addEventListener('click', () => show(current - 1));
    productGallery.querySelector('[data-gallery-step="next"]')?.addEventListener('click', () => show(current + 1));
    stage?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
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

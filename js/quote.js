/* Wrapped in an IIFE: this file and its sibling are loaded as two
   classic <script> tags, and top-level `const` declarations share one
   global lexical scope. Both files declared `root` and `siteUrl`, so the
   second one to load died with "Identifier 'root' has already been
   declared" and never ran. Scoping each file keeps its helpers private. */
(() => {
  const QUOTE_KEY = 'nass-quote-v1';
  const root = window.NASS_ROOT || './';

  function siteUrl(path) {
    return /^(#|mailto:|tel:|https?:|data:)/i.test(path) ? path : root + path.replace(/^\/+/, '');
  }

  // Product titles are interpolated into this file's HTML templates, and a few
  // contain "&", so anything landing in an attribute or text node goes via here.
  function escText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readQuote() {
    try {
      const raw = localStorage.getItem(QUOTE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => {
        if (typeof entry === 'string') return { slug: entry, qty: 1 };
        const qty = Number(entry && entry.qty);
        return { slug: entry && entry.slug ? entry.slug : '', qty: Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1 };
      }).filter((item) => item.slug);
    } catch (err) {
      return [];
    }
  }

  function writeQuote(list) {
    try {
      localStorage.setItem(QUOTE_KEY, JSON.stringify(list));
    } catch (err) {
      /* storage unavailable — keep in memory only */
    }
  }

  function quoteMap() {
    const map = new Map();
    readQuote().forEach((item) => map.set(item.slug, item.qty));
    return map;
  }

  function quoteTotal() {
    return readQuote().reduce((sum, item) => sum + (item.qty || 1), 0);
  }

  function updateQuoteBadges(total) {
    document.querySelectorAll('[data-quote-count]').forEach((badge) => {
      badge.textContent = total;
      badge.hidden = total === 0;
    });
  }

  function renderQuoteDropdown() {
    const dropdown = document.getElementById('quote-dropdown');
    if (!dropdown) return;
    const qm = quoteMap();
    const names = window.NASS_CATALOG || [];
    const list = [...qm.keys()].map((slug) => names.find((product) => product.slug === slug))
      .filter(Boolean).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    const itemsEl = dropdown.querySelector('[data-quote-items]');
    if (itemsEl) {
      itemsEl.innerHTML = list.map((product) => `
        <div class="quote-dd-item" data-quote-dd-item="${product.slug}">
          <a class="quote-dd-link" href="${siteUrl(product.href || '/products/' + product.slug + '/')}">${product.title}</a>
          <span class="quote-dd-qty" aria-label="quantity ${qm.get(product.slug)}">${qm.get(product.slug)}</span>
          <button class="quote-dd-remove" type="button" data-quote-remove="${product.slug}" aria-label="Remove ${product.title}">Remove</button>
        </div>
      `).join('') || '<p class="quote-dd-empty">Your quote list is empty.</p>';
    }
    const countBadge = dropdown.querySelector('[data-quote-dd-count]');
    if (countBadge) countBadge.textContent = quoteTotal();
    dropdown.hidden = qm.size === 0;
    if (dropdown.hidden) dropdown.classList.remove('is-open');
  }

  function syncQuote() {
    const qm = quoteMap();
    const total = quoteTotal();
    updateQuoteBadges(total);
    renderQuoteDropdown();

    document.querySelectorAll('[data-quote-add]').forEach((button) => {
      const slug = button.dataset.quoteAdd;
      const added = qm.has(slug);
      button.dataset.added = String(added);
      button.classList.toggle('is-added', added);
const label = button.querySelector('.quote-add-label');
        if (label) label.textContent = added ? `Quote this item (${qm.get(slug)})` : 'Quote this item';
        const stepper = button.closest('[data-quote-stepper]');
        if (stepper) {
          stepper.dataset.added = String(added);
          const readout = stepper.querySelector('[data-quote-readout]');
          if (readout) readout.textContent = `${added ? qm.get(slug) : 0} in your quote`;
        }
      });
  }

  function addToQuote(slug, qty) {
    const qm = quoteMap();
    const amount = Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1;
    qm.set(slug, (qm.get(slug) || 0) + amount);
    appendQuote(qm);
  }

  function setQuoteQty(slug, qty) {
    const qm = quoteMap();
    const amount = Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1;
    if (amount > 0) qm.set(slug, amount);
    else qm.delete(slug);
    appendQuote(qm);
  }

  function removeFromQuote(slug) {
    const qm = quoteMap();
    qm.delete(slug);
    appendQuote(qm);
  }

  function appendQuote(map) {
    const list = [...map.entries()].map(([slug, qty]) => ({ slug, qty }));
    writeQuote(list);
    syncQuote();
    const note = document.querySelector('[data-quote-note]');
    if (note) {
      note.textContent = 'Added to your quote list.';
      note.hidden = false;
    }
  }

  function clearQuote() {
    writeQuote([]);
    syncQuote();
    const note = document.querySelector('[data-quote-note]');
    if (note) {
      note.textContent = 'Quote list cleared.';
      note.hidden = false;
    }
  }

  function catalogProduct(slug) {
    return (window.NASS_CATALOG || []).find((product) => product.slug === slug);
  }

  const catalogJson = document.getElementById('quote-catalog');
  if (catalogJson) {
    window.NASS_CATALOG = JSON.parse(catalogJson.textContent || '[]');
  }

  // One place decides whether the panel is open, so hover, click and keyboard
  // cannot disagree about the state.
  function setDropdownOpen(open) {
    const dropdown = document.getElementById('quote-dropdown');
    const toggle = document.querySelector('[data-quote-dropdown-toggle]');
    if (!dropdown || !toggle) return;
    // An empty quote has nothing to show, so hovering must not reveal an
    // empty panel over the page.
    if (open && quoteMap().size === 0) open = false;
    dropdown.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) renderQuoteDropdown();
  }

  // Hovering opens the panel, but only after a beat so a mouse merely passing
  // over the header does not flash it open. Leaving keeps a grace window so
  // travelling from the button down into the panel — even slowly, even across
  // the gap — never dismisses it mid-move.
  const HOVER_OPEN_MS = 140;
  const HOVER_CLOSE_MS = 360;
  let hoverOpenTimer = null;
  let hoverCloseTimer = null;
  // Set when the pointer deliberately dismisses the panel by clicking the
  // toggle, so the pointer still resting there does not spring it open again.
  let hoverDismissed = false;

  const clearHoverTimers = () => {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    hoverOpenTimer = null;
    hoverCloseTimer = null;
  };
  const scheduleOpen = () => {
    clearHoverTimers();
    if (hoverDismissed) return;
    hoverOpenTimer = setTimeout(() => setDropdownOpen(true), HOVER_OPEN_MS);
  };
  const scheduleClose = () => {
    clearHoverTimers();
    hoverDismissed = false;
    hoverCloseTimer = setTimeout(() => setDropdownOpen(false), HOVER_CLOSE_MS);
  };

  const dropdownToggle = document.querySelector('[data-quote-dropdown-toggle]');
  const dropdownPanel = document.getElementById('quote-dropdown');
  [dropdownToggle, dropdownPanel].forEach((node) => {
    if (!node) return;
    node.addEventListener('pointerenter', scheduleOpen);
    node.addEventListener('pointerleave', scheduleClose);
    // Keyboard users tabbing in should get the panel too.
    node.addEventListener('focusin', scheduleOpen);
    node.addEventListener('focusout', scheduleClose);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!document.getElementById('quote-dropdown')?.classList.contains('is-open')) return;
    clearHoverTimers();
    hoverDismissed = true;
    setDropdownOpen(false);
  });

  document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('quote-dropdown');
    if (dropdown) {
      const toggle = event.target.closest('[data-quote-dropdown-toggle]');
      if (toggle) {
        event.preventDefault();
        const open = !dropdown.classList.contains('is-open');
        clearHoverTimers();
        // A click on the toggle while the panel is open is a deliberate
        // dismissal, not an accident, so stop hover from reopening it until
        // the pointer leaves.
        hoverDismissed = open;
        dropdown.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) renderQuoteDropdown();
        return;
      }
      if (dropdown.classList.contains('is-open') && !event.target.closest('#quote-dropdown')) {
        clearHoverTimers();
        hoverDismissed = true;
        dropdown.classList.remove('is-open');
        const btn = document.querySelector('[data-quote-dropdown-toggle]');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    }

    const remove = event.target.closest('[data-quote-remove]');
    if (remove) {
      event.preventDefault();
      removeFromQuote(remove.dataset.quoteRemove);
      return;
    }

    const clearBtn = event.target.closest('[data-quote-clear]');
    if (clearBtn) {
      event.preventDefault();
      clearQuote();
      return;
    }

const add = event.target.closest('[data-quote-add]');
      if (add) {
        event.preventDefault();
        const slug = add.dataset.quoteAdd;
        if (!quoteMap().has(slug)) addToQuote(slug, 1);
        window.location.assign(siteUrl('/quote/'));
        return;
      }

      const goto = event.target.closest('[data-quote-goto]');
      if (goto) {
        event.preventDefault();
        window.location.assign(siteUrl('/quote/'));
        return;
      }

      const related = event.target.closest('[data-quote-related]');
      if (related) {
        const slug = related.value;
        if (!slug) return;
        if (related.checked) addToQuote(slug, 1);
        else removeFromQuote(slug);
        return;
      }

      const stepper = event.target.closest('[data-quote-stepper]');
      if (stepper) {
        const slug = stepper.dataset.quote;
        // The counter is the add/remove control: it starts at 0, so + adds this
        // product to the quote and - takes one off, dropping it entirely at 0.
        const step = (delta) => () => {
          const next = (Number(quoteMap().get(slug) || 0) || 0) + delta;
          if (next < 0) return;
          if (next === 0) removeFromQuote(slug);
          else setQuoteQty(slug, next);
        };
        if (event.target.matches('[data-quote-step="up"]')) step(1)();
        else if (event.target.matches('[data-quote-step="down"]')) step(-1)();
        return;
      }
    });

  const quoteList = document.getElementById('quote-list');
  if (quoteList) {
    const countEl = document.getElementById('quote-count');
    const emptyEl = document.getElementById('quote-empty');
    const itemsEl = document.getElementById('quote-items');

    function renderQuote() {
      const qm = quoteMap();
      const list = [...qm.keys()];
      const products = list.map(catalogProduct).filter(Boolean);
      const missing = list.filter((slug) => !catalogProduct(slug));
      quoteList.innerHTML = products.map((product) => `
        <article class="quote-item" data-quote-item="${product.slug}">
          <a class="quote-item-image" href="${siteUrl(product.href)}"><img src="${siteUrl(product.image)}" alt="${product.title}"></a>
          <div class="quote-item-body">
            <p class="quote-item-kicker">${product.brand || ''} / ${product.category || 'Equipment'}</p>
            <h2><a href="${siteUrl(product.href)}">${product.title}</a></h2>
            <p class="model">${product.model ? 'Model ' + product.model : ''}</p>
            <div class="quote-qty-field">
              <span class="quote-qty-caption" id="qtycap-${product.slug}">Quantity</span>
              <span class="quote-qty-control">
                <button class="quote-page-step" type="button" data-quote-page-step="down" data-quote-page-slug="${product.slug}" aria-label="Decrease quantity of ${escText(product.title)}"${Number(qm.get(product.slug)) <= 1 ? ' disabled' : ''}>&#8722;</button>
                <input type="number" min="1" step="1" value="${qm.get(product.slug)}" data-quote-page-qty="${product.slug}" aria-labelledby="qtycap-${product.slug}">
                <button class="quote-page-step" type="button" data-quote-page-step="up" data-quote-page-slug="${product.slug}" aria-label="Increase quantity of ${escText(product.title)}">+</button>
              </span>
            </div>
          </div>
          <button class="quote-remove button-light" type="button" data-quote-remove="${product.slug}">Remove</button>
        </article>`).join('') + (missing.length ? `<p class="form-note">Some saved items are no longer in the catalog and were left off this list.</p>` : '');
      const total = quoteTotal();
      if (countEl) countEl.textContent = list.length;
      if (emptyEl) emptyEl.hidden = list.length !== 0;
      if (quoteList) quoteList.hidden = list.length === 0;
      if (itemsEl) itemsEl.value = qtyListCSV();
      updateQuoteBadges(total);
    }

    function qtyListCSV() {
      return [...quoteMap().entries()].map(([slug, qty]) => `${slug}:${qty}`).join(', ');
    }

    quoteList.addEventListener('change', (event) => {
      const input = event.target.closest('[data-quote-page-qty]');
      if (!input) return;
      const slug = input.dataset.quotePageQty;
      setQuoteQty(slug, Number(input.value));
      renderQuote();
      // renderQuote() rebuilds the list, so put the caret back where it was.
      quoteList.querySelector(`[data-quote-page-qty="${CSS.escape(slug)}"]`)?.focus();
    });

    quoteList.addEventListener('click', (event) => {
      // The +/- buttons change the stored quantity without re-rendering, so the
      // button you pressed keeps focus and repeated tapping just works.
      const stepBtn = event.target.closest('[data-quote-page-step]');
      if (stepBtn) {
        const row = stepBtn.closest('[data-quote-item]');
        const input = row?.querySelector('[data-quote-page-qty]');
        if (!input) return;
        const current = Number(input.value) || 1;
        const next = current + (stepBtn.dataset.quotePageStep === 'up' ? 1 : -1);
        if (next < 1) return;
        input.value = next;
        // The - button is disabled at render time, and this path deliberately
        // avoids re-rendering, so refresh it here or it stays stale.
        const down = row.querySelector('[data-quote-page-step="down"]');
        if (down) down.disabled = next <= 1;
        setQuoteQty(stepBtn.dataset.quotePageSlug, next);
        return;
      }
      const button = event.target.closest('[data-quote-remove]');
      if (!button) return;
      removeFromQuote(button.dataset.quoteRemove);
      renderQuote();
    });

    const clearEl = document.getElementById('quote-clear');
    clearEl?.addEventListener('click', () => {
      clearQuote();
      renderQuote();
    });

    const form = document.getElementById('quote-form');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = form.querySelector('.form-status');
        const formData = new FormData(form);
        formData.append('quoted_items', qtyListCSV());

        const original = submitBtn.textContent + ' ' + (submitBtn.dataset.quoteLabel || '');
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        status.textContent = '';
        try {
          const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            body: formData
          });
          const data = await response.json();
          if (response.ok && data.success) {
            status.textContent = 'Sent! We will be in touch shortly.';
            status.classList.add('success');
            form.reset();
            writeQuote([]);
            syncQuote();
          } else {
            status.textContent = 'Something went wrong — please email sales@nasurvey.com instead.';
            status.classList.add('error');
          }
        } catch (error) {
          status.textContent = 'Something went wrong — please email sales@nasurvey.com instead.';
          status.classList.add('error');
        } finally {
          submitBtn.textContent = original;
          submitBtn.disabled = false;
        }
      });
    }

    renderQuote();
  }

  syncQuote();
})();

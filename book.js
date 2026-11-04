/* Chronicle interactions only. Data and Supabase live in party-room.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const trigger = $('hamburgerBtn');
  const modal = $('drawer');
  const overlay = $('drawerOverlay');
  const close = $('drawerClose');
  const previous = $('pagePrev');
  const next = $('pageNext');
  const toc = $('bookSessionList');
  const menu = $('chronicleMenuPage');
  const tocToggle = $('chronicleTocToggle');
  const leaf = $('chronicleTurnLeaf');
  let lastFocus = null;
  let transitionToken = 0;
  if (!trigger || !modal || !overlay || !close || !previous || !next || !toc) {
    console.error('Chronicle elements missing from party.html');
    return;
  }

  function openBook() {
    if (modal.classList.contains('open')) return;
    transitionToken++;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('book-open');
    modal.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      modal.classList.add('open');
      overlay.classList.add('open');
    });
    window.dispatchEvent(new CustomEvent('ff:book-open'));
    window.setTimeout(() => close.focus(), 280);
  }

  function closeBook() {
    if (!modal.classList.contains('open')) return;
    const token = ++transitionToken;
    modal.classList.remove('open');
    overlay.classList.remove('open');
    menu && menu.classList.remove('show-contents');
    modal.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('book-open');
    window.setTimeout(() => {
      if (token === transitionToken && !modal.classList.contains('open')) {
        overlay.hidden = true;
      }
    }, 360);
    window.dispatchEvent(new CustomEvent('ff:book-close'));
    (lastFocus && lastFocus.isConnected ? lastFocus : trigger).focus();
  }

  trigger.addEventListener('click', openBook);
  close.addEventListener('click', closeBook);
  overlay.addEventListener('click', closeBook);
  $('drawerLogout')?.addEventListener('click', () => signOutAndRedirect());
  tocToggle?.addEventListener('click', () => {
    const showing = menu.classList.toggle('show-contents');
    tocToggle.setAttribute('aria-expanded', String(showing));
  });
  previous.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ff:book-control', {detail:{direction:-1}})));
  next.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ff:book-control', {detail:{direction:1}})));

  document.addEventListener('keydown', event => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (menu?.classList.contains('show-contents')) {
        menu.classList.remove('show-contents');
        tocToggle?.setAttribute('aria-expanded', 'false');
      } else closeBook();
      return;
    }
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('ff:book-control', {
        detail: { direction: event.key === 'ArrowLeft' ? -1 : 1 }
      }));
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(modal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])'))
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus(); event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus(); event.preventDefault();
      }
    }
  });

  window.addEventListener('ff:book-data', event => {
    const data = event.detail || {};
    const chapters = Array.isArray(data.sessions) ? data.sessions : [];
    const index = Number.isInteger(data.index) ? data.index : 0;
    const total = chapters.length;
    previous.disabled = total === 0 || index <= 0;
    next.disabled = total === 0 || index >= total - 1;
    $('pageIndicator').textContent = total ? 'Session ' + (index + 1) + ' of ' + total : 'No sessions';
    toc.replaceChildren();
    chapters.forEach((session, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      if (i === index) button.setAttribute('aria-current', 'page');
      const label = document.createElement('span');
      label.textContent = session.title || 'Session ' + (i + 1);
      const number = document.createElement('span');
      number.textContent = String(i + 1).padStart(2, '0');
      button.append(label, number);
      button.addEventListener('click', () => {
        menu?.classList.remove('show-contents');
        tocToggle?.setAttribute('aria-expanded', 'false');
        window.dispatchEvent(new CustomEvent('ff:book-go', { detail: { index: i } }));
      });
      toc.appendChild(button);
    });
  });

  window.addEventListener('ff:book-turn', event => {
    const oldPage = $('notebookPage');
    if (!oldPage || !leaf) return;
    leaf.className = 'chronicle-turn-leaf active' +
      (event.detail?.direction < 0 ? ' backward' : '');
    const copy = leaf.querySelector('.chronicle-turn-copy');
    if (copy) copy.innerHTML = oldPage.innerHTML;
    void leaf.offsetWidth;
    requestAnimationFrame(() => leaf.classList.add('flipping'));
    window.setTimeout(() => {
      leaf.className = 'chronicle-turn-leaf';
      if (copy) copy.replaceChildren();
    }, 730);
  });
})();

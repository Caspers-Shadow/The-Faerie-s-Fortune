/* The Faerie's Fortune: physical chronicle animation and navigation.
 * The same closed cover now travels to the desk centre BEFORE its hinge opens.
 * The session data and edit rules are maintained separately in party-room.js.
 */
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
  const tocToggle = $('chronicleTocToggle');
  const book = $('chronicleBook');
  const cover = book?.querySelector('.chronicle-cover');
  const leaf = $('chronicleTurnLeaf');
  if (![trigger,modal,overlay,close,previous,next,toc,tocToggle,book,cover,leaf].every(Boolean)) {
    console.error('Chronicle markup is incomplete.');
    return;
  }
  // Keep these in sync with chronicle.css. The move and hinge are distinct stages.
  const FLIGHT_MS = 1350;
  const HINGE_MS = 2380;
  const FADE_MS = 350;
  const motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let currentState = 'closed'; // closed | opening | open | closing
  let motionId = 0;
  let ghost = null;
  let ghostMotion = null;
  let lastFocus = trigger;

  book.classList.add('is-closed');
  modal.classList.remove('is-ready');

  function resetGhost() {
    try { ghostMotion?.cancel(); } catch (_) {}
    ghostMotion = null;
    if (ghost) ghost.remove();
    ghost = null;
  }

  function createTravellingCover(bounds) {
    resetGhost();
    // The flight cover uses the *same* ornamental styling as the resting book,
    // so the object does not visually teleport into a different shape.
    ghost = trigger.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.removeAttribute('aria-controls');
    ghost.removeAttribute('aria-expanded');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('tabindex', '-1');
    ghost.classList.add('chronicle-ghost');
    Object.assign(ghost.style, {
      left: bounds.left + 'px', top: bounds.top + 'px',
      width: bounds.width + 'px', height: bounds.height + 'px',
    });
    document.body.appendChild(ghost);
  }

  async function flyCover(from, to, duration, token) {
    createTravellingCover(from);
    if (motionReduced) {
      Object.assign(ghost.style,{
        left: to.left + 'px', top: to.top + 'px',
        width: to.width + 'px', height: to.height + 'px'
      });
      return token === motionId;
    }
    try {
      ghostMotion = ghost.animate([
        { left: from.left + 'px', top: from.top + 'px',
          width: from.width + 'px', height: from.height + 'px',
          opacity: 1, borderRadius: '9px 17px 17px 9px' },
        { left: to.left + 'px', top: to.top + 'px',
          width: to.width + 'px', height: to.height + 'px',
          opacity: 1, borderRadius: '9px 17px 17px 9px' }
      ], {
        duration, fill: 'forwards',
        easing: 'cubic-bezier(.17,.69,.21,1)'
      });
      await Promise.race([ghostMotion.finished.catch(() => {}),sleep(duration + 100)]);
    } catch (error) {
      console.warn('Chronicle flight fell back to resting pose',error);
    }
    return token === motionId;
  }

  function hideBook() {
    book.classList.add('is-flight');
    modal.classList.remove('is-ready');
  }
  function showBook() {
    book.classList.remove('is-flight');
  }
  function finishClose(token) {
    if (token !== motionId) return;
    resetGhost();
    currentState = 'closed';
    book.classList.remove('is-opening','is-open','is-closing','is-flight');
    book.classList.add('is-closed');
    modal.classList.remove('open','is-ready');
    overlay.classList.remove('open');
    trigger.classList.remove('is-travelling');
    trigger.setAttribute('aria-expanded','false');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('book-open');
    window.dispatchEvent(new CustomEvent('ff:book-close'));
    setTimeout(() => {
      if (token === motionId) overlay.hidden = true;
    },FADE_MS);
    (lastFocus?.isConnected ? lastFocus : trigger).focus();
  }

  async function openBook() {
    if (currentState !== 'closed') return;
    const token = ++motionId;
    currentState = 'opening';
    lastFocus = document.activeElement;
    book.classList.remove('is-opening','is-open','is-closing');
    book.classList.add('is-closed');
    hideBook();

    const triggerBounds = trigger.getBoundingClientRect();
    overlay.hidden = false;
    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.classList.add('book-open');
    modal.setAttribute('aria-hidden','false');
    trigger.setAttribute('aria-expanded','true');
    // This event restores the contents page for every new reading.
    window.dispatchEvent(new CustomEvent('ff:book-open'));
    // Let the centred, closed cover get laid out before measuring its target.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (token !== motionId) return;
    const coverBounds = cover.getBoundingClientRect();
    createTravellingCover(triggerBounds);
    trigger.classList.add('is-travelling');
    // The long travelling move and the slow cover hinge are intentionally
    // separate so the reader can perceive one physical, leather-bound object.
    if (!(await flyCover(triggerBounds,coverBounds,motionReduced?0:FLIGHT_MS,token))) return;
    if (token !== motionId) return;
    showBook();
    // Crossfade from the travelling cover to the book's real hinge.
    if (!motionReduced) {
      ghost?.animate([{opacity:1},{opacity:0}],{duration:150,fill:'forwards'});
      await sleep(150);
    }
    if (token !== motionId) return;
    resetGhost();
    book.classList.remove('is-closed');
    book.classList.add('is-opening');
    await sleep(motionReduced?0:HINGE_MS);
    if (token !== motionId) return;
    book.classList.replace('is-opening','is-open');
    modal.classList.add('is-ready');
    currentState = 'open';
    close.focus();
  }

  async function closeBook() {
    if (currentState === 'closed' || currentState === 'closing') return;
    const token = ++motionId;
    const closeFromOpen = currentState === 'open';
    currentState = 'closing';
    resetGhost();
    modal.classList.remove('is-ready');
    if (!closeFromOpen) {
      // An interrupted opening restores the resting cover immediately.
      finishClose(token);
      return;
    }
    book.classList.remove('is-open','is-opening','is-closed');
    book.classList.add('is-closing');
    await sleep(motionReduced?0:HINGE_MS);
    if (token !== motionId) return;
    const from = cover.getBoundingClientRect();
    const to = trigger.getBoundingClientRect();
    hideBook();
    book.classList.replace('is-closing','is-closed');
    if (!(await flyCover(from,to,motionReduced?0:1050,token))) return;
    finishClose(token);
  }

  trigger.addEventListener('click', openBook);
  close.addEventListener('click', closeBook);
  overlay.addEventListener('click', closeBook);
  $('drawerLogout')?.addEventListener('click', () => signOutAndRedirect());

  tocToggle.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ff:book-contents')));
  previous.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ff:book-control',{detail:{direction:-1}})));
  next.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('ff:book-control',{detail:{direction:1}})));

  document.addEventListener('keydown', event => {
    if (currentState === 'closed') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBook();
      return;
    }
    if (currentState !== 'open') return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('ff:book-control',{
        detail:{direction:event.key === 'ArrowLeft'?-1:1}
      }));
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(modal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])'))
        .filter(el => el.getClientRects().length &&
          getComputedStyle(el).visibility !== 'hidden');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length-1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  window.addEventListener('ff:book-data', event => {
    const data = event.detail || {};
    const chapters = Array.isArray(data.sessions) ? data.sessions : [];
    const index = Number.isInteger(data.index) ? data.index : 0;
    const total = chapters.length;
    previous.disabled = index <= 0;
    next.disabled = index >= total;
    $('pageIndicator').textContent = index === 0 ? 'Contents · Page 1 of ' + (total + 1) : 'Session ' + index + ' · Page ' + (index + 1) + ' of ' + (total + 1);
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
        window.dispatchEvent(new CustomEvent('ff:book-go', { detail: { index: i } }));
      });
      toc.appendChild(button);
    });
  });

  window.addEventListener('ff:book-turn', event => {
    const oldPage = $('chronicleMenuPage')?.hidden ? $('notebookPage') : $('chronicleMenuPage');
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

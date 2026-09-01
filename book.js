/* Chronicle book: isolated presentation layer. Session data remains in party-room.js. */
(function () {
  const style = document.createElement('style');
  style.id = 'chronicle-book-v15';
  style.textContent = `
    body.book-open{overflow:hidden!important}
    .drawer-overlay{position:fixed!important;inset:0!important;z-index:70!important;background:rgba(5,4,3,.84)!important;backdrop-filter:blur(6px)!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:opacity .35s ease!important}
    .drawer-overlay.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important}
    .table-notebook,.table-notebook.open{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:visible!important;z-index:71!important;transform:none!important}
    .table-notebook:not(.open){opacity:0!important;visibility:hidden!important;pointer-events:none!important}.table-notebook.open{opacity:1!important;visibility:visible!important;pointer-events:auto!important}
    .book-stage{position:fixed!important;inset:0!important;display:grid!important;place-items:center!important;perspective:1800px!important;pointer-events:none!important}.book-volume{position:relative!important;width:min(88vw,1240px)!important;height:min(80vh,760px)!important;transform-style:preserve-3d!important;transform:translateX(-55vw) rotateX(7deg) rotateZ(-4deg) scale(.58)!important;transition:transform .9s cubic-bezier(.16,.82,.18,1)!important;pointer-events:auto!important}.table-notebook.open .book-volume{transform:translateX(0) rotateX(1deg) rotateZ(0) scale(1)!important}
    .book-page-block{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;display:block!important;overflow:hidden!important;box-sizing:border-box!important;color:#3d2919!important;background:repeating-linear-gradient(90deg,rgba(111,79,41,.045) 0 1px,transparent 1px 5px),linear-gradient(90deg,#c9aa72,#f0dfb5 5%,#eeddb2 48.7%,#b79660 49.7%,#d1b27b 50%,#eeddb2 51.3%,#f0dfb5 95%,#c9aa72)!important;border:2px solid #76522b!important;border-radius:9px!important;box-shadow:0 30px 60px rgba(0,0,0,.62),inset 0 0 45px rgba(74,43,16,.16)!important;transform:translateZ(3px)!important}
    .book-page-block:after{content:''!important;position:absolute!important;top:0!important;bottom:0!important;left:50%!important;width:34px!important;transform:translateX(-50%)!important;background:linear-gradient(90deg,transparent,rgba(55,31,12,.2),rgba(255,247,216,.28),rgba(55,31,12,.1),transparent)!important;pointer-events:none!important;z-index:45!important}
    .book-page-block>.drawer-head{position:absolute!important;left:5.5%!important;top:5%!important;width:40%!important;margin:0!important;z-index:60!important}.book-page-block .drawer-title{color:#5b391f!important;font-family:var(--display)!important;font-size:clamp(17px,1.7vw,24px)!important}.book-page-block .drawer-close{position:fixed!important;top:20px!important;right:25px!important;z-index:100!important;border:0!important;background:transparent!important;color:#704a28!important;font-size:28px!important;cursor:pointer!important}.book-page-block>.drawer-nav{position:absolute!important;left:5.5%!important;top:10.5%!important;width:40%!important;display:flex!important;gap:22px!important;margin:0!important;z-index:60!important}.book-page-block .drawer-nav a,.book-page-block .drawer-nav button{color:#79532f!important;font-size:15px!important;cursor:pointer!important;background:none!important;border:0!important}
    .book-page-block>.notebook{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;display:block!important;z-index:5!important}.book-page-block>.notebook:before{content:'The Chronicle\\A\\AKeep the tales, victories, disasters,\\Aand questionable decisions of the party.'!important;white-space:pre!important;position:absolute!important;left:5.5%!important;top:25%!important;width:39%!important;height:42%!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:35px!important;text-align:center!important;color:#775332!important;font:italic clamp(18px,1.7vw,25px)/1.65 'Crimson Pro',Georgia,serif!important;background:rgba(239,219,177,.18)!important;pointer-events:none!important;z-index:1!important}
    .book-page-block .notebook-page{position:absolute!important;top:16%!important;right:5.5%!important;bottom:16%!important;left:auto!important;width:39%!important;height:auto!important;margin:0!important;padding:38px 44px!important;box-sizing:border-box!important;overflow-y:auto!important;overflow-x:hidden!important;color:#422d1b!important;background:repeating-linear-gradient(transparent,transparent 30px,rgba(91,61,26,.12) 31px),rgba(241,224,184,.65)!important;border:1px solid rgba(117,79,39,.22)!important;border-radius:3px!important;box-shadow:-13px 10px 24px rgba(66,39,15,.13)!important;transform-origin:left center!important;backface-visibility:hidden!important;transform-style:preserve-3d!important;z-index:20!important;pointer-events:auto!important}.book-page-block .notebook-page:before,.book-page-block .notebook-page:after{display:none!important}.book-page-block .page-session-title{color:#5b391f!important;font-family:var(--display)!important;font-size:clamp(21px,2vw,29px)!important}.book-page-block .page-session-date{color:#8a6840!important}.book-page-block .page-notes li{color:#49321e!important;line-height:1.6!important}
    .book-page-block .party-form{position:absolute!important;right:5.5%!important;bottom:7%!important;width:39%!important;margin:0!important;padding:8px 12px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;gap:10px!important;z-index:65!important;background:rgba(66,39,19,.76)!important;border:1px solid rgba(178,137,75,.7)!important}.book-page-block .party-form input{flex:1!important;min-width:0!important;color:#f2dfb8!important;background:rgba(255,249,225,.1)!important;border:0!important;border-bottom:1px solid #b78a50!important;padding:9px 7px!important}.book-page-block .party-form .die-btn{color:#e9c77e!important;cursor:pointer!important;background:none!important;border:0!important;border-bottom:1px solid #b78a50!important}
    .book-page-block .notebook-nav{position:absolute!important;left:5.5%!important;right:5.5%!important;bottom:2.5%!important;height:34px!important;margin:0!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:space-between!important;z-index:75!important;pointer-events:auto!important}.book-page-block .notebook-nav .link-btn{display:block!important;position:relative!important;z-index:76!important;color:#75502c!important;cursor:pointer!important;pointer-events:auto!important;font-family:var(--mono)!important;font-size:11px!important;letter-spacing:.06em!important;text-transform:uppercase!important;background:rgba(239,219,177,.22)!important;border:1px solid rgba(117,79,39,.2)!important;padding:7px 10px!important}.book-page-block .notebook-nav .link-btn:disabled{opacity:.28!important;cursor:default!important}.book-page-block .page-indicator{display:block!important;color:#7b5a38!important;font-family:var(--mono)!important;font-size:11px!important}
    .book-front-cover{position:absolute!important;top:-8px!important;left:-8px!important;right:50%!important;bottom:-8px!important;z-index:80!important;transform-origin:right center!important;transform:rotateY(0) translateZ(18px)!important;transform-style:preserve-3d!important;backface-visibility:hidden!important;pointer-events:none!important;transition:transform .9s cubic-bezier(.2,.72,.15,1)!important}.table-notebook.open .book-front-cover{transform:rotateY(-180deg) translateZ(18px)!important}.book-fullscreen-canvas{display:none!important}
    .chronicle-turn-sheet{position:absolute!important;top:16%!important;right:5.5%!important;bottom:16%!important;width:39%!important;margin:0!important;padding:38px 44px!important;box-sizing:border-box!important;overflow:hidden!important;color:#422d1b!important;background:repeating-linear-gradient(transparent,transparent 30px,rgba(91,61,26,.12) 31px),rgba(241,224,184,.98)!important;border:1px solid rgba(117,79,39,.22)!important;box-shadow:-13px 10px 24px rgba(66,39,15,.13)!important;transform-origin:left center!important;backface-visibility:hidden!important;transform:rotateY(0)!important;z-index:90!important;pointer-events:none!important;transition:transform .6s cubic-bezier(.2,.7,.15,1),filter .6s ease!important}.chronicle-turn-sheet.prev{transform-origin:right center!important}.chronicle-turn-sheet.flipping{transform:rotateY(-180deg)!important;filter:brightness(.68)!important}.chronicle-turn-sheet.prev.flipping{transform:rotateY(180deg)!important}
    @media(max-width:620px){.book-volume{width:96vw!important;height:88vh!important}.book-page-block>.notebook:before{display:none!important}.book-page-block .notebook-page,.chronicle-turn-sheet{left:5%!important;right:5%!important;width:auto!important}.book-page-block .party-form{left:5%!important;right:5%!important;width:auto!important}.book-page-block .notebook-nav{left:5%!important;right:5%!important}}
  `;
  document.head.appendChild(style);

  function installBookFallbacks() {
    const drawer = document.getElementById('drawer');
    const nav = drawer && drawer.querySelector('.notebook-nav');
    if (!drawer || !nav || nav.dataset.v15Installed) return;
    nav.dataset.v15Installed = '1';

    // Give the existing controls a dedicated layer. This is intentionally
    // independent of the notebook flex/grid rules in styles.css.
    nav.style.setProperty('position','absolute','important');
    nav.style.setProperty('z-index','200','important');
    nav.style.setProperty('pointer-events','auto','important');

    // party-room.js owns the actual navigation. We only provide a safety net
    // if an older cached copy failed to bind the buttons.
    const bind = () => {
      const prev = document.getElementById('pagePrev');
      const next = document.getElementById('pageNext');
      if (!prev || !next || bind.done) return;
      bind.done = true;
      prev.addEventListener('click', () => {
        if (typeof window.turnNotebookPage === 'function') window.turnNotebookPage(-1);
      });
      next.addEventListener('click', () => {
        if (typeof window.turnNotebookPage === 'function') window.turnNotebookPage(1);
      });
    };
    bind();
    setTimeout(bind, 500);
    setTimeout(bind, 1500);
  }

  window.addEventListener('ff:book-turn', function (event) {
    const page = document.getElementById('notebookPage');
    if (!page || !page.parentElement) return;
    const sheet = page.cloneNode(true);
    sheet.removeAttribute('id');
    sheet.className = 'chronicle-turn-sheet' + ((event.detail && event.detail.direction < 0) ? ' prev' : '');
    sheet.setAttribute('aria-hidden','true');
    page.parentElement.appendChild(sheet);
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('flipping')));
    setTimeout(() => sheet.remove(), 620);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installBookFallbacks);
  else installBookFallbacks();
})();

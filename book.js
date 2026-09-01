/* ============================================================================
   The Faerie's Fortune — Chronicle Book
   Presentation only. party-room.js owns the session data and navigation.
   ============================================================================ */
(function setupChronicleBook() {
  const style = document.createElement('style');
  style.id = 'chronicle-book-final-fix';
  style.textContent = `
    /* ---------- full-screen book overlay ---------- */
    body.book-open { overflow: hidden !important; }

    .drawer-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 70 !important;
      background: rgba(5,4,3,.82) !important;
      backdrop-filter: blur(5px) !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      transition: opacity .4s ease !important;
    }
    .drawer-overlay.open {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    .table-notebook,
    .table-notebook.open {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      transform: none !important;
      overflow: visible !important;
      z-index: 71 !important;
    }
    .table-notebook:not(.open) {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .table-notebook.open {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }

    /* ---------- the physical spread ---------- */
    .book-stage {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      padding: 0 !important;
      margin: 0 !important;
      display: grid !important;
      place-items: center !important;
      perspective: 1800px !important;
      pointer-events: none !important;
    }

    .book-volume {
      position: relative !important;
      width: min(88vw, 1240px) !important;
      height: min(80vh, 760px) !important;
      margin: 0 !important;
      transform-style: preserve-3d !important;
      transform: translate3d(-55vw, 0, 0) rotateX(8deg) rotateZ(-4deg) scale(.58) !important;
      transition: transform .9s cubic-bezier(.16,.82,.18,1) !important;
      pointer-events: auto !important;
    }
    .table-notebook.open .book-volume {
      transform: translate3d(0, 0, 0) rotateX(1.5deg) rotateZ(0) scale(1) !important;
    }

    /* ---------- parchment spread ---------- */
    .book-page-block {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      display: block !important;
      overflow: hidden !important;
      color: #3d2919 !important;
      background:
        repeating-linear-gradient(90deg, rgba(111,79,41,.045) 0 1px, transparent 1px 5px),
        linear-gradient(90deg,
          #d0b37b 0%,
          #f0dfb5 4%,
          #eeddb2 48.7%,
          #b79660 49.65%,
          #d0b17a 50%,
          #eeddb2 51.35%,
          #f0dfb5 96%,
          #cba970 100%) !important;
      border: 2px solid #76522b !important;
      border-radius: 9px !important;
      box-shadow:
        0 30px 60px rgba(0,0,0,.62),
        inset 0 0 45px rgba(74,43,16,.16) !important;
      transform: translateZ(3px) !important;
      pointer-events: auto !important;
    }
    .book-page-block::before {
      content: '' !important;
      position: absolute !important;
      inset: 14px !important;
      border: 1px solid rgba(104,69,30,.25) !important;
      border-radius: 5px !important;
      pointer-events: none !important;
      z-index: 0 !important;
    }
    .book-page-block::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      bottom: 0 !important;
      left: 50% !important;
      width: 38px !important;
      transform: translateX(-50%) !important;
      background: linear-gradient(90deg, transparent, rgba(55,31,12,.2), rgba(255,247,216,.3), rgba(55,31,12,.1), transparent) !important;
      pointer-events: none !important;
      z-index: 40 !important;
    }

    /* ---------- left page / title ---------- */
    .book-page-block > .drawer-head {
      position: absolute !important;
      left: 5.5% !important;
      top: 5% !important;
      width: 39% !important;
      margin: 0 !important;
      z-index: 60 !important;
    }
    .book-page-block .drawer-title {
      color: #5b391f !important;
      font-family: var(--display) !important;
      font-size: clamp(17px, 1.7vw, 24px) !important;
      letter-spacing: .055em !important;
      text-shadow: 0 1px 1px rgba(255,244,211,.7) !important;
    }
    .book-page-block .drawer-close {
      position: fixed !important;
      top: 20px !important;
      right: 25px !important;
      z-index: 100 !important;
      padding: 5px 9px !important;
      border: 0 !important;
      background: transparent !important;
      color: #704a28 !important;
      font-size: 28px !important;
      cursor: pointer !important;
      pointer-events: auto !important;
    }

    .book-page-block > .drawer-nav {
      position: absolute !important;
      left: 5.5% !important;
      top: 10.5% !important;
      width: 39% !important;
      display: flex !important;
      gap: 22px !important;
      margin: 0 !important;
      z-index: 60 !important;
    }
    .book-page-block .drawer-nav a,
    .book-page-block .drawer-nav button {
      color: #79532f !important;
      font-family: var(--body) !important;
      font-size: 15px !important;
      cursor: pointer !important;
      pointer-events: auto !important;
    }
    .book-page-block > .drawer-divider { display: none !important; }

    /* Decorative left-hand inside-cover text. */
    .book-page-block > .notebook::before {
      content: 'The Chronicle\\A\\AKeep the tales, victories, disasters,\\Aand questionable decisions of the party.' !important;
      white-space: pre !important;
      position: absolute !important;
      left: 5.5% !important;
      top: 25% !important;
      width: 39% !important;
      height: 42% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      padding: 35px !important;
      text-align: center !important;
      color: #775332 !important;
      font: italic clamp(18px, 1.7vw, 25px)/1.65 'Crimson Pro', Georgia, serif !important;
      background: linear-gradient(90deg, rgba(204,177,126,.12), rgba(239,219,177,.28)) !important;
      border: 1px solid rgba(111,76,37,.10) !important;
      pointer-events: none !important;
      z-index: 1 !important;
    }

    /* ---------- right-hand session page ---------- */
    .book-page-block > .notebook {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
      z-index: 5 !important;
    }
    .book-page-block .notebook-page {
      position: absolute !important;
      top: 15% !important;
      right: 5.5% !important;
      bottom: 15% !important;
      left: auto !important;
      width: 39% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 38px 44px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      color: #422d1b !important;
      background:
        repeating-linear-gradient(transparent, transparent 30px, rgba(91,61,26,.12) 31px),
        linear-gradient(90deg, rgba(94,59,24,.13), transparent 12%),
        rgba(241,224,184,.42) !important;
      border: 1px solid rgba(117,79,39,.18) !important;
      border-radius: 3px !important;
      box-shadow: -13px 10px 24px rgba(66,39,15,.13), inset 15px 0 23px rgba(73,43,16,.05) !important;
      transform-origin: left center !important;
      backface-visibility: hidden !important;
      transform-style: preserve-3d !important;
      pointer-events: auto !important;
      z-index: 10 !important;
    }
    .book-page-block .notebook-page::before,
    .book-page-block .notebook-page::after { display: none !important; }
    .book-page-block .page-session-title {
      color: #5b391f !important;
      font-family: var(--display) !important;
      font-size: clamp(21px, 2vw, 29px) !important;
      line-height: 1.25 !important;
    }
    .book-page-block .page-session-date {
      color: #8a6840 !important;
    }
    .book-page-block .page-notes li {
      color: #49321e !important;
      line-height: 1.6 !important;
    }

    /* ---------- writing box ---------- */
    .book-page-block .party-form {
      position: absolute !important;
      right: 5.5% !important;
      bottom: 6.5% !important;
      width: 39% !important;
      margin: 0 !important;
      padding: 8px 12px !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      z-index: 60 !important;
      background: rgba(66,39,19,.72) !important;
      border: 1px solid rgba(178,137,75,.7) !important;
      box-shadow: 0 6px 13px rgba(55,31,14,.18) !important;
    }
    .book-page-block .party-form input[type=text] {
      flex: 1 !important;
      min-width: 0 !important;
      color: #f2dfb8 !important;
      background: rgba(255,249,225,.10) !important;
      border: 0 !important;
      border-bottom: 1px solid #b78a50 !important;
      padding: 9px 7px !important;
      pointer-events: auto !important;
    }
    .book-page-block .party-form input[type=text]::placeholder { color: #d0b384 !important; }
    .book-page-block .party-form .die-btn {
      color: #e9c77e !important;
      border-bottom: 1px solid #b78a50 !important;
      cursor: pointer !important;
      pointer-events: auto !important;
    }

    /* ---------- page controls ---------- */
    .book-page-block .notebook-nav {
      position: absolute !important;
      left: 5.5% !important;
      right: 5.5% !important;
      bottom: 6.5% !important;
      margin: 0 !important;
      z-index: 60 !important;
      pointer-events: auto !important;
    }
    .book-page-block .notebook-nav .link-btn {
      color: #75502c !important;
      cursor: pointer !important;
      pointer-events: auto !important;
    }
    .book-page-block .page-indicator { color: #7b5a38 !important; }

    /* ---------- cover ---------- */
    .book-front-cover {
      position: absolute !important;
      top: -8px !important;
      left: -8px !important;
      right: 50% !important;
      bottom: -8px !important;
      z-index: 80 !important;
      transform-origin: right center !important;
      transform: rotateY(0deg) translateZ(18px) !important;
      transform-style: preserve-3d !important;
      backface-visibility: hidden !important;
      -webkit-backface-visibility: hidden !important;
      pointer-events: none !important;
      transition: transform .95s cubic-bezier(.2,.72,.15,1) .05s !important;
    }
    .table-notebook.open .book-front-cover {
      transform: rotateY(-180deg) translateZ(18px) !important;
    }

    /* ---------- page flip ---------- */
    .book-page-block .notebook-page.turning-next {
      animation: chronicle-next .65s cubic-bezier(.25,.75,.2,1) both !important;
    }
    .book-page-block .notebook-page.turning-prev {
      transform-origin: right center !important;
      animation: chronicle-prev .65s cubic-bezier(.25,.75,.2,1) both !important;
    }
    .book-page-block .notebook-page.arriving-next {
      animation: chronicle-arrive-next .4s ease-out both !important;
    }
    .book-page-block .notebook-page.arriving-prev {
      transform-origin: right center !important;
      animation: chronicle-arrive-prev .4s ease-out both !important;
    }
    @keyframes chronicle-next {
      0% { transform: rotateY(0); filter: brightness(1); }
      45% { transform: rotateY(-88deg); filter: brightness(.82); }
      100% { transform: rotateY(-178deg); filter: brightness(.70); }
    }
    @keyframes chronicle-prev {
      0% { transform: rotateY(0); filter: brightness(1); }
      45% { transform: rotateY(88deg); filter: brightness(.82); }
      100% { transform: rotateY(178deg); filter: brightness(.70); }
    }
    @keyframes chronicle-arrive-next {
      from { transform: rotateY(84deg); opacity: .65; }
      to { transform: rotateY(0); opacity: 1; }
    }
    @keyframes chronicle-arrive-prev {
      from { transform: rotateY(-84deg); opacity: .65; }
      to { transform: rotateY(0); opacity: 1; }
    }

    /* Never let decorative canvas/cover layers steal clicks. */
    .book-fullscreen-canvas { pointer-events: none !important; }
    .table-notebook.open a,
    .table-notebook.open button,
    .table-notebook.open input,
    .table-notebook.open .notebook-page { pointer-events: auto !important; }

    @media (max-width: 800px) {
      .book-volume,
      .table-notebook.open .book-volume {
        width: 94vw !important;
        height: 84vh !important;
      }
      .book-page-block > .drawer-head,
      .book-page-block > .drawer-nav { left: 5% !important; width: 90% !important; }
      .book-page-block > .notebook::before { display: none !important; }
      .book-page-block .notebook-page {
        left: 5% !important;
        right: 5% !important;
        top: 15% !important;
        bottom: 17% !important;
        width: auto !important;
      }
      .book-page-block .party-form { left: 5% !important; right: 5% !important; width: auto !important; }
      .book-page-block .notebook-nav { left: 5% !important; right: 5% !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      .book-volume, .book-front-cover, .notebook-page { transition: none !important; animation: none !important; }
    }
  `;
  document.head.appendChild(style);
})();

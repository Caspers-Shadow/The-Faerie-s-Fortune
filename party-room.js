// everything here is scoped to one party (?party=<id> in the URL).
// access gets checked twice: once here for a clean error message, and
// again by the database's RLS policies regardless of what this file does

let me = null;
let partyId = null;
let party = null;
let myRole = null;       // 'dm' | 'player'
let currentSessionId = null;
let sessionsList = [];   // ascending by started_at
let pageIndex = 0;       // index into sessionsList currently shown in the notebook
let notebookLoaded = false;
let introCoverOnOpen = false;
let onlineIds = new Set();

(async function initPartyRoom() {
  me = await requireSession();
  partyId = new URLSearchParams(window.location.search).get('party');
  if (!partyId) { showBlocked('No party specified.'); return; }

  const { data: membership } = await supabaseClient
    .from('party_members').select('role').eq('party_id', partyId).eq('user_id', me.id).maybeSingle();
  if (!membership) { showBlocked("You're not a member of this party."); return; }
  myRole = membership.role;

  const { data: partyRow, error: partyErr } = await supabaseClient.from('parties').select('*').eq('id', partyId).single();
  if (partyErr || !partyRow) { showBlocked('That party could not be found.'); return; }
  party = partyRow;

  document.getElementById('partyTitle').innerHTML = escapeHtml(party.name) + ' <span>(' + (myRole === 'dm' ? 'you\u2019re the DM' : 'you\u2019re playing') + ')</span>';
  document.title = party.name + ' - The Faerie\'s Fortune';

  await ensureSession();
  setupPresence();
  setupLogSync();
  await renderPartyInfo();
  await refreshLog();
  await refreshNotebook();
})();

function showBlocked(message) {
  document.getElementById('partyInfo').innerHTML = `<p class="party-hint">${escapeHtml(message)}</p><p><a href="dashboard.html" class="link-btn">Back to your parties</a></p>`;
  document.querySelectorAll('.theme-select, .dice-select, .tray-wrap, .hint, .ledger').forEach(el => el.style.display = 'none');
  document.getElementById('hamburgerBtn').style.display = 'none';
}

async function ensureSession() {
  const { data: latest } = await supabaseClient
    .from('sessions').select('id').eq('party_id', partyId).order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (latest) { currentSessionId = latest.id; return; }
  if (myRole !== 'dm') return; // players wait for the DM's first session
  const { data: created } = await supabaseClient.from('sessions').insert({ party_id: partyId, label: 'Session 1' }).select().single();
  if (created) currentSessionId = created.id;
}

// who's actually got this party open right now
function setupPresence() {
  const channel = supabaseClient.channel('party-presence-' + partyId, { config: { presence: { key: me.id } } });
  channel.on('presence', { event: 'sync' }, () => {
    onlineIds = new Set(Object.keys(channel.presenceState()));
    renderPartyInfo();
  });
  channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() });
  });
}

// Keep the shared cast history current for everyone at the table. Realtime is
// immediate when it is enabled for log_entries; the quiet interval is a
// fallback for projects where database replication has not been switched on.
function setupLogSync() {
  let refreshTimer = null;
  const queueRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshLog(); }, 120);
  };

  supabaseClient
    .channel('party-rolls-' + partyId)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'log_entries', filter: 'party_id=eq.' + partyId,
    }, queueRefresh)
    .subscribe();

  setInterval(() => {
    if (document.visibilityState === 'visible') refreshLog();
  }, 5000);
}

// DM gets a crown, your own chip gets a "(You)" tag
// and everyone shows lit up (online) or dimmed (offline) based on presence.
async function renderPartyInfo() {
  const panel = document.getElementById('partyInfo');
  const { data: roster } = await supabaseClient
    .from('party_members').select('user_id, role, user:profiles(display_name)').eq('party_id', partyId);

  panel.innerHTML = '';
  const nameRow = document.createElement('div');
  nameRow.className = 'party-name-row';
  const nameEl = document.createElement('span'); nameEl.className = 'party-name'; nameEl.textContent = party.name;
  const actions = document.createElement('div'); actions.className = 'party-actions';
  if (myRole === 'dm') {
    const sessBtn = document.createElement('button'); sessBtn.className = 'link-btn'; sessBtn.textContent = 'New Session';
    sessBtn.addEventListener('click', startNewSession);
    actions.appendChild(sessBtn);
  }
  nameRow.appendChild(nameEl); nameRow.appendChild(actions);
  panel.appendChild(nameRow);

  const chips = document.createElement('div');
  chips.className = 'member-chips';
  const sorted = (roster || []).slice().sort((a, b) => (a.role === 'dm' ? -1 : 0) - (b.role === 'dm' ? -1 : 0));
  sorted.forEach(r => {
    const isDM = r.role === 'dm';
    const isMe = r.user_id === me.id;
    const isOnline = isMe || onlineIds.has(r.user_id);
    const chip = document.createElement('span');
    chip.className = 'member-chip' + (isDM ? ' dm' : '') + (isMe ? ' you' : '') + (isOnline ? ' online' : ' offline');
    const name = r.user ? r.user.display_name : 'Unknown';
    chip.innerHTML = '<span class="presence-dot"></span>' +
      (isDM ? '<span class="crown" title="Dungeon Master">♛</span>' : '') +
      escapeHtml(name) + (isMe ? ' <span class="you-tag">(You)</span>' : '');
    chips.appendChild(chip);
  });
  panel.appendChild(chips);

  if (myRole === 'dm') {
    const inviteRow = document.createElement('p');
    inviteRow.className = 'party-hint';
    inviteRow.innerHTML = 'Invite code: <strong style="letter-spacing:0.1em; color:var(--accent-bright);">' + escapeHtml(party.invite_code) + '</strong>, share it so players can join.';
    panel.appendChild(inviteRow);
  }
}

async function startNewSession() {
  const { data: created } = await supabaseClient.from('sessions').insert({ party_id: partyId, label: null }).select().single();
  if (!created) return;
  currentSessionId = created.id;
  notebookLoaded = false;
  await supabaseClient.from('log_entries').insert({ party_id: partyId, session_id: currentSessionId, user_id: me.id, type: 'session' });
  await refreshLog();
  await refreshNotebook();
}

// just rolls and session dividers, notes live in the notebook now
async function refreshLog() {
  const log = document.getElementById('log');
  const { data, error } = await supabaseClient
    .from('log_entries')
    .select('type, die, display, crit, fail, created_at, user:profiles(display_name)')
    .eq('party_id', partyId)
    .neq('type', 'note')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) { log.innerHTML = '<li class="empty">Couldn\'t load the log.</li>'; return; }
  if (!data || data.length === 0) { log.innerHTML = '<li class="empty">No rolls yet, give it a throw.</li>'; return; }

  log.innerHTML = '';
  data.forEach(e => log.appendChild(renderEntry(e)));
}

function renderEntry(e) {
  const li = document.createElement('li');
  if (e.type === 'session') {
    li.className = 'log-session';
    li.textContent = 'A new session began at ' + timeLabel(e.created_at);
    return li;
  }
  const who = e.user ? escapeHtml(e.user.display_name) + ' rolled the ' : 'Someone rolled the ';
  const flourish = e.crit ? ', critical hit!' : e.fail ? ', fumble.' : '';
  if (e.crit) li.classList.add('crit');
  if (e.fail) li.classList.add('fail');
  li.innerHTML = `<span>${who}${e.die}${flourish} <span class="entry-time">${timeLabel(e.created_at)}</span></span><span class="val">${e.display}</span>`;
  return li;
}

// Called by dice.js's finishRoll() once a roll settles.
async function recordRoll(cfg, display, isCrit, isFail) {
  const { error } = await supabaseClient.from('log_entries').insert({
    party_id: partyId, session_id: currentSessionId, user_id: me.id,
    type: 'roll', die: cfg.label, display, crit: !!isCrit, fail: !!isFail,
  });
  if (error) {
    console.error('Could not save roll:', error);
    const log = document.getElementById('log');
    const warning = document.createElement('li');
    warning.className = 'log-warning';
    warning.textContent = 'The cast landed, but could not be written to the shared chronicle.';
    log.prepend(warning);
    return;
  }
  await refreshLog();
}

// top-left menu button, slide-in panel with nav + the notebook
const menuBtn = document.getElementById('hamburgerBtn');
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');

function openDrawer() {
  drawer.classList.add('open'); drawerOverlay.classList.add('open'); drawerOverlay.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true'); drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('book-open');
  // Each opening begins with the inside of the back cover, then lands on the
  // first session page rather than jumping straight to the newest session.
  introCoverOnOpen = true;
  notebookLoaded = false;
  window.dispatchEvent(new CustomEvent('ff:book-cover'));
  refreshNotebook();
  window.dispatchEvent(new CustomEvent('ff:book-open'));
}
function closeDrawer() {
  drawer.classList.remove('open'); drawerOverlay.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false'); drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('book-open');
  window.dispatchEvent(new CustomEvent('ff:book-close'));
  setTimeout(() => { drawerOverlay.hidden = true; }, 700);
}
menuBtn.addEventListener('click', () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer()));
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
document.getElementById('drawerLogout').addEventListener('click', signOutAndRedirect);

// Sessions become one or more physical book pages. A page keeps its session
// identity, and a long list of notes is split into continuation pages.
let notesBySession = {};
let bookPages = [];

function buildBookPages() {
  bookPages = [];
  sessionsList.forEach((session, sessionOrder) => {
    const notes = notesBySession[session.id] || [];
    const chunks = [];
    if (!notes.length) {
      chunks.push([]);
    } else {
      let chunk = [];
      let chars = 0;
      notes.forEach(note => {
        const cost = String(note.note_text || '').length;
        // Six short notes or roughly half a page of writing keeps the canvas
        // readable; overflow continues onto the next page for this session.
        if (chunk.length && (chunk.length >= 6 || chars + cost > 520)) {
          chunks.push(chunk);
          chunk = [];
          chars = 0;
        }
        chunk.push(note);
        chars += cost;
      });
      if (chunk.length) chunks.push(chunk);
    }
    chunks.forEach((chunk, part) => bookPages.push({
      key: session.id + ':' + part,
      session,
      sessionNumber: sessionOrder + 1,
      notes: chunk,
      part: part + 1,
      parts: chunks.length,
    }));
  });
}

async function refreshNotebook() {
  const showCoverThenFirstPage = introCoverOnOpen;
  introCoverOnOpen = false;
  const previousKey = bookPages[pageIndex]?.key;
  const [{ data: sessions }, { data: notes }] = await Promise.all([
    supabaseClient.from('sessions').select('id, label, started_at').eq('party_id', partyId).order('started_at', { ascending: true }),
    supabaseClient.from('log_entries').select('session_id, note_text, created_at, user:profiles(display_name)')
      .eq('party_id', partyId).eq('type', 'note').order('created_at', { ascending: true }),
  ]);

  sessionsList = sessions || [];
  notesBySession = {};
  (notes || []).forEach(n => {
    if (!notesBySession[n.session_id]) notesBySession[n.session_id] = [];
    notesBySession[n.session_id].push(n);
  });
  buildBookPages();

  if (showCoverThenFirstPage) {
    pageIndex = 0;
    notebookLoaded = true;
    // Give the back-cover texture a moment to be seen before the first sheet
    // arrives, as it would when opening a physical book.
    window.setTimeout(renderNotebookPage, 620);
    return;
  }

  // Keep the page the player is reading during background refreshes. On the
  // first load, open the last page belonging to the active session.
  const preservedIndex = previousKey ? bookPages.findIndex(p => p.key === previousKey) : -1;
  if (notebookLoaded && preservedIndex >= 0) {
    pageIndex = preservedIndex;
  } else {
    const currentPages = bookPages.reduce((last, p, index) => p.session.id === currentSessionId ? index : last, -1);
    pageIndex = currentPages >= 0 ? currentPages : Math.max(0, bookPages.length - 1);
  }
  notebookLoaded = true;
  renderNotebookPage();
}

function renderNotebookPage() {
  const pageEl = document.getElementById('notebookPage');
  const indicatorEl = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('pagePrev');
  const nextBtn = document.getElementById('pageNext');

  if (bookPages.length === 0) {
    pageEl.innerHTML = '<p class="page-empty">No sessions yet.</p>';
    indicatorEl.textContent = '';
    prevBtn.disabled = nextBtn.disabled = true;
    return;
  }

  const page = bookPages[pageIndex];
  const s = page.session;
  const notes = page.notes;
  const baseTitle = s.label || ('Session ' + page.sessionNumber);
  const title = page.part > 1 ? baseTitle + ' · continued' : baseTitle;

  let html = `<p class="page-session-title">${escapeHtml(title)}</p><p class="page-session-date">${dateTimeLabel(s.started_at)}</p>`;
  if (notes.length === 0) {
    html += '<p class="page-empty">No notes written in this session.</p>';
  } else {
    html += '<ul class="page-notes">' + notes.map(n =>
      `<li><span class="note-author">${n.user ? escapeHtml(n.user.display_name) : 'Someone'}:</span>${escapeHtml(n.note_text)}<span class="note-time">${timeLabel(n.created_at)}</span></li>`
    ).join('') + '</ul>';
  }
  pageEl.innerHTML = html;

  window.dispatchEvent(new CustomEvent('ff:book-page', { detail: {
    title,
    date: dateTimeLabel(s.started_at),
    notes: notes.map(n => ({
      author: n.user ? n.user.display_name : 'Someone',
      text: n.note_text,
      time: timeLabel(n.created_at),
    })),
    page: pageIndex + 1,
    total: bookPages.length,
  }}));

  indicatorEl.textContent = `Page ${pageIndex + 1} of ${bookPages.length} · Session ${page.sessionNumber}${page.parts > 1 ? ` · part ${page.part}/${page.parts}` : ''}`;
  prevBtn.disabled = pageIndex === 0;
  nextBtn.disabled = pageIndex === bookPages.length - 1;
}

let pageTurning = false;
function turnNotebookPage(direction) {
  if (pageTurning) return;
  const nextIndex = pageIndex + direction;
  if (nextIndex < 0 || nextIndex >= bookPages.length) return;
  pageTurning = true;
  // Commit the destination immediately so an overlapping refresh cannot snap
  // the controls back to the latest session while the 3D page is travelling.
  pageIndex = nextIndex;
  window.dispatchEvent(new CustomEvent('ff:book-turn', { detail: { direction } }));
  const pageEl = document.getElementById('notebookPage');
  pageEl.classList.add(direction > 0 ? 'turning-next' : 'turning-prev');
  setTimeout(() => {
    renderNotebookPage();
    pageEl.classList.remove('turning-next', 'turning-prev');
    pageEl.classList.add(direction > 0 ? 'arriving-next' : 'arriving-prev');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pageEl.classList.remove('arriving-next', 'arriving-prev');
      setTimeout(() => { pageTurning = false; }, 340);
    }));
  }, 340);
}

document.getElementById('pagePrev').addEventListener('click', () => turnNotebookPage(-1));
document.getElementById('pageNext').addEventListener('click', () => turnNotebookPage(1));

document.getElementById('noteBtn').addEventListener('click', async () => {
  const input = document.getElementById('noteInput');
  const text = input.value.trim();
  if (!text || !currentSessionId) return;
  input.value = '';
  await supabaseClient.from('log_entries').insert({
    party_id: partyId, session_id: currentSessionId, user_id: me.id, type: 'note', note_text: text,
  });
  await refreshNotebook();
});
document.getElementById('noteInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('noteBtn').click(); } });
document.getElementById('refreshBtn').addEventListener('click', () => { refreshLog(); refreshNotebook(); });

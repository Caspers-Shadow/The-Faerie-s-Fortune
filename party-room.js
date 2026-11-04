// everything here is scoped to one party (?party=<id> in the URL).
// access gets checked twice: once here for a clean error message, and
// again by the database's RLS policies regardless of what this file does

let me = null;
let partyId = null;
let party = null;
let myRole = null;       // 'dm' | 'player'
let currentSessionId = null;
let sessionsList = [];   // ascending by started_at
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
  await refreshNotebook({ selectContents: true });
})();

function showBlocked(message) {
  document.getElementById('partyInfo').innerHTML = `<p class="party-hint">${escapeHtml(message)}</p><p><a href="dashboard.html" class="link-btn">Back to your parties</a></p>`;
  document.querySelectorAll('.theme-select, .dice-select, .tray-wrap, .hint, .ledger').forEach(el => el.style.display = 'none');
  // No party access: hide the physical tome without assuming an old drawer button exists.
  const tome = document.getElementById('tomeRoot');
  if (tome) tome.style.display = 'none';
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
  const queueRefresh = payload => {
    const entryType = payload?.new?.type || payload?.old?.type;
    if (entryType === 'note' || entryType === 'session') queueRefresh.shouldUpdateTome = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshLog();
      // Do not redraw note forms for every die roll; only notes/session changes.
      if (queueRefresh.shouldUpdateTome) refreshNotebook();
      queueRefresh.shouldUpdateTome = false;
    }, 120);
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
  await supabaseClient.from('log_entries').insert({ party_id: partyId, session_id: currentSessionId, user_id: me.id, type: 'session' });
  await refreshLog();
  await refreshNotebook({ selectLatest: true });
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

// Shared sessions and notes for the new physical tome. The new tome owns
// turning, page selection and rendering; this module owns database access.
let tomeRequestNumber = 0;

async function refreshNotebook(options = {}) {
  if (!partyId || !me) return;
  const request = ++tomeRequestNumber;
  const [{ data: sessions, error: sessionError }, { data: notes, error: noteError }] =
    await Promise.all([
      supabaseClient.from('sessions').select('id, label, started_at')
        .eq('party_id',partyId).order('started_at',{ascending:true}),
      supabaseClient.from('log_entries')
        .select('session_id, note_text, created_at, user:profiles(display_name)')
        .eq('party_id',partyId).eq('type','note')
        .order('created_at',{ascending:true}),
    ]);
  if (request !== tomeRequestNumber) return;
  if (sessionError || noteError) {
    console.error('Could not load the tome',sessionError,noteError);
    window.dispatchEvent(new CustomEvent('ff:tome:error',{
      detail:{message:'The Chronicle could not be loaded. Try Refresh.'}
    }));
    return;
  }
  sessionsList = sessions || [];
  const notesBySession = {};
  for (const entry of notes || []) {
    (notesBySession[entry.session_id] ||= []).push(entry);
  }
  window.dispatchEvent(new CustomEvent('ff:tome:content',{detail:{
    sessions:sessionsList,
    notesBySession,
    selectContents:!!options.selectContents,
    selectSessionId:options.selectSessionId ||
      (options.selectLatest ? currentSessionId : null),
  }}));
}

window.addEventListener('ff:tome:save-note',async event => {
  const {sessionId,text,resolve} = event.detail || {};
  if (typeof resolve !== 'function') return;
  if (!sessionId || typeof text !== 'string' || !text.trim() || text.trim().length > 200) {
    resolve({ok:false,error:'Please enter a note of at most 200 characters.'});
    return;
  }
  try {
    // In addition to the tome hiding older forms, check the newest session
    // again immediately before inserting. The DB should also enforce the
    // restriction for clients that do not use this page.
    const {data:newest,error:lookupError} = await supabaseClient.from('sessions')
      .select('id').eq('party_id',partyId)
      .order('started_at',{ascending:false}).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (!newest || newest.id !== sessionId) {
      await refreshNotebook();
      resolve({ok:false,error:'That session has been sealed. Only the latest session accepts notes.'});
      return;
    }
    const {error:insertError} = await supabaseClient.from('log_entries').insert({
      party_id:partyId,session_id:sessionId,user_id:me.id,
      type:'note',note_text:text.trim(),
    });
    if (insertError) throw insertError;
    await refreshNotebook();
    resolve({ok:true});
  } catch (error) {
    console.error('Could not save tome note',error);
    resolve({ok:false,error:'The note could not be saved. Please try again.'});
  }
});

document.getElementById('refreshBtn').addEventListener('click',() => {
  refreshLog();
  refreshNotebook();
});

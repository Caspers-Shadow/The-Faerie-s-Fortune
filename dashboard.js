// your parties, plus create/join

let me = null;
const statusEl = document.getElementById('dashStatus');

(async function initDashboard() {
  try {
    me = await requireSession();
    const name = await getDisplayName(me.id);
    document.getElementById('welcomeLine').textContent = 'Welcome back, ' + name;
    await loadParties();
  } catch (err) {
    if (err && (err.message === 'no session' || err.message === 'cloud not enabled' || err.message === 'redirect loop detected')) return;
    document.getElementById('partyList').innerHTML = '<p class="party-hint">Something went wrong loading this page: ' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>';
    console.error(err);
  }
})();

async function loadParties() {
  const listEl = document.getElementById('partyList');
  let result;
  try {
    result = await withTimeout(
      supabaseClient
        .from('party_members')
        .select('role, party:parties(id, name, invite_code)')
        .eq('user_id', me.id),
      10000,
      'Loading your parties'
    );
  } catch (err) {
    listEl.innerHTML = '<p class="party-hint">Couldn\'t load your parties: ' + escapeHtml(err.message) + '</p>';
    console.error(err);
    return;
  }
  const { data, error } = result;

  if (error) { listEl.innerHTML = '<p class="party-hint">Couldn\'t load your parties: ' + escapeHtml(error.message) + '</p>'; return; }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<h2>Your Parties</h2><p class="party-hint">You\'re not in a party yet. Found one below, or join one with an invite code.</p>';
    return;
  }

  listEl.innerHTML = '<h2>Your Parties</h2>';
  const list = document.createElement('div');
  list.className = 'member-chips'; // reuse chip layout, but as full-width rows below
  list.style.flexDirection = 'column';
  list.style.alignItems = 'stretch';

  data.forEach(row => {
    if (!row.party) return;
    const card = document.createElement('a');
    card.href = 'party.html?party=' + encodeURIComponent(row.party.id);
    card.className = 'party-row-link';
    const badge = row.role === 'dm' ? 'Dungeon Master' : 'Player';
    card.innerHTML = `
      <span class="party-row-name">${escapeHtml(row.party.name)}</span>
      <span class="party-row-badge ${row.role}">${badge}</span>
    `;
    list.appendChild(card);
  });
  listEl.appendChild(list);
}

document.getElementById('createBtn').addEventListener('click', async () => {
  const nameInput = document.getElementById('createName');
  const name = nameInput.value.trim();
  if (!name) return;
  statusEl.textContent = 'Founding your party…';
  try {
    let code, party, partyErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = genInviteCode();
      const res = await supabaseClient.from('parties').insert({ name, invite_code: code, dm_id: me.id }).select().single();
      party = res.data; partyErr = res.error;
      if (!partyErr) break; // succeeded, or failed for a reason other than a code collision
    }
    if (partyErr) { statusEl.textContent = 'Could not create party: ' + partyErr.message; console.error(partyErr); return; }

    const { error: memberErr } = await supabaseClient.from('party_members').insert({ party_id: party.id, user_id: me.id, role: 'dm' });
    if (memberErr) { statusEl.textContent = 'Could not add you as DM: ' + memberErr.message; console.error(memberErr); return; }

    await supabaseClient.from('sessions').insert({ party_id: party.id, label: 'Session 1' });

    window.location.href = 'party.html?party=' + encodeURIComponent(party.id);
  } catch (err) {
    statusEl.textContent = 'Something went wrong: ' + (err && err.message ? err.message : String(err));
    console.error(err);
  }
});

document.getElementById('joinBtn').addEventListener('click', async () => {
  const codeInput = document.getElementById('joinCode');
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  statusEl.textContent = 'Looking for that party…';
  try {
    const { data, error } = await supabaseClient.rpc('join_party_by_code', { p_code: code });
    if (error) { statusEl.textContent = error.message.includes('No party found') ? 'No party found with that code.' : error.message; console.error(error); return; }
    if (!data || data.length === 0) { statusEl.textContent = 'No party found with that code.'; return; }

    window.location.href = 'party.html?party=' + encodeURIComponent(data[0].id);
  } catch (err) {
    statusEl.textContent = 'Something went wrong: ' + (err && err.message ? err.message : String(err));
    console.error(err);
  }
});

document.getElementById('logoutBtn').addEventListener('click', signOutAndRedirect);
['createName'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('createBtn').click(); }));
document.getElementById('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });

// supabase client + small helpers, loaded after config.js on every page

const CLOUD_ENABLED = typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.startsWith('YOUR_');
const supabaseClient = CLOUD_ENABLED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easier to read aloud
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function timeLabel(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function dateTimeLabel(iso) { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

// Waits for Supabase to finish restoring the session from storage (rather
// than reading it mid-restore, which is what can cause a page to briefly
// think there's no session right after load and bounce somewhere it
// shouldn't). Guarded so it can never hang forever even if something about
// the auth event never fires as expected.
function waitForAuthReady() {
  return new Promise(resolve => {
    let resolved = false;
    let unsubscribeFn = null;

    const finish = session => {
      if (resolved) return;
      resolved = true;
      if (unsubscribeFn) { try { unsubscribeFn(); } catch (e) { /* ignore */ } }
      resolve(session);
    };

    const result = supabaseClient.auth.onAuthStateChange((_event, session) => finish(session));
    unsubscribeFn = () => result.data.subscription.unsubscribe();

    // Hard safety net: if the event somehow never fires, fall back to a
    // direct check rather than leaving the caller waiting indefinitely.
    setTimeout(async () => {
      if (resolved) return;
      try {
        const { data } = await supabaseClient.auth.getSession();
        finish(data.session);
      } catch (e) {
        finish(null);
      }
    }, 1000);
  });
}

// Redirect helper: send the visitor to the login page if there's no session,
// or if accounts aren't configured at all yet. Returns the session's user
// on success so the calling page can continue setting itself up.
async function requireSession() {
  if (!CLOUD_ENABLED) {
    document.body.innerHTML = '<div class="gate-message"><p>Accounts aren\'t configured yet.</p><p class="party-hint">See SETUP.md to connect a free Supabase project.</p></div>';
    throw new Error('cloud not enabled');
  }
  const session = await waitForAuthReady();
  if (!session) {
    // Guard against a redirect loop: if we already bounced here once very
    // recently, something's wrong with session detection rather than the
    // person actually being logged out. stop and say so instead of
    // redirecting forever.
    if (sessionStorage.getItem('ff-bounced')) {
      sessionStorage.removeItem('ff-bounced');
      document.body.innerHTML = '<div class="gate-message"><p>Trouble staying signed in.</p><p class="party-hint">Try logging in again. If this keeps happening, clear this site\'s cookies/storage for your browser and retry.</p><p><a href="index.html" class="link-btn">Back to login</a></p></div>';
      throw new Error('redirect loop detected');
    }
    sessionStorage.setItem('ff-bounced', '1');
    window.location.href = 'index.html';
    throw new Error('no session');
  }
  sessionStorage.removeItem('ff-bounced');
  return session.user;
}

async function getDisplayName(userId) {
  const { data } = await supabaseClient.from('profiles').select('display_name').eq('id', userId).single();
  return data ? data.display_name : 'Adventurer';
}

async function signOutAndRedirect() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// login / sign up

const statusEl = document.getElementById('authStatus');
let busy = false;

(async function initLoginPage() {
  if (!CLOUD_ENABLED) {
    document.getElementById('authCard').innerHTML =
      '<p class="party-hint">Accounts aren\'t configured yet. See SETUP.md to connect a free Supabase project, this page can\'t sign anyone in until then.</p>';
    return;
  }
  try {
    const session = await waitForAuthReady();
    if (session) {
      document.getElementById('authCard').innerHTML =
        '<p class="party-hint" style="text-align:center;">You\'re already signed in.</p>' +
        '<p style="text-align:center; margin-top:14px;"><a href="dashboard.html" class="die-btn" style="display:inline-block; text-decoration:none;">Go to Your Parties</a></p>' +
        '<p style="text-align:center; margin-top:12px;"><button class="link-btn" id="notMeBtn">Not you? Log out</button></p>';
      document.getElementById('notMeBtn').addEventListener('click', signOutAndRedirect);
    }
  } catch (err) {
    console.error(err);
    // if the check fails for any reason, do nothing, the login
    // form underneath is the safe default either way.
  }
})();

document.getElementById('tabLogin').addEventListener('click', () => switchTab('login'));
document.getElementById('tabSignup').addEventListener('click', () => switchTab('signup'));
function switchTab(which) {
  const isLogin = which === 'login';
  document.getElementById('loginForm').style.display = isLogin ? '' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : '';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
  document.getElementById('tabLogin').setAttribute('aria-selected', isLogin);
  document.getElementById('tabSignup').setAttribute('aria-selected', !isLogin);
  statusEl.textContent = '';
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  if (busy) return;
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { statusEl.textContent = 'Enter your email and password.'; return; }
  busy = true; statusEl.textContent = 'Signing in…';
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { statusEl.textContent = error.message; return; }
    window.location.href = 'dashboard.html';
  } catch (err) {
    statusEl.textContent = 'Something went wrong: ' + (err && err.message ? err.message : String(err));
  } finally {
    busy = false;
  }
});

document.getElementById('signupBtn').addEventListener('click', async () => {
  if (busy) return;
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) { statusEl.textContent = 'Fill in your name, email, and a password.'; return; }
  if (password.length < 6) { statusEl.textContent = 'Password needs to be at least 6 characters.'; return; }
  busy = true; statusEl.textContent = 'Creating your account…';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password, options: { data: { display_name: name } }
    });
    if (error) { statusEl.textContent = error.message; return; }
    if (data.session) {
      window.location.href = 'dashboard.html';
    } else {
      statusEl.textContent = 'Check your email to confirm your account, then log in.';
    }
  } catch (err) {
    statusEl.textContent = 'Something went wrong: ' + (err && err.message ? err.message : String(err));
  } finally {
    busy = false;
  }
});

['loginPassword'].forEach(id => document.getElementById(id).addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('loginBtn').click(); }
}));
document.getElementById('signupPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('signupBtn').click(); }
});

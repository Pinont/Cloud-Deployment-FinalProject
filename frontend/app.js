// Login / register page. Talks to the gateway: /api/auth/*. Token is kept in localStorage.
const TOKEN_KEY = 'token';

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

function showUser(user) {
  $('user-name').textContent = user.name;
  $('user-email').textContent = user.email;
  $('user-role').textContent = user.role;
  $('guest').hidden = true;
  $('member').hidden = false;
}

function showGuest() {
  $('guest').hidden = false;
  $('member').hidden = true;
}

// Loads the current user with the stored token. `fallback` is used if /auth/me is unavailable.
async function loadUser(fallback) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showGuest();
  const { status, ok, body } = await api('/me', { headers: { Authorization: `Bearer ${token}` } });
  if (ok) return showUser(body);
  if (status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    return showGuest();
  }
  return fallback ? showUser(fallback) : showGuest();
}

function formData(form) {
  return Object.fromEntries(new FormData(form));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const { ok, body } = await api('/login', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  if (!ok) {
    $('login-error').textContent = body.error || 'Login failed';
    return;
  }
  localStorage.setItem(TOKEN_KEY, body.token);
  e.target.reset();
  await loadUser(body.user);
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('register-error').textContent = '';
  $('register-ok').textContent = '';
  const { ok, body } = await api('/register', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  if (!ok) {
    $('register-error').textContent = body.error || 'Registration failed';
    return;
  }
  e.target.reset();
  $('register-ok').textContent = 'Account created. You can log in now.';
});

$('logout').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  showGuest();
});

loadUser();

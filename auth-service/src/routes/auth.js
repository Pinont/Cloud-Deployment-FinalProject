const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const BCRYPT_COST = 10;
const TOKEN_TTL = '1h';
const REFRESH_TTL = '7d';
const INVALID_LOGIN = { error: 'Invalid email or password' };
const INVALID_REFRESH = { error: 'Invalid or expired refresh token' };
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const ACCOUNT_LOCKED = { error: 'Account locked. Try again in 15 minutes' };
// Compared against when the email is unknown so both failures take similar time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

// No lock, or a lock that has run out.
const notLocked = (now) => ({ $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date(now) } }] });

// Every step is a conditional update on the saved document (not the snapshot read at the
// start of the request), so parallel logins cannot lose a failure or overwrite a lock.
async function recordFailedLogin(id, now) {
  // An expired lock starts a fresh count. Only the first request matches, so it resets once.
  await User.updateOne(
    { _id: id, lockUntil: { $lte: new Date(now) } },
    { $set: { failedLogins: 0, lockUntil: null } },
  );
  const updated = await User.findOneAndUpdate({ _id: id }, { $inc: { failedLogins: 1 } }, { new: true });
  if (updated && updated.failedLogins >= MAX_FAILED_LOGINS) {
    // Locks only while the saved count is still at the limit, so a login that reset it meanwhile wins.
    await User.updateOne(
      { _id: id, failedLogins: { $gte: MAX_FAILED_LOGINS }, ...notLocked(now) },
      { $set: { lockUntil: new Date(now + LOCK_MS) } },
    );
  }
}

// A lock set by a parallel failure is left alone: the filter only matches unlocked accounts.
// Returns false when it did not match, i.e. the account was locked after the first lock check.
async function resetFailedLogins(id, now) {
  const result = await User.updateOne({ _id: id, ...notLocked(now) }, { $set: { failedLogins: 0, lockUntil: null } });
  return result.matchedCount > 0;
}

// Refresh tokens use a key derived from JWT_SECRET, so a refresh token is never
// accepted as an access token by services that verify with JWT_SECRET.
const refreshSecret = () => crypto.createHmac('sha256', process.env.JWT_SECRET).update('refresh').digest('hex');

const signAccessToken = (user) => jwt.sign(
  { sub: String(user._id), email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: TOKEN_TTL },
);

const signRefreshToken = (user) => jwt.sign(
  { sub: String(user._id) },
  refreshSecret(),
  { algorithm: 'HS256', expiresIn: REFRESH_TTL },
);

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (typeof password !== 'string' || password.length < 8 || bcrypt.truncates(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and at most 72 bytes' });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const normalized = email.trim().toLowerCase();
    if (await User.exists({ email: normalized })) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // role is never read from the body: new accounts are always 'user'
    const user = await User.create({ email: normalized, passwordHash, name, role: 'user' });
    return res.status(201).json(user.toPublic());
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json(INVALID_LOGIN);
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    const now = Date.now();
    if (user && user.lockUntil && user.lockUntil.getTime() > now) {
      return res.status(423).json(ACCOUNT_LOCKED);
    }

    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        await recordFailedLogin(user._id, now);
      }
      return res.status(401).json(INVALID_LOGIN);
    }

    if (!(await resetFailedLogins(user._id, now))) {
      return res.status(423).json(ACCOUNT_LOCKED);
    }
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    return res.status(200).json({ token, refreshToken, user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string') {
      return res.status(401).json(INVALID_REFRESH);
    }
    let payload;
    try {
      payload = jwt.verify(refreshToken, refreshSecret(), { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json(INVALID_REFRESH);
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json(INVALID_REFRESH);
    }
    return res.status(200).json({ token: signAccessToken(user) });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    return res.status(200).json(user.toPublic());
  } catch (err) {
    return next(err);
  }
});

// Only `name` can be changed: email and role are immutable.
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name },
      { new: true, runValidators: true },
    );
    if (!user) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    return res.status(200).json(user.toPublic());
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

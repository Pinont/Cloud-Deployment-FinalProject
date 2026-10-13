const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const BCRYPT_COST = 10;
const TOKEN_TTL = '1h';
const INVALID_LOGIN = { error: 'Invalid email or password' };
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
async function resetFailedLogins(id, now) {
  await User.updateOne({ _id: id, ...notLocked(now) }, { $set: { failedLogins: 0, lockUntil: null } });
}

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

    await resetFailedLogins(user._id, now);
    const token = jwt.sign(
      { sub: String(user._id), email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: TOKEN_TTL },
    );
    return res.status(200).json({ token, user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

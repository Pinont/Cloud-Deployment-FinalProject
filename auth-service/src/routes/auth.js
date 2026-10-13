const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const BCRYPT_COST = 10;
const TOKEN_TTL = '1h';
const INVALID_LOGIN = { error: 'Invalid email or password' };
// Compared against when the email is unknown so both failures take similar time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

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
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json(INVALID_LOGIN);
    }

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

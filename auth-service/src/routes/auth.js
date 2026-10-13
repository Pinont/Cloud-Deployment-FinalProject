const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const BCRYPT_COST = 10;

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

module.exports = router;

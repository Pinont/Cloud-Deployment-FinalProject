const express = require('express');
const jwt = require('jsonwebtoken');

const DEFAULT_JWT_SECRET = 'test-secret';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function authenticate(req, res, next) {
  const authHeader = req.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function createRateLimiter({ maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  const requestBuckets = new Map();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const current = requestBuckets.get(key);

    if (!current || now >= current.expiresAt) {
      requestBuckets.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      return res.status(429).json({ message: 'Too Many Requests' });
    }

    current.count += 1;
    return next();
  };
}

function createApp({ favorites = [] } = {}) {
  const app = express();
  const rateLimiter = createRateLimiter();

  app.get('/favorites/me', rateLimiter, authenticate, (req, res) => {
    const userFavorites = favorites.filter((favorite) => favorite.userId === req.user.sub);
    res.json(userFavorites);
  });

  return app;
}

module.exports = { createApp, DEFAULT_JWT_SECRET };

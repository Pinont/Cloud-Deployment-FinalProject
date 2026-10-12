const express = require('express');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function authenticate(jwtSecret) {
  return (req, res, next) => {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload;
      return next();
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  };
}

function createApp({ favorites = [], jwtSecret = process.env.JWT_SECRET } = {}) {
  if (typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET must be set');
  }

  const app = express();
  const rateLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too Many Requests' }
  });

  app.get('/favorites/me', rateLimiter, authenticate(jwtSecret), (req, res) => {
    const userFavorites = favorites.filter((favorite) => favorite.userId === req.user.sub);
    res.json(userFavorites);
  });

  return app;
}

module.exports = { createApp };

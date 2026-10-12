const express = require('express');
const jwt = require('jsonwebtoken');

const DEFAULT_JWT_SECRET = 'test-secret';

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

function createApp({ favorites = [] } = {}) {
  const app = express();

  app.get('/favorites/me', authenticate, (req, res) => {
    const userFavorites = favorites.filter((favorite) => favorite.userId === req.user.sub);
    res.json(userFavorites);
  });

  return app;
}

module.exports = { createApp, DEFAULT_JWT_SECRET };

const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

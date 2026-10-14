const express = require('express');
const Restaurant = require('../models/restaurant');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// #5 — logged-in users can add a restaurant; the creator becomes the owner.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, category, priceRange, address } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Number.isInteger(priceRange) || priceRange < 1 || priceRange > 4) {
      return res.status(400).json({ error: 'priceRange must be 1-4' });
    }
    const restaurant = await Restaurant.create({
      name,
      category,
      priceRange,
      address,
      ownerId: req.user.id,
    });
    return res.status(201).json(restaurant);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

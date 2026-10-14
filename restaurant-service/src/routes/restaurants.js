const express = require('express');
const Restaurant = require('../models/restaurant');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// #6 — public search: ?category=&price=&sort=rating
router.get('/', async (req, res, next) => {
  try {
    const { category, price, sort } = req.query;
    const filter = {};

    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ error: 'category must be a non-empty string' });
      }
      filter.category = category.trim().toLowerCase();
    }
    if (price !== undefined) {
      const priceRange = Number(price);
      if (!Number.isInteger(priceRange) || priceRange < 1 || priceRange > 4) {
        return res.status(400).json({ error: 'price must be 1-4' });
      }
      filter.priceRange = priceRange;
    }
    if (sort !== undefined && sort !== 'rating') {
      return res.status(400).json({ error: 'sort must be "rating"' });
    }

    const order = sort === 'rating' ? { avgRating: -1, reviewCount: -1 } : { createdAt: -1 };
    const restaurants = await Restaurant.find(filter).sort(order);
    return res.json(restaurants);
  } catch (err) {
    return next(err);
  }
});

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

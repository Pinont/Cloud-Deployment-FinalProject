const express = require('express');
const mongoose = require('mongoose');
const Restaurant = require('../models/restaurant');
const { requireAuth } = require('../middleware/auth');
const hours = require('../utils/hours');

const router = express.Router();

// #6 — public search: ?category=&price=&sort=rating
// #37 — &openNow=true keeps only restaurants open at the current time.
router.get('/', async (req, res, next) => {
  try {
    const { category, price, sort, openNow } = req.query;
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
    if (openNow !== undefined && openNow !== 'true') {
      return res.status(400).json({ error: 'openNow must be "true"' });
    }

    const order = sort === 'rating' ? { avgRating: -1, reviewCount: -1 } : { createdAt: -1 };
    let restaurants = await Restaurant.find(filter).sort(order);
    if (openNow === 'true') {
      // Overnight hours (e.g. 18:00–02:00) are easier to check here than in a Mongo query.
      const now = hours.currentTime();
      restaurants = restaurants.filter((r) => hours.isOpenAt(r.openTime, r.closeTime, now));
    }
    return res.json(restaurants);
  } catch (err) {
    return next(err);
  }
});

// #7 — public detail; review/favorite use it to check that a restaurant exists.
// A malformed id is reported as 404 too, so callers only need to handle "found" vs "not found".
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    return res.json(restaurant);
  } catch (err) {
    return next(err);
  }
});

// #5 — logged-in users can add a restaurant; the creator becomes the owner.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, category, priceRange, address, openTime, closeTime } = req.body || {};
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
      openTime,
      closeTime,
      ownerId: req.user.id,
    });
    return res.status(201).json(restaurant);
  } catch (err) {
    return next(err);
  }
});

// #9 — internal: review-service sends the recomputed average and count after a review
// is added or deleted. Values are stored as given; the last review deleted → 0 / 0.
router.patch('/:id/rating', async (req, res, next) => {
  try {
    const { avgRating, reviewCount } = req.body || {};
    if (!Number.isInteger(reviewCount) || reviewCount < 0) {
      return res.status(400).json({ error: 'reviewCount must be an integer >= 0' });
    }
    const validAvg = typeof avgRating === 'number' && avgRating >= 0 && avgRating <= 5;
    if (!validAvg || (reviewCount === 0 && avgRating !== 0) || (reviewCount > 0 && avgRating < 1)) {
      return res.status(400).json({
        error: 'avgRating must be 1-5, or 0 when reviewCount is 0',
      });
    }
    const restaurant = mongoose.isValidObjectId(req.params.id)
      ? await Restaurant.findByIdAndUpdate(
          req.params.id,
          { avgRating, reviewCount },
          { new: true },
        )
      : null;
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    return res.json(restaurant);
  } catch (err) {
    return next(err);
  }
});

// Loads req.params.id for #8; 404 if missing, 403 unless the token user is the owner.
async function loadOwnRestaurant(req, res, next) {
  try {
    const restaurant = mongoose.isValidObjectId(req.params.id)
      ? await Restaurant.findById(req.params.id)
      : null;
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    if (restaurant.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can change this restaurant' });
    }
    req.restaurant = restaurant;
    return next();
  } catch (err) {
    return next(err);
  }
}

const EDITABLE_FIELDS = ['name', 'category', 'priceRange', 'address', 'openTime', 'closeTime'];

// #8 — owner updates the editable fields (fields left out stay as they are).
router.put('/:id', requireAuth, loadOwnRestaurant, async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = Object.fromEntries(
      EDITABLE_FIELDS.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
    );
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: `Provide at least one of: ${EDITABLE_FIELDS.join(', ')}` });
    }
    if ('name' in updates && (typeof updates.name !== 'string' || !updates.name.trim())) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (
      'priceRange' in updates &&
      (!Number.isInteger(updates.priceRange) || updates.priceRange < 1 || updates.priceRange > 4)
    ) {
      return res.status(400).json({ error: 'priceRange must be 1-4' });
    }
    req.restaurant.set(updates);
    await req.restaurant.save();
    return res.json(req.restaurant);
  } catch (err) {
    return next(err);
  }
});

// #8 — owner deletes the restaurant; returns the deleted document.
router.delete('/:id', requireAuth, loadOwnRestaurant, async (req, res, next) => {
  try {
    await req.restaurant.deleteOne();
    return res.json(req.restaurant);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

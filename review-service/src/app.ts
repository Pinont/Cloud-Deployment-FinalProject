import express, { Express, Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from './auth';
import { Review as DefaultReviewModel } from './model';
import { createRestaurantClient, RestaurantExistsFn } from './restaurantClient';

export interface CreateAppOptions {
  jwtSecret?: string;
  checkRestaurantExists?: RestaurantExistsFn;
  reviewModel?: typeof DefaultReviewModel;
}

export function createApp({
  jwtSecret = process.env.JWT_SECRET,
  checkRestaurantExists = createRestaurantClient(),
  reviewModel = DefaultReviewModel
}: CreateAppOptions = {}): Express {
  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET must be set');
  }

  const app = express();
  app.use(express.json());

  const router = Router();
  const requireAuth = authenticate(jwtSecret);

  router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const { restaurantId, rating, comment } = req.body || {};

    if (!restaurantId || typeof restaurantId !== 'string' || restaurantId.trim() === '') {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    if (typeof rating !== 'number' || Number.isNaN(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be between 1 and 5' });
      return;
    }

    if (comment !== undefined && typeof comment !== 'string') {
      res.status(400).json({ error: 'Comment must be a string' });
      return;
    }

    const normalizedRestaurantId = restaurantId.trim();

    try {
      const exists = await checkRestaurantExists(normalizedRestaurantId);
      if (!exists) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }
    } catch {
      res.status(503).json({ error: 'Restaurant service unavailable' });
      return;
    }

    try {
      const review = await reviewModel.create({
        userId: req.user!.sub,
        restaurantId: normalizedRestaurantId,
        rating,
        comment: comment ? comment.trim() : ''
      });

      res.status(201).json(review);
    } catch (err: any) {
      if (err.code === 11000) {
        res.status(409).json({ error: 'User has already reviewed this restaurant' });
        return;
      }
      if (err.name === 'ValidationError') {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/restaurant/:id', async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const restaurantId = typeof rawId === 'string' ? rawId.trim() : '';

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    try {
      const reviews = await reviewModel
        .find({ restaurantId })
        .sort({ createdAt: -1 })
        .select('-__v');

      res.status(200).json(reviews);
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/restaurant/:id/rating', async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const restaurantId = typeof rawId === 'string' ? rawId.trim() : '';

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    try {
      const summary = await reviewModel.aggregate([
        { $match: { restaurantId } },
        {
          $group: {
            _id: '$restaurantId',
            avgRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 }
          }
        }
      ]);

      if (!summary || summary.length === 0) {
        res.status(200).json({ avgRating: 0, reviewCount: 0 });
        return;
      }

      const avg = Math.round(summary[0].avgRating * 10) / 10;
      res.status(200).json({
        avgRating: avg,
        reviewCount: summary[0].reviewCount
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:id/like', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const reviewId = typeof rawId === 'string' ? rawId.trim() : '';

    if (!mongoose.isValidObjectId(reviewId)) {
      res.status(400).json({ error: 'Invalid review id' });
      return;
    }

    const sub = req.user!.sub;

    try {
      const doc = await reviewModel.findOneAndUpdate(
        { _id: reviewId, likedBy: { $ne: sub } },
        { $addToSet: { likedBy: sub }, $inc: { likes: 1 } },
        { new: true }
      );

      if (doc) {
        res.status(200).json({ liked: true, likes: doc.likes || 0 });
        return;
      }

      const existing = await reviewModel.findById(reviewId);
      if (!existing) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      res.status(200).json({ liked: true, likes: existing.likes || 0 });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id/like', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const reviewId = typeof rawId === 'string' ? rawId.trim() : '';

    if (!mongoose.isValidObjectId(reviewId)) {
      res.status(400).json({ error: 'Invalid review id' });
      return;
    }

    const sub = req.user!.sub;

    try {
      const doc = await reviewModel.findOneAndUpdate(
        { _id: reviewId, likedBy: sub },
        { $pull: { likedBy: sub }, $inc: { likes: -1 } },
        { new: true }
      );

      if (doc) {
        res.status(200).json({ liked: false, likes: doc.likes || 0 });
        return;
      }

      const existing = await reviewModel.findById(reviewId);
      if (!existing) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      res.status(200).json({ liked: false, likes: existing.likes || 0 });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use('/reviews', router);

  return app;
}

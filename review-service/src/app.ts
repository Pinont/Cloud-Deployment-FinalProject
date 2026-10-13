import express, { Express, Request, Response, Router } from 'express';
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

  // Support both /reviews (direct service call) and /api/reviews (gateway pass-through)
  app.use('/reviews', router);
  app.use('/api/reviews', router);

  return app;
}

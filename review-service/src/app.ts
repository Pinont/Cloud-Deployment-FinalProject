import express, { Express, Request, Response, NextFunction } from 'express';
import { authenticate } from './middleware/auth';
import { Review as DefaultReviewModel } from './models/review';
import {
  createRestaurantClient,
  RestaurantExistsFn,
  GetRestaurantOwnerFn,
  UpdateRestaurantRatingFn
} from './clients/restaurantClient';
import { createReviewRouter } from './routes/reviews';

export interface CreateAppOptions {
  jwtSecret?: string;
  checkRestaurantExists?: RestaurantExistsFn;
  getRestaurantOwner?: GetRestaurantOwnerFn;
  updateRestaurantRating?: UpdateRestaurantRatingFn;
  reviewModel?: typeof DefaultReviewModel;
}

export function createApp({
  jwtSecret = process.env.JWT_SECRET,
  checkRestaurantExists = createRestaurantClient().checkRestaurantExists,
  getRestaurantOwner = createRestaurantClient().getRestaurantOwner,
  updateRestaurantRating = createRestaurantClient().updateRestaurantRating,
  reviewModel = DefaultReviewModel
}: CreateAppOptions = {}): Express {
  if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET must be set');
  }

  const app = express();
  app.use(express.json());

  // Health check endpoint (for Docker / Nginx gateway)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  const requireAuth = authenticate(jwtSecret);

  // Mount review routes
  app.use(
    '/reviews',
    createReviewRouter({
      requireAuth,
      checkRestaurantExists,
      getRestaurantOwner,
      updateRestaurantRating,
      reviewModel
    })
  );

  // 404 handler for unknown routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global Error Handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const status = err.status || err.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: err.message || 'Client error' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

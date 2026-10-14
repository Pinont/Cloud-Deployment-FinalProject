import { Request, Response, Router, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Review as DefaultReviewModel } from '../models/review';
import { RestaurantExistsFn, UpdateRestaurantRatingFn } from '../clients/restaurantClient';

export interface CreateReviewRouterOptions {
  requireAuth: RequestHandler;
  checkRestaurantExists: RestaurantExistsFn;
  updateRestaurantRating?: UpdateRestaurantRatingFn;
  reviewModel?: typeof DefaultReviewModel;
}

async function computeRestaurantRating(
  model: typeof DefaultReviewModel,
  restaurantId: string,
  excludeReviewId?: mongoose.Types.ObjectId | string
): Promise<{ avgRating: number; reviewCount: number }> {
  const match: Record<string, unknown> = { restaurantId };
  if (excludeReviewId) {
    const objectId = mongoose.isValidObjectId(excludeReviewId)
      ? new mongoose.Types.ObjectId(excludeReviewId)
      : excludeReviewId;
    match._id = { $ne: objectId };
  }

  const summary = await model.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$restaurantId',
        avgRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  if (!summary || summary.length === 0) {
    return { avgRating: 0, reviewCount: 0 };
  }

  return {
    avgRating: Math.round(summary[0].avgRating * 10) / 10,
    reviewCount: summary[0].reviewCount
  };
}

export function createReviewRouter({
  requireAuth,
  checkRestaurantExists,
  updateRestaurantRating,
  reviewModel = DefaultReviewModel
}: CreateReviewRouterOptions): Router {
  const router = Router();

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
      const { avgRating, reviewCount } = await computeRestaurantRating(reviewModel, restaurantId);
      res.status(200).json({ avgRating, reviewCount });
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

// ponytail: in-memory queue per restaurantId serializes delete-and-update flow to prevent out-of-order race conditions on rating updates. Ceiling = single instance; upgrade = distributed lock (e.g. Redis Redlock) or versioned PATCH.
const restaurantQueues = new Map<string, Promise<unknown>>();

function runPerRestaurant<T>(restaurantId: string, task: () => Promise<T>): Promise<T> {
  const prev = restaurantQueues.get(restaurantId) || Promise.resolve();
  const current = prev.catch(() => {}).then(task);
  const cleanup: Promise<unknown> = current.finally(() => {
    if (restaurantQueues.get(restaurantId) === cleanup) {
      restaurantQueues.delete(restaurantId);
    }
  });
  restaurantQueues.set(restaurantId, cleanup);
  return cleanup as Promise<T>;
}

  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params.id;
    const reviewId = typeof rawId === 'string' ? rawId.trim() : '';

    if (!mongoose.isValidObjectId(reviewId)) {
      res.status(400).json({ error: 'Invalid review id' });
      return;
    }

    const sub = req.user!.sub;

    try {
      const review = await reviewModel.findById(reviewId);
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      if (review.userId !== sub) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await runPerRestaurant(review.restaurantId, async () => {
        const { avgRating, reviewCount } = await computeRestaurantRating(
          reviewModel,
          review.restaurantId,
          review._id
        );

        await reviewModel.findByIdAndDelete(reviewId);

        if (updateRestaurantRating) {
          try {
            await updateRestaurantRating(review.restaurantId, avgRating, reviewCount);
          } catch (err: any) {
            // Failure of restaurant-service handled gracefully per spec
            // eslint-disable-next-line no-console
            console.warn(
              `Failed to update rating for restaurant ${review.restaurantId}:`,
              err?.message || err
            );
          }
        }
      });

      res.status(200).json({ message: 'Review deleted successfully' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createRestaurantClient, type RestaurantExistsFn } from './restaurantClient';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

export interface Favorite {
  userId: string;
  restaurantId: string;
  listName?: string;
}

interface AuthenticatedPayload extends JwtPayload {
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedPayload;
    }
  }
}

function authenticate(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    try {
      const payload = jwt.verify(authHeader.slice('Bearer '.length), jwtSecret, {
        algorithms: ['HS256']
      });

      if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub === '') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      req.user = payload as AuthenticatedPayload;
      next();
    } catch {
      res.status(401).json({ message: 'Unauthorized' });
    }
  };
}

export interface CreateAppOptions {
  favorites?: Favorite[];
  jwtSecret?: string;
  checkRestaurantExists?: RestaurantExistsFn;
}

export function createApp({
  favorites = [],
  jwtSecret = process.env.JWT_SECRET,
  checkRestaurantExists = createRestaurantClient()
}: CreateAppOptions = {}) {
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
  const requireAuth = authenticate(jwtSecret);

  app.use(express.json());

  app.post('/favorites', rateLimiter, requireAuth, async (req, res): Promise<void> => {
    const { restaurantId, listName } = req.body || {};

    if (typeof restaurantId !== 'string' || restaurantId.trim() === '') {
      res.status(400).json({ message: 'restaurantId is required' });
      return;
    }

    if (listName !== undefined && (typeof listName !== 'string' || listName.trim() === '')) {
      res.status(400).json({ message: 'listName must be a non-empty string' });
      return;
    }

    const normalizedRestaurantId = restaurantId.trim();
    const normalizedListName = listName === undefined ? 'ร้านโปรด' : listName.trim();

    if (
      favorites.some(
        (favorite) =>
          favorite.userId === req.user?.sub && favorite.restaurantId === normalizedRestaurantId
      )
    ) {
      res.status(409).json({ message: 'Restaurant is already in favorites' });
      return;
    }

    try {
      const exists = await checkRestaurantExists(normalizedRestaurantId);
      if (!exists) {
        res.status(404).json({ message: 'Restaurant not found' });
        return;
      }
    } catch {
      res.status(503).json({ message: 'Restaurant service unavailable' });
      return;
    }

    const favorite: Favorite = {
      userId: req.user!.sub,
      restaurantId: normalizedRestaurantId,
      listName: normalizedListName
    };
    favorites.push(favorite);
    res.status(201).json(favorite);
  });

  app.get('/favorites/me', rateLimiter, requireAuth, (req, res) => {
    const userFavorites = favorites.filter((favorite) => favorite.userId === req.user?.sub);
    res.json(userFavorites);
  });

  app.delete('/favorites/:restaurantId', rateLimiter, requireAuth, (req, res) => {
    const favoriteIndex = favorites.findIndex(
      (favorite) => favorite.userId === req.user?.sub && favorite.restaurantId === req.params.restaurantId
    );

    if (favoriteIndex === -1) {
      res.status(404).json({ message: 'Favorite not found' });
      return;
    }

    favorites.splice(favoriteIndex, 1);
    res.status(204).send();
  });

  return app;
}
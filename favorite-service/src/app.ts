import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { createRestaurantClient, type RestaurantExistsFn } from './restaurantClient';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
export const DEFAULT_LIST_NAME = 'ร้านโปรด';

export interface Favorite {
  userId: string;
  restaurantId: string;
  listName?: string;
}

export interface ShareLink {
  token: string;
  ownerId: string;
  listName: string;
}

interface AuthenticatedPayload extends JwtPayload {
  sub: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function getListName(favorite: Favorite): string {
  return favorite.listName ?? DEFAULT_LIST_NAME;
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
  sharedLinks?: ShareLink[];
  jwtSecret?: string;
  checkRestaurantExists?: RestaurantExistsFn;
  persistFavorite?: (favorite: Favorite) => Promise<void>;
  deleteFavorite?: (favorite: Favorite) => Promise<void>;
  persistShareLink?: (shareLink: ShareLink) => Promise<void>;
  revokeShareLink?: (shareLink: ShareLink) => Promise<void>;
}

export function createApp({
  favorites = [],
  sharedLinks = [],
  jwtSecret = process.env.JWT_SECRET,
  checkRestaurantExists = createRestaurantClient(),
  persistFavorite,
  deleteFavorite,
  persistShareLink,
  revokeShareLink
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
    const normalizedListName = listName === undefined ? DEFAULT_LIST_NAME : listName.trim();

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

    if (
      favorites.some(
        (favorite) =>
          favorite.userId === req.user?.sub && favorite.restaurantId === normalizedRestaurantId
            && getListName(favorite) === normalizedListName
      )
    ) {
      res.status(409).json({ message: 'Restaurant is already in favorites' });
      return;
    }

    const favorite: Favorite = {
      userId: req.user!.sub,
      restaurantId: normalizedRestaurantId,
      listName: normalizedListName
    };

    if (persistFavorite) {
      try {
        await persistFavorite(favorite);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          res.status(409).json({ message: 'Restaurant is already in favorites' });
          return;
        }
        res.status(503).json({ message: 'Favorite service unavailable' });
        return;
      }
    }

    favorites.push(favorite);
    res.status(201).json(favorite);
  });

  app.get('/favorites/me', rateLimiter, requireAuth, (req, res) => {
    const { listName } = req.query;
    if (listName !== undefined && (typeof listName !== 'string' || listName.trim() === '')) {
      res.status(400).json({ message: 'listName must be a non-empty string' });
      return;
    }

    const normalizedListName = typeof listName === 'string' ? listName.trim() : undefined;
    const userFavorites = favorites.filter(
      (favorite) =>
        favorite.userId === req.user?.sub &&
        (normalizedListName === undefined || getListName(favorite) === normalizedListName)
    );
    res.json(userFavorites);
  });

  app.post('/favorites/share', rateLimiter, requireAuth, async (req, res): Promise<void> => {
    const { listName } = req.body || {};
    if (listName !== undefined && (typeof listName !== 'string' || listName.trim() === '')) {
      res.status(400).json({ message: 'listName must be a non-empty string' });
      return;
    }

    const normalizedListName = typeof listName === 'string' ? listName.trim() : DEFAULT_LIST_NAME;
    const existingShare = sharedLinks.find(
      (shareLink) =>
        shareLink.ownerId === req.user?.sub && shareLink.listName === normalizedListName
    );
    if (existingShare) {
      res.status(200).json({
        token: existingShare.token,
        listName: existingShare.listName,
        url: `/favorites/shared/${existingShare.token}`
      });
      return;
    }

    const shareLink: ShareLink = {
      token: randomBytes(32).toString('hex'),
      ownerId: req.user!.sub,
      listName: normalizedListName
    };

    if (persistShareLink) {
      try {
        await persistShareLink(shareLink);
      } catch {
        res.status(503).json({ message: 'Favorite service unavailable' });
        return;
      }
    }

    sharedLinks.push(shareLink);
    res.status(201).json({
      token: shareLink.token,
      listName: shareLink.listName,
      url: `/favorites/shared/${shareLink.token}`
    });
  });

  app.get('/favorites/shared/:token', rateLimiter, (req, res) => {
    const shareLink = sharedLinks.find((candidate) => candidate.token === req.params.token);
    if (!shareLink) {
      res.status(404).json({ message: 'Shared favorite list not found' });
      return;
    }

    const sharedFavorites = favorites
      .filter(
        (favorite) =>
          favorite.userId === shareLink.ownerId &&
          getListName(favorite) === shareLink.listName
      )
      .map((favorite) => ({
        restaurantId: favorite.restaurantId,
        listName: getListName(favorite)
      }));

    res.json({ listName: shareLink.listName, favorites: sharedFavorites });
  });

  app.delete('/favorites/share', rateLimiter, requireAuth, async (req, res): Promise<void> => {
    const { listName } = req.query;
    if (listName !== undefined && (typeof listName !== 'string' || listName.trim() === '')) {
      res.status(400).json({ message: 'listName must be a non-empty string' });
      return;
    }

    const normalizedListName = typeof listName === 'string' ? listName.trim() : DEFAULT_LIST_NAME;
    const shareIndex = sharedLinks.findIndex(
      (shareLink) =>
        shareLink.ownerId === req.user?.sub && shareLink.listName === normalizedListName
    );
    if (shareIndex === -1) {
      res.status(404).json({ message: 'Shared favorite list not found' });
      return;
    }

    const shareLink = sharedLinks[shareIndex];
    if (revokeShareLink) {
      try {
        await revokeShareLink(shareLink);
      } catch {
        res.status(503).json({ message: 'Favorite service unavailable' });
        return;
      }
    }

    sharedLinks.splice(shareIndex, 1);
    res.status(204).send();
  });

  app.delete('/favorites/:restaurantId', rateLimiter, requireAuth, async (req, res): Promise<void> => {
    const { listName } = req.query;
    if (listName !== undefined && (typeof listName !== 'string' || listName.trim() === '')) {
      res.status(400).json({ message: 'listName must be a non-empty string' });
      return;
    }

    const normalizedListName = typeof listName === 'string' ? listName.trim() : DEFAULT_LIST_NAME;
    const favoriteIndex = favorites.findIndex(
      (favorite) =>
        favorite.userId === req.user?.sub &&
        favorite.restaurantId === req.params.restaurantId &&
        getListName(favorite) === normalizedListName
    );

    if (favoriteIndex === -1) {
      res.status(404).json({ message: 'Favorite not found' });
      return;
    }

    const favorite = favorites[favoriteIndex];

    if (deleteFavorite) {
      try {
        await deleteFavorite(favorite);
      } catch {
        res.status(503).json({ message: 'Favorite service unavailable' });
        return;
      }
    }

    const currentFavoriteIndex = favorites.findIndex((candidate) => candidate === favorite);
    if (currentFavoriteIndex === -1) {
      res.status(404).json({ message: 'Favorite not found' });
      return;
    }

    favorites.splice(currentFavoriteIndex, 1);
    res.status(204).send();
  });

  return app;
}
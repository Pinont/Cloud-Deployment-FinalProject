import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthenticatedPayload extends JwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedPayload;
    }
  }
}

export function authenticate(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const token = authHeader.slice('Bearer '.length);
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256']
      });

      if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub.trim() === '') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      req.user = payload as AuthenticatedPayload;
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

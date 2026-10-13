const jwt = require('jsonwebtoken');

/**
 * Express middleware that verifies the `Authorization: Bearer <token>` header.
 * On success it sets `req.user = { id, email, role }` (from the JWT claims) and calls next().
 * A missing, malformed, invalid or expired token gets a 401.
 *
 * Other services can copy this file: it only needs `jsonwebtoken` and the shared
 * `JWT_SECRET` env var. Tokens are signed with HS256, so only that algorithm is accepted.
 */
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
}

module.exports = requireAuth;

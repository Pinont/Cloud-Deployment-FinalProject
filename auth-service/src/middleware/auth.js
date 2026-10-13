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

/**
 * Use after requireAuth: allows the request only when the JWT's role is one of `roles`
 * (e.g. `app.delete('/x/:id', requireAuth, requireRole('owner', 'admin'), handler)`), else 403.
 * The role comes from the token, so a role change applies once the user gets a new token
 * (login or refresh, at most 1 hour). Check the database as well for sensitive actions.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = requireAuth;
module.exports.requireRole = requireRole;

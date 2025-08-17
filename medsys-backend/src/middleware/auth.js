// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Create a token for a user object: { id, username, role, idPersonal? }
function signToken(user) {
  return jwt.sign({ user }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Read "Authorization: Bearer <token>" and attach req.user
function authRequired(req, res, next) {
  try {
    const hdr = String(req.headers.authorization || '');
    const [, token] = hdr.split(' ');
    if (!token) return res.status(401).json({ ok: false, error: 'No autorizado' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload.user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token inválido o vencido' });
  }
}

// Allow everyone to read (GET/HEAD/OPTIONS). Require admin for writes.
function adminWritesOnly(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Requiere rol admin para escribir' });
  }
  next();
}

module.exports = { signToken, authRequired, adminWritesOnly };

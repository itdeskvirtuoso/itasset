// Shared request hygiene for the API routes.

const JWT_MIN_LENGTH = 32;

// The signing key must come from the environment. There is deliberately no fallback:
// a guessable default would let anyone mint a Super Admin token.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  return secret && secret.length >= JWT_MIN_LENGTH ? secret : null;
}

// Plain string from untrusted input, so objects like { "$ne": null } never reach a Mongo query.
function toStr(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

// Copy only the whitelisted keys that are actually present in the body.
function pick(body, fields) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) out[field] = body[field];
  });
  return out;
}

// 400/409 for problems the user can fix; a generic 500 otherwise (details stay in the server log).
function sendError(res, err, context) {
  if (err && err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => e.message).join(' ');
    return res.status(400).json({ message: details || 'Some fields are invalid.' });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for "${err.path}".` });
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ message: `A record with this ${field} already exists.` });
  }
  console.error(`[${context}]`, err);
  return res.status(500).json({ message: 'Something went wrong on the server. Please try again.' });
}

module.exports = { getJwtSecret, toStr, pick, sendError };

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { getJwtSecret, sendError } = require('../utils/security');

// Verifies the Bearer token, then re-reads the user from the database on every request,
// so a deleted, blocked or re-roled account loses access immediately (not when the token expires).
module.exports = async function auth(req, res, next) {
  const secret = getJwtSecret();
  if (!secret) {
    console.error('JWT_SECRET is missing or shorter than 32 characters.');
    return res.status(500).json({ message: 'Sign-in is not configured on the server. Contact the administrator.' });
  }

  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Your session has expired. Please sign in again.' });
  }

  const userId = payload && payload.user && payload.user.id;
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Your session is invalid. Please sign in again.' });
  }

  try {
    const user = await User.findById(userId).select('username role isBlocked').lean();
    if (!user) {
      return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'This account no longer exists.' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ code: 'ACCOUNT_BLOCKED', message: 'Your account has been blocked by the administrator.' });
    }
    req.user = { id: String(user._id), username: user.username, role: user.role };
    next();
  } catch (err) {
    sendError(res, err, 'auth');
  }
};

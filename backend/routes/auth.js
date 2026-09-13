const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/roleCheck');
const { getJwtSecret, toStr, sendError } = require('../utils/security');

// @route   POST /api/auth/register
// @desc    Register a new user (Only Super Admin)
// @access  Private (Super Admin only)
router.post('/register', auth, requireSuperAdmin, async (req, res) => {
  try {
    // Stored exactly as /login looks it up (trimmed + lowercase), so the new user can sign in
    const username = toStr(req.body.username).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = toStr(req.body.role);

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return res.status(400).json({ message: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Validate role against the schema's list
    if (!User.schema.path('role').enumValues.includes(role)) {
      return res.status(400).json({ message: 'Invalid role selected.' });
    }

    // Check if user exists
    if (await User.exists({ username })) {
      return res.status(400).json({ message: `The username "${username}" is already taken.` });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const user = await User.create({
      username,
      password: await bcrypt.hash(password, salt),
      role
    });

    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    sendError(res, err, 'auth/register');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      console.error('JWT_SECRET is missing or shorter than 32 characters.');
      return res.status(500).json({ message: 'Sign-in is not configured on the server. Contact the administrator.' });
    }

    // Usernames are stored trimmed + lowercase (models/User.js), so match the same way
    const username = toStr(req.body.username).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ message: 'Please enter both username and password.' });
    }

    // Unknown user and wrong password get the same answer, so accounts can't be probed
    const user = await User.findOne({ username });
    const isMatch = user ? await bcrypt.compare(password, user.password) : false;
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ code: 'ACCOUNT_BLOCKED', message: 'Your account has been blocked by the administrator.' });
    }

    // Create JWT Payload
    const payload = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };

    // Sign Token
    jwt.sign(payload, secret, { expiresIn: '1d', algorithm: 'HS256' }, (err, token) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ message: 'Could not create a session. Please try again.' });
      }
      res.json({ token, user: payload.user });
    });
  } catch (err) {
    sendError(res, err, 'auth/login');
  }
});

// @route   GET /api/auth/me
// @desc    Re-check a saved session against the database (user still exists, not blocked)
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username role employeeId').lean();
    res.json({ user: { id: String(user._id), username: user.username, role: user.role, employeeId: user.employeeId || '' } });
  } catch (err) {
    sendError(res, err, 'auth/me');
  }
});

// @route   GET /api/auth/role-stats
// @desc    Get user counts grouped by role
// @access  Private (Super Admin only)
router.get('/role-stats', auth, requireSuperAdmin, async (req, res) => {
  try {
    const stats = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
    res.json(stats);
  } catch (err) {
    sendError(res, err, 'auth/role-stats');
  }
});

module.exports = router;

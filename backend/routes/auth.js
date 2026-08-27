const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate role
    const validRoles = ['Super Admin', 'User 1', 'User 2'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role selected.' });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Create new user instance
    user = new User({
      name,
      email,
      password,
      role
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // Create JWT Payload
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };

    // Sign Token
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret_key', // Ensure JWT_SECRET is in .env in production
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({ token, user: payload.user });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account has been blocked by the administrator.' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    // Create JWT Payload
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };

    // Sign Token
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: payload.user });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
});

// @route   GET /api/auth/role-stats
// @desc    Get user counts grouped by role
// @access  Public (should be protected in prod)
router.get('/role-stats', async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    res.json(stats);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error: ' + err.message });
  }
});

module.exports = router;

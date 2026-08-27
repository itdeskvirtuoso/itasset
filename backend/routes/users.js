const express = require('express');
const router = express.Router();
const User = require('../models/User');

// @route   GET /api/users
// @desc    Get all registered users (excluding passwords)
// @access  Public (should be protected in prod)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete a user
// @access  Public
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/users/:id/block
// @desc    Toggle block status of a user
// @access  Public
router.put('/:id/block', async (req, res) => {
  try {
    const { isBlocked } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isBlocked = isBlocked;
    await user.save();
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

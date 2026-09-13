const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/roleCheck');
const { sendError } = require('../utils/security');

// Every user-management action is Super Admin only
router.use(auth, requireSuperAdmin);

// Refuses changes that would leave the system without an active Super Admin
async function protectsLastAdmin(target) {
  if (target.role !== 'Super Admin' || target.isBlocked) return false;
  const activeAdmins = await User.countDocuments({ role: 'Super Admin', isBlocked: { $ne: true } });
  return activeAdmins <= 1;
}

// @route   GET /api/users
// @desc    Get all registered users (excluding passwords)
// @access  Private (Super Admin only)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    sendError(res, err, 'users/list');
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete a user
// @access  Private (Super Admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id.' });
    if (req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account.' });

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (await protectsLastAdmin(user)) {
      return res.status(400).json({ message: 'This is the last active Super Admin and cannot be removed.' });
    }

    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User removed' });
  } catch (err) {
    sendError(res, err, 'users/delete');
  }
});

// @route   PUT /api/users/:id/block
// @desc    Set the block status of a user
// @access  Private (Super Admin only)
router.put('/:id/block', async (req, res) => {
  try {
    const { isBlocked } = req.body;
    if (typeof isBlocked !== 'boolean') return res.status(400).json({ message: 'isBlocked must be true or false.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id.' });
    if (isBlocked && req.params.id === req.user.id) return res.status(400).json({ message: 'You cannot block your own account.' });

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (isBlocked && await protectsLastAdmin(user)) {
      return res.status(400).json({ message: 'This is the last active Super Admin and cannot be blocked.' });
    }

    user.isBlocked = isBlocked;
    await user.save();

    res.json({ _id: user._id, username: user.username, role: user.role, isBlocked: user.isBlocked });
  } catch (err) {
    sendError(res, err, 'users/block');
  }
});

module.exports = router;

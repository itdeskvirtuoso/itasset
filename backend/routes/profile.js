const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { toStr, sendError } = require('../utils/security');

const toProfile = (user) => ({
  _id: user._id,
  username: user.username,
  role: user.role,
  phone: user.phone || '',
  employeeId: user.employeeId || ''
});

// GET /api/profile - Fetch the current user profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(toProfile(user));
  } catch (err) {
    sendError(res, err, 'profile/get');
  }
});

// PUT /api/profile - Update the current user's contact details.
// Username and role are not editable here: the username is the login name,
// and roles are managed by a Super Admin.
router.put('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.body.phone !== undefined) {
      const phone = toStr(req.body.phone);
      if (phone.length > 20) return res.status(400).json({ message: 'Phone number is too long.' });
      user.phone = phone;
    }
    if (req.body.employeeId !== undefined) {
      const employeeId = toStr(req.body.employeeId);
      if (employeeId.length > 40) return res.status(400).json({ message: 'Employee ID is too long.' });
      user.employeeId = employeeId;
    }

    const updatedUser = await user.save();
    res.json(toProfile(updatedUser));
  } catch (err) {
    sendError(res, err, 'profile/update');
  }
});

module.exports = router;

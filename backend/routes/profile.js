const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

// GET /api/profile - Fetch the current user profile
router.get('/', auth, async (req, res) => {
  try {
    let user = await User.findById(req.user.id);
    if (!user) {
      // Create a default user if database is completely empty
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      user = new User({
        username: 'admin',
        password: hashedPassword,
        role: 'Super Admin',
        phone: '',
        employeeId: 'EMP-001'
      });
      await user.save();
    }
    
    // Don't send the password back
    const userProfile = {
      _id: user._id,
      username: user.username,
      role: user.role,
      phone: user.phone || '',
      employeeId: user.employeeId || ''
    };
    
    res.json(userProfile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/profile - Update the current user profile
router.put('/', auth, async (req, res) => {
  try {
    let user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const { username, phone, employeeId } = req.body;
    
    user.username = username || user.username;
    user.phone = phone !== undefined ? phone : user.phone;
    user.employeeId = employeeId !== undefined ? employeeId : user.employeeId;
    
    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      role: updatedUser.role,
      phone: updatedUser.phone,
      employeeId: updatedUser.employeeId
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

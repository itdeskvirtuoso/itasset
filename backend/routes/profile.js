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
        name: 'System Admin',
        email: 'admin@example.com',
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
      name: user.name,
      email: user.email,
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
    
    const { name, email, phone, employeeId } = req.body;
    
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone !== undefined ? phone : user.phone;
    user.employeeId = employeeId !== undefined ? employeeId : user.employeeId;
    
    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      phone: updatedUser.phone,
      employeeId: updatedUser.employeeId
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

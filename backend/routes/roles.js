const express = require('express');
const router = express.Router();
const Role = require('../models/Role');

const User = require('../models/User');

// @route   GET /api/roles
// @desc    Get all roles and their permissions
// @access  Public
router.get('/', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const roles = await Role.find();
    
    const rolesWithCounts = await Promise.all(roles.map(async (role) => {
      const usersInRole = await User.find({ role: role.name }, 'username isBlocked');
      return {
        _id: role._id,
        name: role.name,
        permissions: role.permissions,
        userCount: usersInRole.length,
        assignedUsers: usersInRole
      };
    }));

    res.json(rolesWithCounts);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/roles/:name
// @desc    Update permissions for a specific role
// @access  Public
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { permissions } = req.body;

    let role = await Role.findOne({ name });
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    role.permissions = permissions;
    await role.save();

    res.json(role);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/roleCheck');
const { toStr, sendError } = require('../utils/security');

// Every permission the Settings → Roles screen can grant
const ASSIGNABLE_PERMISSIONS = [
  'index.html', 'assets.html', 'edit_asset', 'delete_asset', 'allocations.html',
  'returns.html', 'warranty.html', 'reports.html', 'settings.html'
];

// @route   GET /api/roles
// @desc    Super Admin: every role with its users. Others: only their own role's permissions.
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.user.role !== 'Super Admin') {
      const own = await Role.findOne({ name: req.user.role }).select('name permissions').lean();
      return res.json(own ? [{ _id: own._id, name: own.name, permissions: own.permissions }] : []);
    }

    const [roles, users] = await Promise.all([
      Role.find().lean(),
      User.find({}, 'username role isBlocked').lean()
    ]);

    res.json(roles.map((role) => {
      const assignedUsers = users
        .filter((u) => u.role === role.name)
        .map((u) => ({ _id: u._id, username: u.username, isBlocked: !!u.isBlocked }));
      return {
        _id: role._id,
        name: role.name,
        permissions: role.permissions,
        userCount: assignedUsers.length,
        assignedUsers
      };
    }));
  } catch (err) {
    sendError(res, err, 'roles/list');
  }
});

// @route   PUT /api/roles/:name
// @desc    Update permissions for a specific role
// @access  Private (Super Admin only)
router.put('/:name', auth, requireSuperAdmin, async (req, res) => {
  try {
    const name = toStr(req.params.name);
    const { permissions } = req.body;

    if (name === 'Super Admin') {
      return res.status(400).json({ message: 'Super Admin always has full access and cannot be edited.' });
    }
    if (!Array.isArray(permissions) || !permissions.every((p) => ASSIGNABLE_PERMISSIONS.includes(p))) {
      return res.status(400).json({ message: 'Invalid permission list.' });
    }

    const role = await Role.findOne({ name });
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    role.permissions = [...new Set(permissions)];
    await role.save();

    res.json(role);
  } catch (err) {
    sendError(res, err, 'roles/update');
  }
});

module.exports = router;

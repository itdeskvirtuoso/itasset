const Role = require('../models/Role');

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ message: 'Not authorized, no user role found' });
      }

      const role = await Role.findOne({ name: req.user.role });
      if (!role) {
        return res.status(403).json({ message: 'Role not found' });
      }

      if (!role.permissions.includes(requiredPermission) && !role.permissions.includes('Full Control')) {
        // Also allow if it's the dashboard (index.html) as everyone should have access to it
        if (requiredPermission !== 'index.html') {
          return res.status(403).json({ message: 'Access denied: Insufficient permissions for this action' });
        }
      }

      next();
    } catch (err) {
      console.error('Role check error:', err);
      res.status(500).json({ message: 'Server error during authorization' });
    }
  };
};

module.exports = checkPermission;

const Role = require('../models/Role');
const { sendError } = require('../utils/security');

// Server-side twin of the permissions edited in Settings → Roles. Passes when the user's role
// holds '*' or any one of the listed permissions. Super Admin always passes, so a mis-edited
// role can never lock the administrators out. Use after the auth middleware.
const checkPermission = (...required) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' });
  }
  if (req.user.role === 'Super Admin') return next();

  try {
    const role = await Role.findOne({ name: req.user.role }).select('permissions').lean();
    const permissions = role ? role.permissions : [];
    if (permissions.includes('*') || required.some((p) => permissions.includes(p))) return next();
    res.status(403).json({ code: 'FORBIDDEN', message: "You don't have permission to do this. Ask a Super Admin for access." });
  } catch (err) {
    sendError(res, err, 'roleCheck');
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'Super Admin') return next();
  res.status(403).json({ code: 'FORBIDDEN', message: 'Only a Super Admin can do this.' });
};

module.exports = checkPermission;
module.exports.requireSuperAdmin = requireSuperAdmin;

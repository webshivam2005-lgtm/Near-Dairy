const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'neardairy_jwt_secret_token_key_2026_super_secure';

/**
 * Verifies JWT token or Supabase access token and attaches user profile to req.user
 */
const authenticateUser = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.',
      });
    }

    // First try our native JWT token
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      // If native JWT fails, try validating against Supabase Auth
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired session token.',
        });
      }

      // Fetch profile from customer_profiles, partner_profiles, admin_profiles (or compatibility view)
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      req.user = {
        id: user.id,
        email: user.email,
        full_name: profile ? profile.full_name : user.user_metadata?.full_name || 'User',
        role: profile ? profile.role : user.user_metadata?.role || 'customer',
        phone: profile ? profile.phone : null,
      };
      return next();
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
    });
  }
};

/**
 * Enforces role-based permissions (e.g. requireRole('admin') or requireRole('partner'))
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. This action requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
      });
    }

    next();
  };
};

/**
 * Optional authentication: attaches req.user if token is present, does not reject if absent
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch {
        // Silently continue if token is invalid
      }
    }
    next();
  } catch {
    next();
  }
};

module.exports = {
  authenticateUser,
  requireRole,
  optionalAuth,
  JWT_SECRET,
};

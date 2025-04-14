/**
 * Authentication middleware for protecting routes
 */

module.exports = {
  // Ensure user is authenticated
  isAuthenticated: (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/auth/login');
  },
  
  // Ensure user is NOT authenticated (for login pages)
  isNotAuthenticated: (req, res, next) => {
    if (!req.isAuthenticated()) {
      return next();
    }
    res.redirect('/');
  }
};
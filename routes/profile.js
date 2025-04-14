const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
};

// Apply authentication check to all profile routes
router.use(isAuthenticated);

// Get user profile
router.get('/', async (req, res) => {
  try {
    // Get user stats
    const taskStats = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE completed = false) as open_tasks,
        COUNT(*) FILTER (WHERE completed = true) as completed_tasks,
        COUNT(*) as total_tasks
      FROM tasks 
      WHERE user_id = $1`,
      [req.user.id]
    );
    
    const projectCount = await db.query(
      'SELECT COUNT(*) as project_count FROM projects WHERE user_id = $1',
      [req.user.id]
    );
    
    res.render('profile/index', {
      user: req.user,
      stats: {
        openTasks: taskStats.rows[0].open_tasks,
        completedTasks: taskStats.rows[0].completed_tasks,
        totalTasks: taskStats.rows[0].total_tasks,
        projectCount: projectCount.rows[0].project_count
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).render('error', { message: 'Failed to load profile' });
  }
});

module.exports = router;
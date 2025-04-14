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

// Disconnect Google account
router.post('/disconnect/google', async (req, res) => {
  try {
    // Check if user has both Google and GitHub accounts connected
    if (!req.user.github_id) {
      return res.status(400).render('error', { 
        message: 'Cannot disconnect Google account because you need at least one login method. Please connect GitHub first.' 
      });
    }
    
    // Start a transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if the google_id column has a NOT NULL constraint
      const tableInfo = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'google_id'
      `);
      
      if (tableInfo.rows[0].is_nullable === 'NO') {
        // If NOT NULL constraint exists, set to empty string instead of NULL
        await client.query(
          'UPDATE users SET google_id = \'\', updated_at = NOW() WHERE id = $1',
          [req.user.id]
        );
      } else {
        // If nullable, set to NULL
        await client.query(
          'UPDATE users SET google_id = NULL, updated_at = NOW() WHERE id = $1',
          [req.user.id]
        );
      }
      
      await client.query('COMMIT');
      res.redirect('/profile');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error disconnecting Google account:', error);
    res.status(500).render('error', { message: 'Failed to disconnect Google account' });
  }
});

// Disconnect GitHub account
router.post('/disconnect/github', async (req, res) => {
  try {
    // Check if user has both Google and GitHub accounts connected
    if (!req.user.google_id) {
      return res.status(400).render('error', { 
        message: 'Cannot disconnect GitHub account because you need at least one login method. Please connect Google first.' 
      });
    }
    
    // Start a transaction
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if the github_id column has a NOT NULL constraint
      const tableInfo = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'github_id'
      `);
      
      if (tableInfo.rows[0].is_nullable === 'NO') {
        // If NOT NULL constraint exists, set to empty string instead of NULL
        await client.query(
          'UPDATE users SET github_id = \'\', github_token = \'\', updated_at = NOW() WHERE id = $1',
          [req.user.id]
        );
      } else {
        // If nullable, set to NULL
        await client.query(
          'UPDATE users SET github_id = NULL, github_token = NULL, updated_at = NOW() WHERE id = $1',
          [req.user.id]
        );
      }
      
      await client.query('COMMIT');
      res.redirect('/profile');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error disconnecting GitHub account:', error);
    res.status(500).render('error', { message: 'Failed to disconnect GitHub account' });
  }
});

module.exports = router;
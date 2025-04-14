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

// Apply authentication check to all project routes
router.use(isAuthenticated);

// Get all projects for the logged-in user
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, COUNT(tp.task_id) as task_count
       FROM projects p
       LEFT JOIN task_projects tp ON p.id = tp.project_id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.name`,
      [req.user.id]
    );
    
    res.render('projects/index', { 
      projects: result.rows,
      user: req.user
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).render('error', { message: 'Failed to load projects' });
  }
});

// Get project creation form
router.get('/new', (req, res) => {
  res.render('projects/new', { user: req.user });
});

// Create a new project
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Validate project name
    if (!name || name.trim() === '') {
      return res.status(400).render('projects/new', { 
        error: 'Project name is required',
        user: req.user
      });
    }
    
    // Check if project with same name already exists for this user
    const existingProject = await db.query(
      'SELECT * FROM projects WHERE user_id = $1 AND name = $2',
      [req.user.id, name.trim()]
    );
    
    if (existingProject.rows.length > 0) {
      return res.status(400).render('projects/new', { 
        error: 'A project with this name already exists',
        user: req.user
      });
    }
    
    // Create the project
    await db.query(
      'INSERT INTO projects (user_id, name) VALUES ($1, $2)',
      [req.user.id, name.trim()]
    );
    
    res.redirect('/projects');
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).render('error', { message: 'Failed to create project' });
  }
});

// Get a single project with its tasks
router.get('/:id', async (req, res) => {
  try {
    // Get the project
    const projectResult = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Project not found' });
    }
    
    const project = projectResult.rows[0];
    
    // Get tasks for this project
    const tasksResult = await db.query(
      `SELECT t.* 
       FROM tasks t
       JOIN task_projects tp ON t.id = tp.task_id
       WHERE tp.project_id = $1 AND t.user_id = $2
       ORDER BY t.created_at DESC`,
      [req.params.id, req.user.id]
    );
    
    res.render('projects/show', { 
      project,
      tasks: tasksResult.rows,
      user: req.user
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).render('error', { message: 'Failed to load project details' });
  }
});

// Get project edit form
router.get('/:id/edit', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).render('error', { message: 'Project not found' });
    }
    
    res.render('projects/edit', { 
      project: result.rows[0],
      user: req.user
    });
  } catch (error) {
    console.error('Error loading edit form:', error);
    res.status(500).render('error', { message: 'Failed to load edit form' });
  }
});

// Update a project
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Validate project name
    if (!name || name.trim() === '') {
      return res.status(400).render('projects/edit', { 
        project: { id: req.params.id, name: '' },
        error: 'Project name is required',
        user: req.user
      });
    }
    
    // Check if project with same name already exists for this user (excluding current project)
    const existingProject = await db.query(
      'SELECT * FROM projects WHERE user_id = $1 AND name = $2 AND id != $3',
      [req.user.id, name.trim(), req.params.id]
    );
    
    if (existingProject.rows.length > 0) {
      return res.status(400).render('projects/edit', { 
        project: { id: req.params.id, name },
        error: 'A project with this name already exists',
        user: req.user
      });
    }
    
    // Update the project
    await db.query(
      'UPDATE projects SET name = $1 WHERE id = $2 AND user_id = $3',
      [name.trim(), req.params.id, req.user.id]
    );
    
    res.redirect('/projects');
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).render('error', { message: 'Failed to update project' });
  }
});

// Delete a project
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    res.redirect('/projects');
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).render('error', { message: 'Failed to delete project' });
  }
});

module.exports = router;
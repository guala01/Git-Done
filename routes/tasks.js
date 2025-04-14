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

// Apply authentication check to all task routes
router.use(isAuthenticated);

// Get all tasks for the logged-in user
router.get('/', async (req, res) => {
  try {
    // Get filter parameters
    const filter = req.query.filter;
    const priority = req.query.priority;
    const taskType = req.query.type;
    const projectId = req.query.project;
    const status = req.query.status;
    
    let whereClause = 't.user_id = $1 AND t.parent_id IS NULL';
    const queryParams = [req.user.id];
    let paramIndex = 2;
    
    // Filter by completion status
    if (filter === 'pending') {
      whereClause += ' AND t.completed = false';
    } else if (filter === 'completed') {
      whereClause += ' AND t.completed = true';
    } else if (status === 'open') {
      whereClause += ' AND t.completed = false';
    } else if (status === 'completed') {
      whereClause += ' AND t.completed = true';
    }
    
    // Filter by priority if specified
    if (priority && priority !== 'all') {
      whereClause += ` AND t.priority = $${paramIndex}`;
      queryParams.push(priority);
      paramIndex++;
    }
    
    // Filter by task type if specified
    if (taskType && taskType !== 'all') {
      whereClause += ` AND t.task_type = $${paramIndex}`;
      queryParams.push(taskType);
      paramIndex++;
    }
    
    // Filter by project if specified
    if (projectId && projectId !== 'all') {
      whereClause += ` AND EXISTS (SELECT 1 FROM task_projects tp WHERE tp.task_id = t.id AND tp.project_id = $${paramIndex})`;
      queryParams.push(projectId);
      paramIndex++;
    }
    
    const result = await db.query(
      `SELECT t.*, 
              array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
              array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) as project_ids
       FROM tasks t
       LEFT JOIN task_projects tp ON t.id = tp.task_id
       LEFT JOIN projects p ON tp.project_id = p.id
       WHERE ${whereClause}
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      queryParams
    );
    
    // Get all projects for the filter dropdown
    const projectsResult = await db.query(
      'SELECT id, name FROM projects WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    
    res.render('tasks/index', { 
      tasks: result.rows,
      user: req.user,
      filter: filter,
      priority: priority || 'all',
      type: taskType || 'all',
      project: projectId || 'all',
      status: status || 'all',
      projects: projectsResult.rows
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).render('error', { message: 'Failed to load tasks' });
  }
});

// Get task creation form
router.get('/new', async (req, res) => {
  try {
    // Get all projects for the user to allow assignment
    const projects = await db.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    
    res.render('tasks/new', { 
      user: req.user,
      projects: projects.rows,
      task: {}
    });
  } catch (error) {
    console.error('Error loading task form:', error);
    res.status(500).render('error', { message: 'Failed to load task form' });
  }
});

// Create a new task
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Extract task data from request body
    const { 
      title, 
      description, 
      due_date, 
      priority, 
      time_estimate, 
      task_type, 
      code_snippet,
      project_ids,
      parent_id
    } = req.body;
    
    // Insert the task
    const taskResult = await client.query(
      `INSERT INTO tasks 
       (user_id, title, description, due_date, priority, time_estimate, task_type, code_snippet, parent_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        req.user.id, 
        title, 
        description, 
        due_date || null, 
        priority || null, 
        time_estimate || null, 
        task_type || null, 
        code_snippet || null,
        parent_id || null
      ]
    );
    
    const taskId = taskResult.rows[0].id;
    
    // Add task-project relationships if projects were selected
    if (project_ids && project_ids.length) {
      // Handle both single value and array
      const projectIdsArray = Array.isArray(project_ids) ? project_ids : [project_ids];
      
      for (const projectId of projectIdsArray) {
        await client.query(
          'INSERT INTO task_projects (task_id, project_id) VALUES ($1, $2)',
          [taskId, projectId]
        );
      }
    }
    
    // Add links if provided
    if (req.body.links && req.body.link_labels) {
      const links = Array.isArray(req.body.links) ? req.body.links : [req.body.links];
      const labels = Array.isArray(req.body.link_labels) ? req.body.link_labels : [req.body.link_labels];
      
      for (let i = 0; i < links.length; i++) {
        if (links[i]) {
          await client.query(
            'INSERT INTO links (task_id, url, label) VALUES ($1, $2, $3)',
            [taskId, links[i], labels[i] || null]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Extract query parameters from the request
    const queryParams = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('_query_')) {
        queryParams[key.replace('_query_', '')] = value;
      }
    }
    
    const queryString = Object.keys(queryParams).length > 0 
      ? '?' + new URLSearchParams(queryParams).toString() 
      : '';
      
    res.redirect('/tasks' + queryString);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating task:', error);
    res.status(500).render('error', { message: 'Failed to create task' });
  } finally {
    client.release();
  }
});

// Get a single task with its details
router.get('/:id', async (req, res) => {
  try {
    // Store the referrer URL in the session if it contains filter parameters
    const referer = req.get('Referer');
    if (referer && referer.includes('/tasks?')) {
      req.session.taskListReferer = referer;
    }
    
    // Get the task
    const taskResult = await db.query(
      `SELECT t.*, 
              array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
              array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) as project_ids
       FROM tasks t
       LEFT JOIN task_projects tp ON t.id = tp.task_id
       LEFT JOIN projects p ON tp.project_id = p.id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id`,
      [req.params.id, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Task not found' });
    }
    
    const task = taskResult.rows[0];
    
    // Get links for the task
    const linksResult = await db.query(
      'SELECT * FROM links WHERE task_id = $1',
      [req.params.id]
    );
    
    // Get subtasks
    const subtasksResult = await db.query(
      'SELECT * FROM tasks WHERE parent_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    
    // Get all projects for the edit form
    const projectsResult = await db.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    
    res.render('tasks/show', { 
      task,
      links: linksResult.rows,
      subtasks: subtasksResult.rows,
      projects: projectsResult.rows,
      user: req.user,
      req: req, // Pass the request object to access query parameters
      taskListReferer: req.session.taskListReferer // Pass the stored referrer
    });
  } catch (error) {
    console.error('Error fetching task details:', error);
    res.status(500).render('error', { message: 'Failed to load task details' });
  }
});

// Get task edit form
router.get('/:id/edit', async (req, res) => {
  try {
    // Get the task
    const taskResult = await db.query(
      `SELECT t.*, 
              array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) as project_ids
       FROM tasks t
       LEFT JOIN task_projects tp ON t.id = tp.task_id
       LEFT JOIN projects p ON tp.project_id = p.id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id`,
      [req.params.id, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Task not found' });
    }
    
    // Get links for the task
    const linksResult = await db.query(
      'SELECT * FROM links WHERE task_id = $1',
      [req.params.id]
    );
    
    // Get all projects for the edit form
    const projectsResult = await db.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    
    res.render('tasks/edit', { 
      task: taskResult.rows[0],
      links: linksResult.rows,
      projects: projectsResult.rows,
      user: req.user,
      req: req // Pass the request object
    });
  } catch (error) {
    console.error('Error loading edit form:', error);
    res.status(500).render('error', { message: 'Failed to load edit form' });
  }
});

// Update a task
router.put('/:id', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Extract task data from request body
    const { 
      title, 
      description, 
      due_date, 
      priority, 
      time_estimate, 
      task_type, 
      code_snippet,
      completed,
      project_ids
    } = req.body;
    
    // Update the task
    await client.query(
      `UPDATE tasks 
       SET title = $1, description = $2, due_date = $3, priority = $4, 
           time_estimate = $5, task_type = $6, code_snippet = $7, completed = $8
       WHERE id = $9 AND user_id = $10`,
      [
        title, 
        description, 
        due_date || null, 
        priority || null, 
        time_estimate || null, 
        task_type || null, 
        code_snippet || null,
        completed === 'on' || completed === true,
        req.params.id,
        req.user.id
      ]
    );
    
    // Delete existing project associations
    await client.query(
      'DELETE FROM task_projects WHERE task_id = $1',
      [req.params.id]
    );
    
    // Add new project associations if projects were selected
    if (project_ids && project_ids.length) {
      // Handle both single value and array
      const projectIdsArray = Array.isArray(project_ids) ? project_ids : [project_ids];
      
      for (const projectId of projectIdsArray) {
        await client.query(
          'INSERT INTO task_projects (task_id, project_id) VALUES ($1, $2)',
          [req.params.id, projectId]
        );
      }
    }
    
    // Delete existing links
    await client.query(
      'DELETE FROM links WHERE task_id = $1',
      [req.params.id]
    );
    
    // Add new links if provided
    if (req.body.links && req.body.link_labels) {
      const links = Array.isArray(req.body.links) ? req.body.links : [req.body.links];
      const labels = Array.isArray(req.body.link_labels) ? req.body.link_labels : [req.body.link_labels];
      
      for (let i = 0; i < links.length; i++) {
        if (links[i]) {
          await client.query(
            'INSERT INTO links (task_id, url, label) VALUES ($1, $2, $3)',
            [req.params.id, links[i], labels[i] || null]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Redirect back to the task detail page
    // The task detail page will handle the redirect back to the filtered task list
    res.redirect(`/tasks/${req.params.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating task:', error);
    res.status(500).render('error', { message: 'Failed to update task' });
  } finally {
    client.release();
  }
});

// Toggle task completion status
router.post('/:id/toggle', async (req, res) => {
  try {
    // Get current completion status
    const currentStatus = await db.query(
      'SELECT completed FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (currentStatus.rows.length === 0) {
      return res.status(404).render('error', { message: 'Task not found' });
    }
    
    // Toggle the status
    const newStatus = !currentStatus.rows[0].completed;
    
    await db.query(
      'UPDATE tasks SET completed = $1, completed_at = $2 WHERE id = $3 AND user_id = $4',
      [newStatus, newStatus ? new Date() : null, req.params.id, req.user.id]
    );
    
    // Get the stored referrer from session
    const taskListReferer = req.session.taskListReferer;
    
    // Check if the request came from the task detail page
    const referer = req.get('Referer');
    if (referer && referer.includes(`/tasks/${req.params.id}`)) {
      // If from task detail page, redirect back to it
      return res.redirect(`/tasks/${req.params.id}`);
    }
    
    // Otherwise redirect back to tasks list with the original filter parameters
    res.redirect(taskListReferer || '/tasks');
  } catch (error) {
    console.error('Error toggling task status:', error);
    res.status(500).render('error', { message: 'Failed to update task status' });
  }
});

// Delete a task
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    // Preserve query parameters when redirecting
    const queryString = req.query && Object.keys(req.query).length > 0 
      ? '?' + new URLSearchParams(req.query).toString() 
      : '';
      
    res.redirect(`/tasks${queryString}`);
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).render('error', { message: 'Failed to delete task' });
  }
});

// Filter tasks by project
router.get('/project/:projectId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, 
              array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
              array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) as project_ids
       FROM tasks t
       JOIN task_projects tp ON t.id = tp.task_id
       LEFT JOIN task_projects tp2 ON t.id = tp2.task_id
       LEFT JOIN projects p ON tp2.project_id = p.id
       WHERE tp.project_id = $1 AND t.user_id = $2
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [req.params.projectId, req.user.id]
    );
    
    // Get the project name
    const projectResult = await db.query(
      'SELECT name FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.projectId, req.user.id]
    );
    
    const projectName = projectResult.rows.length > 0 ? projectResult.rows[0].name : 'Unknown Project';
    
    res.render('tasks/index', { 
      tasks: result.rows,
      projectName,
      projectId: req.params.projectId,
      user: req.user
    });
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    res.status(500).render('error', { message: 'Failed to load project tasks' });
  }
});

module.exports = router;
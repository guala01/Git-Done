require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy; // Add this line
const methodOverride = require('method-override');
const path = require('path');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);
const db = require('./db'); // Add this line to import the db module

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
// Use the pool from the db module instead of creating a new one
const pool = db.pool;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Session configuration
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions'
  }),
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Add this middleware to make user available to all templates
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Use db.query instead of direct pool queries
    const existingUser = await db.query(
      'SELECT * FROM users WHERE google_id = $1',
      [profile.id]
    );

    if (existingUser.rows.length) {
      // User exists, return user
      return done(null, existingUser.rows[0]);
    }

    // Create new user - also use db.query here
    const newUser = await db.query(
      'INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.id, profile.emails[0].value, profile.displayName, profile.photos[0].value]
    );

    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// Add GitHub OAuth Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Store GitHub access token for API calls
    const githubToken = accessToken;
    
    // Check if user exists
    const existingUser = await db.query(
      'SELECT * FROM users WHERE github_id = $1',
      [profile.id]
    );

    if (existingUser.rows.length) {
      // Update the GitHub token
      await db.query(
        'UPDATE users SET github_token = $1, updated_at = NOW() WHERE github_id = $2 RETURNING *',
        [githubToken, profile.id]
      );
      return done(null, existingUser.rows[0]);
    }

    // Check if user exists with the same email
    if (profile.emails && profile.emails.length > 0) {
      const userByEmail = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [profile.emails[0].value]
      );

      if (userByEmail.rows.length) {
        // Link GitHub account to existing user
        const updatedUser = await db.query(
          'UPDATE users SET github_id = $1, github_token = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
          [profile.id, githubToken, userByEmail.rows[0].id]
        );
        return done(null, updatedUser.rows[0]);
      }
    }

    // Create new user
    const newUser = await db.query(
      'INSERT INTO users (github_id, email, name, avatar_url, github_token) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [
        profile.id, 
        profile.emails ? profile.emails[0].value : null, 
        profile.displayName || profile.username,
        profile.photos ? profile.photos[0].value : null,
        githubToken
      ]
    );

    return done(null, newUser.rows[0]);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user into the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
  try {
    // Use db.query here too
    const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, user.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email', 'repo'] })
);

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// Import routes
const authRoutes = require('./routes/auth');
const tasksRoutes = require('./routes/tasks');
const projectsRoutes = require('./routes/projects');
const profileRoutes = require('./routes/profile'); // Add this line

// Use routes
app.use('/auth', authRoutes);
app.use('/tasks', tasksRoutes);
app.use('/projects', projectsRoutes);
app.use('/profile', profileRoutes); // Add this line

// Home route
app.get('/', async (req, res) => {
  try {
    let recentTasks = [];
    let userProjects = [];
    
    if (req.user) {
      // Use db.query here too
      const tasksResult = await db.query(
        `SELECT t.*, 
                array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as project_names,
                array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL) as project_ids,
                CASE WHEN t.completed = true THEN 'Completed' ELSE 'Open' END as status
         FROM tasks t
         LEFT JOIN task_projects tp ON t.id = tp.task_id
         LEFT JOIN projects p ON tp.project_id = p.id
         WHERE t.user_id = $1 AND t.parent_id IS NULL
         GROUP BY t.id
         ORDER BY t.created_at DESC
         LIMIT 5`,
        [req.user.id]
      );
      recentTasks = tasksResult.rows;
      
      // Use db.query here too
      const projectsResult = await db.query(
        `SELECT p.*, COUNT(tp.task_id) as task_count
         FROM projects p
         LEFT JOIN task_projects tp ON p.id = tp.project_id
         WHERE p.user_id = $1
         GROUP BY p.id
         ORDER BY p.name
         LIMIT 5`,
        [req.user.id]
      );
      userProjects = projectsResult.rows;
    }
    
    res.render('index', { 
      user: req.user,
      recentTasks: recentTasks,
      userProjects: userProjects
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', { message: 'Failed to load dashboard' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const methodOverride = require('method-override');
const path = require('path');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gitdone',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

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

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists in database
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [profile.id]
    );

    if (existingUser.rows.length) {
      // User exists, return user
      return done(null, existingUser.rows[0]);
    }

    // Create new user
    const newUser = await pool.query(
      'INSERT INTO users (google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [profile.id, profile.emails[0].value, profile.displayName, profile.photos[0].value]
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
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
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

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// Import routes
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');

// Use routes
app.use('/auth', authRoutes);
app.use('/tasks', taskRoutes);
app.use('/projects', projectRoutes);

// Home route
app.get('/', async (req, res) => {
  try {
    let recentTasks = [];
    let userProjects = [];
    
    if (req.user) {
      // Fetch recent tasks for logged-in user
      const tasksResult = await pool.query(
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
      
      // Fetch user projects
      const projectsResult = await pool.query(
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
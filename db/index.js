const { Pool } = require('pg');
require('dotenv').config();

// Create a new Pool instance with connection details from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to PostgreSQL database');
  release();
});

// Export query method to be used throughout the application
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
# GitDone - A Modern Todo App



## Features

- **Task Management**: Create, view, edit, and delete tasks with titles, descriptions, due dates, and priorities
- **Project Organization**: Categorize tasks by projects for better organization
- **Subtasks**: Break down complex tasks into smaller, manageable subtasks
- **Coder-Specific Features**:
  - Add time estimations to tasks
  - Categorize tasks by type (Bug, Feature, Refactor, etc.)
  - Attach code snippets directly to tasks
  - Link tasks to external resources (GitHub issues, documentation, etc.)
- **Authentication**: Secure login with Google OAuth

## Tech Stack

- **Backend**: Node.js with Express.js
- **Frontend**: EJS templates with Tailwind CSS
- **Database**: PostgreSQL
- **Authentication**: Passport.js with Google OAuth

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. Clone the repository

```bash
git clone <repository-url>
cd git-done
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env` file based on the `.env.example` template

```bash
cp .env.example .env
```

4. Set up your PostgreSQL database

```bash
psql -U postgres
CREATE DATABASE gitdone;
\c gitdone
\i schema.sql
```

5. Start the development server

```bash
npm run dev
```

6. Open your browser and navigate to `http://localhost:3000`

## Project Structure

```
├── app.js              # Main application entry point
├── db/                 # Database connection and queries
├── middleware/         # Custom middleware functions
├── public/             # Static assets (CSS, JS, images)
├── routes/             # Route handlers
├── views/              # EJS templates
└── package.json        # Project dependencies and scripts
```

## License

MIT
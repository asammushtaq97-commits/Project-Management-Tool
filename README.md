# Project Management Backend

This is the Express.js backend for the collaborative project management application.

## Features

- User authentication with JWT
- MySQL database connection using `mysql2`
- User registration and login
- Project, task, and comment CRUD APIs
- Real-time updates via Socket.io
- CORS enabled for local development

## Requirements

- Node.js 18+ or newer
- MySQL database
- `npm` installed

## Setup

1. Copy the environment example or create `.env` in `backend/`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=project-managment
JWT_SECRET=supersecret
CLIENT_ORIGIN=http://localhost:5178
PORT=4000
```

2. Install dependencies:

```bash
cd backend
npm install
```

3. Create the database and tables:

```bash
node setup-db.js
```

4. Start the server:

```bash
npm run dev
```

## API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and receive a JWT
- `GET /api/projects` - Get user projects
- `POST /api/projects` - Create a new project
- `GET /api/tasks/project/:projectId` - Get tasks for a project
- `POST /api/tasks` - Create a task
- `PUT /api/tasks/:taskId` - Update a task
- `DELETE /api/tasks/:taskId` - Delete a task
- `POST /api/comments` - Add a comment
- `DELETE /api/comments/:commentId` - Delete a comment

## Notes

- Make sure the backend is running before launching the frontend.
- Use the same `CLIENT_ORIGIN` URL in `.env` as the frontend dev server.
- If you change the database name, update `.env` and rerun `setup-db.js` if needed.

import './styles.css';
import { io } from 'socket.io-client';

const API_BASE = 'http://localhost:4000/api';
const SOCKET_BASE = 'http://localhost:4000';
const root = document.getElementById('root');

let socket = null;
let socketRoom = null;

const state = {
  token: localStorage.getItem('pm_token') || null,
  user: JSON.parse(localStorage.getItem('pm_user') || 'null'),
  projects: [],
  project: null,
  tasks: [],
  comments: [],
  selectedTask: null,
  authMode: 'login',
};

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${state.token}`,
});

const api = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${res.status} ${res.statusText}` || 'Request failed');
  }
  return data;
};

const setAuth = (token, user) => {
  state.token = token;
  state.user = user;
  localStorage.setItem('pm_token', token);
  localStorage.setItem('pm_user', JSON.stringify(user));
  connectSocket();
};

const logout = () => {
  state.token = null;
  state.user = null;
  state.projects = [];
  state.project = null;
  state.tasks = [];
  state.comments = [];
  state.selectedTask = null;
  localStorage.removeItem('pm_token');
  localStorage.removeItem('pm_user');
  disconnectSocket();
  render();
};

const showAlert = (message, type = 'error') => {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

const connectSocket = () => {
  if (socket) return;

  socket = io(SOCKET_BASE, {
    auth: { token: state.token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('Socket connected', socket.id);
  });

  socket.on('taskCreated', (task) => {
    if (state.project?.id === task.project_id) {
      state.tasks.push(task);
      showAlert('A task was added', 'success');
      render();
    }
  });

  socket.on('taskUpdated', (task) => {
    if (state.project?.id !== task.project_id) return;
    state.tasks = state.tasks.map((item) => (item.id === task.id ? { ...item, ...task } : item));
    if (state.selectedTask?.id === task.id) {
      state.selectedTask = { ...state.selectedTask, ...task };
      loadComments(task.id);
    }
    showAlert('A task was updated', 'success');
    render();
  });

  socket.on('taskDeleted', ({ taskId }) => {
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    if (state.selectedTask?.id === taskId) {
      state.selectedTask = null;
      state.comments = [];
    }
    showAlert('A task was deleted', 'success');
    render();
  });

  socket.on('commentCreated', (comment) => {
    if (state.selectedTask?.id === comment.task_id) {
      state.comments.push(comment);
      showAlert('New comment received', 'success');
      render();
    }
  });

  socket.on('commentDeleted', ({ commentId }) => {
    state.comments = state.comments.filter((comment) => comment.id !== commentId);
    showAlert('A comment was removed', 'success');
    render();
  });

  socket.on('memberAdded', ({ member }) => {
    showAlert(`${member.name} joined the project`, 'success');
  });

  socket.on('projectUpdated', (update) => {
    if (state.project?.id === update.projectId) {
      state.project = { ...state.project, ...update };
      showAlert('Project details updated', 'success');
      render();
    }
  });

  socket.on('projectDeleted', ({ projectId }) => {
    const removed = state.projects.filter((project) => project.id !== projectId);
    state.projects = removed;
    if (state.project?.id === projectId) {
      state.project = null;
      state.tasks = [];
      state.selectedTask = null;
      state.comments = [];
      showAlert('The current project was deleted', 'error');
    }
    render();
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });
};

const joinProjectRoom = (projectId) => {
  if (!socket) connectSocket();
  if (socketRoom) {
    socket.emit('leaveProject', socketRoom);
  }
  socketRoom = projectId;
  socket.emit('joinProject', projectId);
};

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketRoom = null;
  }
};

const handleAuthSubmit = async (event) => {
  event.preventDefault();
  const form = event.target;
  const name = form.querySelector('[name="name"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value.trim();

  try {
    if (state.authMode === 'register') {
      const data = await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      setAuth(data.token, data.user);
    } else {
      const data = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setAuth(data.token, data.user);
    }
    await loadProjects();
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const switchAuthMode = (mode) => {
  state.authMode = mode;
  render();
};

const loadProjects = async () => {
  try {
    const data = await api('/projects', { headers: authHeaders() });
    state.projects = data.projects;
    state.project = state.projects[0] || null;
    if (state.project) {
      await loadProjectDetails(state.project.id);
    }
  } catch (error) {
    showAlert(error.message);
  }
};

const loadProjectDetails = async (projectId) => {
  try {
    const [projectData, tasksData] = await Promise.all([
      api(`/projects/${projectId}`, { headers: authHeaders() }),
      api(`/tasks/project/${projectId}`, { headers: authHeaders() }),
    ]);
    state.project = projectData.project;
    state.tasks = tasksData.tasks;
    state.selectedTask = null;
    state.comments = [];
    joinProjectRoom(projectId);
  } catch (error) {
    showAlert(error.message);
  }
};

const loadComments = async (taskId) => {
  try {
    const data = await api(`/comments/task/${taskId}`, { headers: authHeaders() });
    state.comments = data.comments;
  } catch (error) {
    showAlert(error.message);
  }
};

const createProject = async (event) => {
  event.preventDefault();
  const name = event.target.querySelector('[name="projectName"]').value.trim();
  const description = event.target.querySelector('[name="projectDescription"]').value.trim();
  if (!name) {
    showAlert('Project name is required');
    return;
  }

  try {
    const project = await api('/projects', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, description }),
    });
    state.projects.push(project);
    await loadProjectDetails(project.id);
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const addProjectMember = async (event) => {
  event.preventDefault();
  const email = event.target.querySelector('[name="memberEmail"]').value.trim();
  if (!email) {
    showAlert('Member email is required');
    return;
  }

  try {
    await api(`/projects/${state.project.id}/members`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    });
    showAlert('Member invited', 'success');
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const createTask = async (event) => {
  event.preventDefault();
  const title = event.target.querySelector('[name="taskTitle"]').value.trim();
  const description = event.target.querySelector('[name="taskDescription"]').value.trim();
  const dueDate = event.target.querySelector('[name="taskDueDate"]').value;
  if (!title) {
    showAlert('Task title is required');
    return;
  }

  try {
    await api('/tasks', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        project_id: state.project.id,
        title,
        description,
        status: 'To Do',
        due_date: dueDate || null,
      }),
    });
    await loadProjectDetails(state.project.id);
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const selectTask = async (taskId) => {
  const task = state.tasks.find((item) => item.id === Number(taskId));
  if (!task) {
    return;
  }
  state.selectedTask = task;
  await loadComments(task.id);
  render();
};

const updateTask = async (event) => {
  event.preventDefault();
  const title = event.target.querySelector('[name="editTaskTitle"]').value.trim();
  const description = event.target.querySelector('[name="editTaskDescription"]').value.trim();
  const status = event.target.querySelector('[name="editTaskStatus"]').value;
  const dueDate = event.target.querySelector('[name="editTaskDueDate"]').value;
  if (!title) {
    showAlert('Task title is required');
    return;
  }

  try {
    await api(`/tasks/${state.selectedTask.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        title,
        description,
        status,
        due_date: dueDate || null,
        assigned_to: state.selectedTask.assigned_to || null,
      }),
    });
    await loadProjectDetails(state.project.id);
    state.selectedTask = state.tasks.find((task) => task.id === state.selectedTask.id);
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const deleteTask = async () => {
  if (!state.selectedTask) return;
  try {
    await api(`/tasks/${state.selectedTask.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    state.selectedTask = null;
    await loadProjectDetails(state.project.id);
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const addComment = async (event) => {
  event.preventDefault();
  const content = event.target.querySelector('[name="commentText"]').value.trim();
  if (!content) {
    showAlert('Comment text is required');
    return;
  }

  try {
    await api('/comments', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ task_id: state.selectedTask.id, content }),
    });
    await loadComments(state.selectedTask.id);
    event.target.reset();
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const deleteComment = async (commentId) => {
  try {
    await api(`/comments/${commentId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await loadComments(state.selectedTask.id);
    render();
  } catch (error) {
    showAlert(error.message);
  }
};

const renderAuth = () => {
  const mode = state.authMode;
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <aside class="auth-panel">
          <div class="auth-branding">
            <p class="eyebrow">Project Manager</p>
            <h1>${mode === 'login' ? 'Welcome Back' : 'Create Your Account'}</h1>
            <p class="auth-copy">Collaborate with your team, assign tasks, and track progress in one clean workspace.</p>
          </div>
          <div class="auth-steps">
            <div><strong>1.</strong> Secure login</div>
            <div><strong>2.</strong> Create boards</div>
            <div><strong>3.</strong> Share tasks</div>
          </div>
        </aside>

        <section class="auth-form-container">
          <div class="auth-header">
            <h2>${mode === 'login' ? 'Sign in to your account' : 'Register a new team account'}</h2>
            <p>${mode === 'login' ? 'Enter your credentials to continue.' : 'Start managing projects with a secure team workspace.'}</p>
          </div>
          <form id="authForm" class="auth-form">
            ${mode === 'register' ? '<label>Name<input name="name" type="text" placeholder="Your full name" required /></label>' : ''}
            <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
            <label>Password<input name="password" type="password" placeholder="Enter a strong password" required /></label>
            <button type="submit" class="primary-btn">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <div class="auth-switch">
            <span>${mode === 'login' ? 'New here?' : 'Already registered?'}</span>
            <button id="switchAuth" type="button">${mode === 'login' ? 'Create an account' : 'Sign in'}</button>
          </div>
        </section>
      </div>
    </div>
  `;

  root.querySelector('#authForm').addEventListener('submit', handleAuthSubmit);
  root.querySelector('#switchAuth').addEventListener('click', () => switchAuthMode(mode === 'login' ? 'register' : 'login'));
};

const renderDashboard = () => {
  const projectList = state.projects
    .map(
      (project) => `<button class="project-item ${state.project?.id === project.id ? 'active' : ''}" data-project-id="${project.id}">${project.name}</button>`
    )
    .join('');

  const boards = ['To Do', 'In Progress', 'Done'].map((status) => {
    const cards = state.tasks
      .filter((task) => task.status === status)
      .map(
        (task) => `<div class="task-card" data-task-id="${task.id}">
            <strong>${task.title}</strong>
            <p>${task.description || ''}</p>
            <small>${task.due_date ? `Due ${task.due_date}` : ''}</small>
          </div>`
      )
      .join('');
    return `
      <section class="board-column">
        <h3>${status}</h3>
        <div class="board-list">${cards || '<p class="empty">No tasks</p>'}</div>
      </section>
    `;
  }).join('');

  const selectedTaskHtml = state.selectedTask
    ? `
      <div class="task-detail">
        <h3>${state.selectedTask.title}</h3>
        <p>${state.selectedTask.description || 'No description'}</p>
        <div class="task-meta">
          <span>Status: ${state.selectedTask.status}</span>
          <span>Due: ${state.selectedTask.due_date || 'None'}</span>
        </div>
        <form id="editTaskForm" class="task-form">
          <label>Title<input name="editTaskTitle" value="${state.selectedTask.title}" required /></label>
          <label>Description<textarea name="editTaskDescription">${state.selectedTask.description || ''}</textarea></label>
          <label>Status<select name="editTaskStatus">
              <option ${state.selectedTask.status === 'To Do' ? 'selected' : ''}>To Do</option>
              <option ${state.selectedTask.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option ${state.selectedTask.status === 'Done' ? 'selected' : ''}>Done</option>
          </select></label>
          <label>Due date<input name="editTaskDueDate" type="date" value="${state.selectedTask.due_date || ''}" /></label>
          <div class="task-actions">
            <button type="submit">Save</button>
            <button id="deleteTask" type="button" class="danger">Delete</button>
          </div>
        </form>
        <section class="comments-panel">
          <h4>Comments</h4>
          <div class="comments-list">
            ${state.comments
              .map(
                (comment) => `<div class="comment-item">
                  <strong>${comment.user_name}</strong>
                  <p>${comment.content}</p>
                  <small>${new Date(comment.created_at).toLocaleString()}</small>
                  ${comment.user_id === state.user.id ? `<button class="delete-comment" data-comment-id="${comment.id}">Delete</button>` : ''}
                </div>`
              )
              .join('') || '<p>No comments yet.</p>'}
          </div>
          <form id="commentForm" class="comment-form">
            <textarea name="commentText" rows="3" placeholder="Write a comment..."></textarea>
            <button type="submit">Add comment</button>
          </form>
        </section>
      </div>
    `
    : '<div class="task-detail empty">Select a task to view details</div>';

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div>
          <h1>Project workspace</h1>
          <p>Logged in as ${state.user.name} (${state.user.email})</p>
        </div>
        <button id="logoutBtn">Logout</button>
      </header>

      <main class="app-main">
        <aside class="sidebar">
          <section class="panel">
            <h2>Projects</h2>
            <div class="project-list">${projectList || '<p>No projects yet</p>'}</div>
          </section>
          <section class="panel">
            <h2>Create project</h2>
            <form id="projectForm" class="project-form">
              <label>Name<input name="projectName" required /></label>
              <label>Description<textarea name="projectDescription"></textarea></label>
              <button type="submit">Create</button>
            </form>
          </section>
          ${state.project ? `<section class="panel">
            <h2>Invite member</h2>
            <form id="memberForm" class="member-form">
              <label>Email<input name="memberEmail" type="email" required /></label>
              <button type="submit">Invite</button>
            </form>
          </section>` : ''}
        </aside>

        <section class="workspace">
          ${state.project ? `<div class="project-header">
            <h2>${state.project.name}</h2>
            <p>${state.project.description || 'No description'}</p>
          </div>
          <div class="board-grid">${boards}</div>
          <section class="panel create-task-panel">
            <h3>Add task</h3>
            <form id="taskForm" class="task-form">
              <label>Title<input name="taskTitle" required /></label>
              <label>Description<textarea name="taskDescription"></textarea></label>
              <label>Due date<input name="taskDueDate" type="date" /></label>
              <button type="submit">Create task</button>
            </form>
          </section>` : '<p class="empty-state">Select or create a project to get started.</p>'}
        </section>

        <aside class="detail-pane">
          ${selectedTaskHtml}
        </aside>
      </main>
    </div>
  `;

  document.querySelector('#logoutBtn').addEventListener('click', logout);
  document.querySelector('#projectForm').addEventListener('submit', createProject);
  if (state.project) {
    document.querySelector('#taskForm').addEventListener('submit', createTask);
    document.querySelector('#memberForm').addEventListener('submit', addProjectMember);
  }
  document.querySelectorAll('.project-item').forEach((button) => {
    button.addEventListener('click', () => loadProjectDetails(button.dataset.projectId).then(render));
  });
  document.querySelectorAll('.task-card').forEach((card) => {
    card.addEventListener('click', () => selectTask(card.dataset.taskId));
  });
  if (state.selectedTask) {
    document.querySelector('#editTaskForm').addEventListener('submit', updateTask);
    document.querySelector('#deleteTask').addEventListener('click', deleteTask);
    document.querySelector('#commentForm').addEventListener('submit', addComment);
    document.querySelectorAll('.delete-comment').forEach((button) => {
      button.addEventListener('click', () => deleteComment(button.dataset.commentId));
    });
  }
};

const render = () => {
  if (!state.token) {
    renderAuth();
    return;
  }

  renderDashboard();
};

const initialize = async () => {
  if (state.token) {
    try {
      await loadProjects();
      render();
    } catch (error) {
      logout();
      render();
    }
  } else {
    render();
  }
};

initialize();

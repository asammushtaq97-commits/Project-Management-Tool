const pool = require('../config/db');

const createTask = async (req, res) => {
  const { project_id, title, description, status, due_date, assigned_to } = req.body;
  const createdBy = req.user.userId;

  if (!project_id || !title) {
    return res.status(400).json({ error: 'Project ID and title are required' });
  }

  try {
    const [projectRows] = await pool.execute(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [project_id, createdBy]
    );
    if (projectRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const [result] = await pool.execute(
      `INSERT INTO tasks (project_id, title, description, status, due_date, assigned_to, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [project_id, title, description || '', status || 'To Do', due_date || null, assigned_to || null, createdBy]
    );

    const task = {
      id: result.insertId,
      project_id,
      title,
      description: description || '',
      status: status || 'To Do',
      due_date,
      assigned_to: assigned_to || null,
      created_by: createdBy,
    };

    const io = req.app.get('io');
    io.to(`project_${project_id}`).emit('taskCreated', task);

    return res.status(201).json(task);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create task' });
  }
};

const getTasksByProject = async (req, res) => {
  const userId = req.user.userId;
  const { projectId } = req.params;

  try {
    const [membershipRows] = await pool.execute(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (membershipRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const [tasks] = await pool.execute(
      `SELECT t.id, t.project_id, t.title, t.description, t.status, t.due_date, t.assigned_to, t.created_by, t.created_at, t.updated_at,
              u.name AS assigned_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = ?`,
      [projectId]
    );

    return res.json({ tasks });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to fetch tasks' });
  }
};

const getTaskById = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;

  try {
    const [taskRows] = await pool.execute(
      `SELECT t.*, u.name AS assigned_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE t.id = ? AND pm.user_id = ?`,
      [taskId, userId]
    );

    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    return res.json({ task: taskRows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to fetch task' });
  }
};

const updateTask = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;
  const { title, description, status, due_date, assigned_to } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  try {
    const [taskRows] = await pool.execute(
      `SELECT t.project_id
       FROM tasks t
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE t.id = ? AND pm.user_id = ?`,
      [taskId, userId]
    );
    if (taskRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const projectId = taskRows[0].project_id;
    await pool.execute(
      `UPDATE tasks
       SET title = ?, description = ?, status = ?, due_date = ?, assigned_to = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, description || '', status || 'To Do', due_date || null, assigned_to || null, taskId]
    );

    const io = req.app.get('io');
    io.to(`project_${projectId}`).emit('taskUpdated', { id: Number(taskId), project_id: projectId, title, description: description || '', status: status || 'To Do', due_date, assigned_to: assigned_to || null });

    return res.json({ message: 'Task updated' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update task' });
  }
};

const deleteTask = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;

  try {
    const [taskRows] = await pool.execute(
      `SELECT t.project_id
       FROM tasks t
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE t.id = ? AND pm.user_id = ?`,
      [taskId, userId]
    );
    if (taskRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const projectId = taskRows[0].project_id;
    await pool.execute('DELETE FROM comments WHERE task_id = ?', [taskId]);
    await pool.execute('DELETE FROM tasks WHERE id = ?', [taskId]);

    const io = req.app.get('io');
    io.to(`project_${projectId}`).emit('taskDeleted', { taskId: Number(taskId) });

    return res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete task' });
  }
};

module.exports = {
  createTask,
  getTasksByProject,
  getTaskById,
  updateTask,
  deleteTask,
};

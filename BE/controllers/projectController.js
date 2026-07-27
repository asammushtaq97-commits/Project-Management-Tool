const pool = require('../config/db');

const createProject = async (req, res) => {
  const { name, description } = req.body;
  const ownerId = req.user.userId;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const [projectResult] = await pool.execute(
      'INSERT INTO projects (name, description, owner_id, created_at) VALUES (?, ?, ?, NOW())',
      [name, description || '', ownerId]
    );

    await pool.execute(
      'INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
      [projectResult.insertId, ownerId, 'owner']
    );

    const io = req.app.get('io');
    io.to(`project_${projectResult.insertId}`).emit('projectCreated', { projectId: projectResult.insertId, name, description });

    return res.status(201).json({ id: projectResult.insertId, name, description, owner_id: ownerId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create project' });
  }
};

const getProjects = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [projects] = await pool.execute(
      `SELECT p.id, p.name, p.description, p.owner_id, p.created_at
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.user_id = ?`,
      [userId]
    );
    return res.json({ projects });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to fetch projects' });
  }
};

const getProjectById = async (req, res) => {
  const userId = req.user.userId;
  const { projectId } = req.params;

  try {
    const [projectRows] = await pool.execute(
      `SELECT p.id, p.name, p.description, p.owner_id, p.created_at
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       WHERE p.id = ? AND pm.user_id = ?`,
      [projectId, userId]
    );

    if (projectRows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const [members] = await pool.execute(
      `SELECT u.id, u.name, u.email, pm.role
       FROM users u
       JOIN project_members pm ON u.id = pm.user_id
       WHERE pm.project_id = ?`,
      [projectId]
    );

    return res.json({ project: projectRows[0], members });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to fetch project' });
  }
};

const addProjectMember = async (req, res) => {
  const userId = req.user.userId;
  const { projectId } = req.params;
  const { email, role } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Member email is required' });
  }

  try {
    const [projectRows] = await pool.execute(
      'SELECT owner_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (projectRows.length === 0 || projectRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Only the project owner can invite members' });
    }

    const [userRows] = await pool.execute(
      'SELECT id, name FROM users WHERE email = ?',
      [email]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const memberId = userRows[0].id;
    const [existingMember] = await pool.execute(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, memberId]
    );
    if (existingMember.length > 0) {
      return res.status(409).json({ error: 'User is already a member of this project' });
    }

    await pool.execute(
      'INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, NOW())',
      [projectId, memberId, role || 'member']
    );

    const io = req.app.get('io');
    io.to(`project_${projectId}`).emit('memberAdded', { projectId, member: { id: memberId, name: userRows[0].name, email, role: role || 'member' } });

    return res.status(201).json({ message: 'Member added', member: { id: memberId, name: userRows[0].name, email, role: role || 'member' } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to add member' });
  }
};

const updateProject = async (req, res) => {
  const userId = req.user.userId;
  const { projectId } = req.params;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const [projectRows] = await pool.execute(
      'SELECT owner_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (projectRows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (projectRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Only the project owner can edit the project' });
    }

    await pool.execute(
      'UPDATE projects SET name = ?, description = ? WHERE id = ?',
      [name, description || '', projectId]
    );

    const io = req.app.get('io');
    io.to(`project_${projectId}`).emit('projectUpdated', { projectId, name, description });

    return res.json({ message: 'Project updated' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update project' });
  }
};

const deleteProject = async (req, res) => {
  const userId = req.user.userId;
  const { projectId } = req.params;

  try {
    const [projectRows] = await pool.execute('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
    if (projectRows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (projectRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Only the project owner can delete the project' });
    }

    await pool.execute('DELETE FROM tasks WHERE project_id = ?', [projectId]);
    await pool.execute('DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)', [projectId]);
    await pool.execute('DELETE FROM project_members WHERE project_id = ?', [projectId]);
    await pool.execute('DELETE FROM projects WHERE id = ?', [projectId]);

    const io = req.app.get('io');
    io.to(`project_${projectId}`).emit('projectDeleted', { projectId });

    return res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete project' });
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  addProjectMember,
  updateProject,
  deleteProject,
};

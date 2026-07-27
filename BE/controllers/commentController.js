const pool = require('../config/db');

const createComment = async (req, res) => {
  const { task_id, content } = req.body;
  const userId = req.user.userId;

  if (!task_id || !content) {
    return res.status(400).json({ error: 'Task ID and content are required' });
  }

  try {
    const [taskRows] = await pool.execute(
      `SELECT t.id, t.project_id FROM tasks t
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE t.id = ? AND pm.user_id = ?`,
      [task_id, userId]
    );
    if (taskRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const [result] = await pool.execute(
      'INSERT INTO comments (task_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())',
      [task_id, userId, content]
    );

    const comment = {
      id: result.insertId,
      task_id,
      user_id: userId,
      content,
      created_at: new Date().toISOString(),
    };

    const io = req.app.get('io');
    io.to(`project_${taskRows[0].project_id}`).emit('commentCreated', comment);

    return res.status(201).json(comment);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create comment' });
  }
};

const getCommentsByTask = async (req, res) => {
  const userId = req.user.userId;
  const { taskId } = req.params;

  try {
    const [accessRows] = await pool.execute(
      `SELECT t.id FROM tasks t
       JOIN project_members pm ON t.project_id = pm.project_id
       WHERE t.id = ? AND pm.user_id = ?`,
      [taskId, userId]
    );
    if (accessRows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const [comments] = await pool.execute(
      `SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, u.name AS user_name
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC`,
      [taskId]
    );

    return res.json({ comments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to fetch comments' });
  }
};

const deleteComment = async (req, res) => {
  const userId = req.user.userId;
  const { commentId } = req.params;

  try {
    const [commentRows] = await pool.execute(
      `SELECT c.task_id, c.user_id, t.project_id
       FROM comments c
       JOIN tasks t ON c.task_id = t.id
       WHERE c.id = ?`,
      [commentId]
    );
    if (commentRows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (commentRows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only the author can delete this comment' });
    }

    await pool.execute('DELETE FROM comments WHERE id = ?', [commentId]);

    const io = req.app.get('io');
    io.to(`project_${commentRows[0].project_id}`).emit('commentDeleted', { commentId: Number(commentId), taskId: commentRows[0].task_id });

    return res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete comment' });
  }
};

module.exports = { createComment, getCommentsByTask, deleteComment };

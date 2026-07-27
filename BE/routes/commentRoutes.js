const express = require('express');
const {
  createComment,
  getCommentsByTask,
  deleteComment,
} = require('../controllers/commentController');

const router = express.Router();

router.post('/', createComment);
router.get('/task/:taskId', getCommentsByTask);
router.delete('/:commentId', deleteComment);

module.exports = router;

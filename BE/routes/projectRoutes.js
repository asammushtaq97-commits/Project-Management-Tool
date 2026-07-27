const express = require('express');
const {
  createProject,
  getProjects,
  getProjectById,
  addProjectMember,
  updateProject,
  deleteProject,
} = require('../controllers/projectController');

const router = express.Router();

router.post('/', createProject);
router.get('/', getProjects);
router.get('/:projectId', getProjectById);
router.post('/:projectId/members', addProjectMember);
router.put('/:projectId', updateProject);
router.delete('/:projectId', deleteProject);

module.exports = router;

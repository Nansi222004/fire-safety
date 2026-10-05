import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as taskController from '../controllers/task.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { uploadMultiple } from '../../../middlewares/upload.js';

// Fire Safety Inspector (worker) API. Every route below auth is restricted to role "worker",
// and every task/report query is scoped to the authenticated worker in the controller.
const router = Router();
const workerAuth = [authenticate, authorize('worker'), enforceAccountStatus];

router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/profile', ...workerAuth, authController.getProfile);

router.get('/dashboard', ...workerAuth, taskController.getDashboard);
router.get('/tasks', ...workerAuth, taskController.getMyTasks);
router.get('/tasks/:id', ...workerAuth, taskController.getMyTask);
router.patch('/tasks/:id/start', ...workerAuth, taskController.startTask);
router.post('/tasks/:id/report', ...workerAuth, taskController.submitReport);
router.post('/uploads/images', ...workerAuth, uploadMultiple('images', 5), taskController.uploadInspectionImages);
router.get('/reports', ...workerAuth, taskController.getMyReports);
router.get('/reports/:id', ...workerAuth, taskController.getMyReport);

export default router;

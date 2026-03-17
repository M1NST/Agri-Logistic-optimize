import { Router } from 'express';
import { optimizeTrips } from '../controllers/optimize.controller.js';
import { verifyRole } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/run', verifyRole(['ADMIN']), optimizeTrips);

export default router;
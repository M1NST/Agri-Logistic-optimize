import { Router } from 'express';
import { getMyTrips, getAllTrips } from '../controllers/trips.controller.js';
import { verifyRole } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/my',  verifyRole(['DRIVER']), getMyTrips);
router.get('/all', verifyRole(['ADMIN']),  getAllTrips);

export default router;
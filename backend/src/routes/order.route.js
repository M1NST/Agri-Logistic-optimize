import { Router } from 'express';
import { createOrder,getOrders } from '../controllers/order.controller.js';

const router = Router();

router.post('/create', createOrder);
router.get('/all', getOrders);

export default router;
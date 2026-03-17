import { Router } from 'express';
import { createOrder,getOrders,getStoreLocation } from '../controllers/order.controller.js';

const router = Router();

router.post('/create', createOrder);
router.get('/all', getOrders);
router.get('/store-location', getStoreLocation);

export default router;
import { Router } from 'express';
import {
  createOrder,
  createCustomer,
  lookupCustomer,
  checkDeliveryFee,
  getOrders,
  getStoreLocation,
  markOrderDelivered,
  getProducts,
} from '../controllers/order.controller.js';
import { verifyRole } from '../middleware/auth.middleware.js';

const router = Router();
router.get('/products',
  verifyRole(['STAFF', 'ADMIN']),
  getProducts
);
router.get('/customers/lookup',
  verifyRole(['STAFF', 'ADMIN']),
  lookupCustomer
);
router.post('/customers',
  verifyRole(['STAFF', 'ADMIN']),
  createCustomer
);
router.post('/orders/create',
  verifyRole(['STAFF', 'ADMIN']),
  createOrder
);
router.post('/orders/check-delivery-fee',
  verifyRole(['STAFF', 'ADMIN']),
  checkDeliveryFee
);
router.get('/orders/all',
  verifyRole(['ADMIN']),
  getOrders
);
router.get('/orders/store-location',
  getStoreLocation
);
router.patch('/orders/:orderNo/delivered',
  verifyRole(['DRIVER']),
  markOrderDelivered
);

export default router;
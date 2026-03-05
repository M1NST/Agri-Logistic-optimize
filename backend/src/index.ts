import express from 'express';
import dotenv from 'dotenv';
import { stat } from 'node:fs';
// import authRoutes from './routes/auth';
// import orderRoutes from './routes/orders';
// import tripRoutes from './routes/trips';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// app.use('/api/auth', authRoutes);      // POST /api/auth/register
// app.use('/api/orders', orderRoutes);   // POST /api/orders
// app.use('/api/trips', tripRoutes);     // GET  /api/trips

app.get('/health', (req, res) => {
  res.json({ status: 'OK' ,});
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
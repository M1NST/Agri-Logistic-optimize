import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './config/db.js';
import optimizeRouter from './routes/optimize.route.js';
import posRouter from './routes/order.route.js';
import authRouter from './routes/auth.route.js';
import tripsRouter from './routes/trips.route.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.use('/api', posRouter);
app.use('/api/optimize', optimizeRouter);
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);

app.listen(3000, () => {
    console.log(`🚀 Server running on http://localhost:3000`);
});
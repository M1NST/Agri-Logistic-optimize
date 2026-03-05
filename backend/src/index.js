import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './config/db.js';

import orderRouter from './routes/order.route.js'; 

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.use('/api/orders', orderRouter); 

app.listen(3000, () => {
    console.log(`🚀 Server running on http://localhost:3000`);
});
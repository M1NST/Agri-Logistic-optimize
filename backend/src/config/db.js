import pg from 'pg';
import dotenv from 'dotenv';

// ⭐️ 1. ต้องเรียก dotenv.config() ก่อนเรียกใช้ process.env เสมอ!
dotenv.config(); 

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME , 
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log(`กำลังเชื่อมต่อกับ Database ชื่อ: ${process.env.DB_NAME}`);
    
    client.release();
  } catch (error) {
    console.error('เชื่อมต่อล้มเหลว:', error);
  }
};

export default pool;
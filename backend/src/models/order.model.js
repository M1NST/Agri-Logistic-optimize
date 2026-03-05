import pool from '../config/db.js';

export const insertOrder = async (orderData) => {
  const { OrderNo, CusID, Total_weight, lat, lng, distanceMeters, isFree } = orderData;

  const query = `
    INSERT INTO orders (
      OrderNo, 
      CusID, 
      Total_weight, 
      Delivery_location, 
      Delivery_lat, 
      Delivery_lng, 
      Distance_from_store, 
      Is_free_delivery
    ) VALUES (
      $1, $2, $3, 
      ST_SetSRID(ST_MakePoint($5, $4), 4326), 
      $4, $5, $6, $7
    ) RETURNING *;
  `;

  const distanceKm = (distanceMeters / 1000).toFixed(2);

  const values = [
      OrderNo, 
      CusID, 
      Total_weight, 
      lat, 
      lng, 
      distanceKm, 
      isFree
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0]; 
};

export const getAllOrders = async () => {
  const result = await pool.query('SELECT * FROM orders ORDER BY Created_at DESC');
  return result.rows;
};
import pool from '../config/db.js';

export const getMyTrips = async (req, res) => {
  try {
    const driverID = req.user.userId;

    const tripsRes = await pool.query(`
      SELECT
        t.TripNo,
        t.CarNo,
        t.Total_weight,
        t.Status,
        t.Created_at
      FROM trips t
      WHERE t.DriverID = $1
      ORDER BY t.Created_at DESC
    `, [driverID]);

    if (tripsRes.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const trips = await Promise.all(
      tripsRes.rows.map(async (trip) => {
        const ordersRes = await pool.query(`
          SELECT
            to2.delivery_sequence,
            o.OrderNo,
            o.Total_weight,
            o.Delivery_lat,
            o.Delivery_lng,
            o.Status,
            c.Name  AS customer_name,
            c.Phone AS customer_phone
          FROM trip_orders to2
          JOIN orders   o ON to2.OrderNo = o.OrderNo
          LEFT JOIN customers c ON o.CusID = c.CusID
          WHERE to2.TripNo = $1
          ORDER BY to2.delivery_sequence
        `, [trip.tripno]);

        return {
          tripno:       trip.tripno,
          carno:        trip.carno,
          total_weight: trip.total_weight,
          status:       trip.status,
          created_at:   trip.created_at,
          orders:       ordersRes.rows,
        };
      })
    );

    res.json({ success: true, data: trips });
  } catch (error) {
    console.error('getMyTrips Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllTrips = async (req, res) => {
  try {
    const tripsRes = await pool.query(`
      SELECT
        t.TripNo,
        t.CarNo,
        t.DriverID,
        u.Name  AS driver_name,
        t.Total_weight,
        t.Status,
        t.Created_at,
        COUNT(to2.OrderNo) AS order_count
      FROM trips t
      LEFT JOIN users       u   ON t.DriverID = u.UserID
      LEFT JOIN trip_orders to2 ON t.TripNo   = to2.TripNo
      GROUP BY t.TripNo, u.Name
      ORDER BY t.Created_at DESC
    `);

    res.json({ success: true, data: tripsRes.rows });
  } catch (error) {
    console.error('getAllTrips Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
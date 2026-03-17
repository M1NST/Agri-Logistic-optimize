import pool from '../config/db.js';

const seqRes = await client.query(`SELECT nextval('trip_id_seq') as seq`);
const tripNo = `TRP-${String(seqRes.rows[0].seq).padStart(5, '0')}`;

export const optimizeTrips = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); 

    const ordersRes = await client.query(`
    SELECT OrderNo, Total_weight, Delivery_lat, Delivery_lng
    FROM orders WHERE Status = 'pending'
    ORDER BY Total_weight DESC
    `);
    const pendingOrders = ordersRes.rows;

    if (pendingOrders.length === 0) {
      return res.json({ success: true, message: "ไม่มีออเดอร์ค้างส่ง" });
    }

    const carsRes = await client.query(`
      SELECT CarNo, MaxCapacity 
      FROM cars 
      WHERE Status = 'active' 
      ORDER BY MaxCapacity DESC
    `);
    const availableCars = carsRes.rows;

    tripsDetail: activeTrips.map(t => ({
    tripNo: t.tripNo,
    carNo: t.carNo,
    usedCapacity: `${t.currentWeight} / ${t.maxCapacity} kg`,
    orderCount: t.orders.length,
    orderNos: t.orders,                    
    coords: t.orders.map(orderNo => {      
    const o = pendingOrders.find(p => p.orderno === orderNo);
    return [parseFloat(o.delivery_lng), parseFloat(o.delivery_lat)];
  })
}))

    let unassignedOrders = [];

    for (let order of pendingOrders) {
      let isPlaced = false;
      const orderWeight = parseFloat(order.total_weight);

      for (let trip of tripsDetail) {
        if (trip.currentWeight + orderWeight <= trip.maxCapacity) {
          trip.orders.push(order.orderno);
          trip.currentWeight += orderWeight;
          isPlaced = true;
          break; 
        }
      }

      if (!isPlaced) {
        unassignedOrders.push(order.orderno);
      }
    }

    const activeTrips = tripsDetail.filter(t => t.orders.length > 0);
    const defaultDriver = 'U00001'; 

    for (let trip of activeTrips) {
      await client.query(`
        INSERT INTO trips (TripNo, DriverID, CarNo, Total_weight, Status)
        VALUES ($1, $2, $3, $4, 'planned')
      `, [trip.tripNo, defaultDriver, trip.carNo, trip.currentWeight]);

      let sequence = 1;
      for (let orderNo of trip.orders) {
        await client.query(`
          INSERT INTO trip_orders (TripNo, OrderNo, delivery_sequence)
          VALUES ($1, $2, $3)
        `, [trip.tripNo, orderNo, sequence]);

        await client.query(`
          UPDATE orders SET Status = 'assigned' WHERE OrderNo = $1
        `, [orderNo]);
        
        sequence++;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "จัดรถสำเร็จ!",
      summary: {
        totalTripsCreated: activeTrips.length,
        tripsDetail: activeTrips.map(t => ({
          tripNo: t.tripNo,
          carNo: t.carNo,
          usedCapacity: `${t.currentWeight} / ${t.maxCapacity} kg`,
          orderCount: t.orders.length
        })),
        unassignedOrdersCount: unassignedOrders.length,
        unassignedOrdersList: unassignedOrders
      }
    });

  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
import pool from '../config/db.js';

export const optimizeTrips = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ordersRes = await client.query(`
      SELECT OrderNo, Total_weight, Delivery_lat, Delivery_lng
      FROM orders
      WHERE Status = 'pending'
      ORDER BY Total_weight DESC
    `);
    const pendingOrders = ordersRes.rows;

    if (pendingOrders.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'ไม่มีออเดอร์ค้างส่ง' });
    }

    const carsRes = await client.query(`
      SELECT CarNo, MaxCapacity
      FROM cars
      WHERE Status = 'active'
      ORDER BY MaxCapacity DESC
    `);
    const availableCars = carsRes.rows;

    if (availableCars.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'ไม่มีรถพร้อมใช้งาน' });
    }

    const driversRes = await client.query(`
      SELECT UserID, Name
      FROM users
      WHERE RoleID = 'DRIVER'
      ORDER BY UserID
    `);
    const drivers = driversRes.rows;

    if (drivers.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'ไม่มีคนขับในระบบ' });
    }

    const tripSlots = availableCars.map(car => ({
      carNo:         car.carno,
      maxCapacity:   parseFloat(car.maxcapacity),
      currentWeight: 0,
      orders:        [],
    }));

    const unassignedOrders = [];

    for (const order of pendingOrders) {
      const orderWeight = parseFloat(order.total_weight);
      let placed = false;

      for (const slot of tripSlots) {
        if (slot.currentWeight + orderWeight <= slot.maxCapacity) {
          slot.orders.push(order.orderno);
          slot.currentWeight += orderWeight;
          placed = true;
          break;
        }
      }

      if (!placed) unassignedOrders.push(order.orderno);
    }

    const activeSlots = tripSlots.filter(t => t.orders.length > 0);

    const seqRes  = await client.query(`SELECT nextval('trip_id_seq') as seq`);
    const seqBase = parseInt(seqRes.rows[0].seq);

    const activeTrips = activeSlots.map((slot, i) => ({
      ...slot,
      tripNo:     `TRP-${String(seqBase + i).padStart(5, '0')}`,
      driverID:   drivers[i % drivers.length].userid,  
      driverName: drivers[i % drivers.length].name,
    }));

    for (const trip of activeTrips) {
      await client.query(`
        INSERT INTO trips (TripNo, DriverID, CarNo, Total_weight, Status)
        VALUES ($1, $2, $3, $4, 'planned')
      `, [trip.tripNo, trip.driverID, trip.carNo, trip.currentWeight]);

      let sequence = 1;
      for (const orderNo of trip.orders) {
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
      message: 'จัดรถสำเร็จ!',
      summary: {
        totalTripsCreated:     activeTrips.length,
        totalDriversUsed:      [...new Set(activeTrips.map(t => t.driverID))].length,
        tripsDetail: activeTrips.map(t => ({
          tripNo:       t.tripNo,
          carNo:        t.carNo,
          driverID:     t.driverID,
          driverName:   t.driverName,
          usedCapacity: `${t.currentWeight} / ${t.maxCapacity} kg`,
          orderCount:   t.orders.length,
          orderNos:     t.orders,
          coords:       t.orders
            .map(orderNo => {
              const o = pendingOrders.find(p => p.orderno === orderNo);
              return o ? [parseFloat(o.delivery_lng), parseFloat(o.delivery_lat)] : null;
            })
            .filter(Boolean),
        })),
        unassignedOrdersCount: unassignedOrders.length,
        unassignedOrdersList:  unassignedOrders,
      },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('optimizeTrips Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
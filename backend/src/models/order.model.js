import pool from '../config/db.js';

export const insertOrderWithItems = async (orderData) => {
  const { CusID, items, lat, lng, distanceMeters, isFree } = orderData;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cusCheck = await client.query(
      'SELECT CusID FROM customers WHERE CusID = $1', [CusID]
    );
    if (cusCheck.rows.length === 0) {
      throw new Error(`ไม่พบลูกค้า CusID: ${CusID}`);
    }
    const prodIDs  = items.map(i => i.ProdID);
    const prodsRes = await client.query(
      `SELECT ProdID, Prodname, price, weight_per_unit, QTY
       FROM products
       WHERE ProdID = ANY($1::text[])
       FOR UPDATE`,
      [prodIDs]
    );

    const prodMap = {};
    for (const row of prodsRes.rows) prodMap[row.prodid] = row;
    for (const item of items) {
      const prod = prodMap[item.ProdID];
      if (!prod) throw new Error(`ไม่พบสินค้า ProdID: ${item.ProdID}`);
      if (prod.qty < item.Quantity) {
        throw new Error(`สินค้า "${prod.prodname}" มีในคลัง ${prod.qty} ชิ้น ไม่พอสำหรับ ${item.Quantity} ชิ้น`);
      }
    }

    let totalWeight = 0;
    let totalPrice  = 0;
    const lineItems = items.map(item => {
      const prod       = prodMap[item.ProdID];
      const lineWeight = parseFloat(prod.weight_per_unit) * item.Quantity;
      const linePrice  = parseFloat(prod.price) * item.Quantity;
      totalWeight += lineWeight;
      totalPrice  += linePrice;
      return {
        ProdID:     item.ProdID,
        Quantity:   item.Quantity,
        unitPrice:  parseFloat(prod.price),
        unitWeight: parseFloat(prod.weight_per_unit),
      };
    });

    const distanceKm = parseFloat((distanceMeters / 1000).toFixed(2));

    const now      = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const seqRes   = await client.query(`SELECT nextval('order_id_seq') AS seq`);
    const OrderNo  = `ORD-${datePart}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;

    const orderRes = await client.query(
      `INSERT INTO orders (
         OrderNo, CusID,
         Total_weight, Total_price,
         Delivery_location, Delivery_lat, Delivery_lng,
         Distance_from_store, Is_free_delivery,
         Status, Payment_status
       ) VALUES (
         $1, $2, $3, $4,
         ST_SetSRID(ST_MakePoint($6, $5), 4326), $5, $6,
         $7, $8,
         'pending', 'pending'
       ) RETURNING *`,
      [OrderNo, CusID, totalWeight, totalPrice, lat, lng, distanceKm, isFree]
    );
    const order = orderRes.rows[0];
    const detailRows = [];
    for (const line of lineItems) {
      const detRes = await client.query(
        `INSERT INTO order_details (OrderNo, ProdID, Quantity, price_at_that_time, weight_at_that_time)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [OrderNo, line.ProdID, line.Quantity, line.unitPrice, line.unitWeight]
      );
      detailRows.push(detRes.rows[0]);

      await client.query(
        `UPDATE products SET QTY = QTY - $1 WHERE ProdID = $2`,
        [line.Quantity, line.ProdID]
      );
    }

    await client.query('COMMIT');
    return { order, details: detailRows };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getAllOrders = async () => {
  const result = await pool.query(`
    SELECT
      o.*,
      c.Name  AS customer_name,
      c.Phone AS customer_phone,
      json_agg(
        json_build_object(
          'prodid',             od.ProdID,
          'prodname',           p.Prodname,
          'quantity',           od.Quantity,
          'price_at_that_time', od.price_at_that_time,
          'weight_at_that_time',od.weight_at_that_time
        ) ORDER BY od.id
      ) FILTER (WHERE od.id IS NOT NULL) AS items
    FROM orders o
    LEFT JOIN customers    c  ON o.CusID   = c.CusID
    LEFT JOIN order_details od ON o.OrderNo = od.OrderNo
    LEFT JOIN products      p  ON od.ProdID = p.ProdID
    GROUP BY o.OrderNo, c.Name, c.Phone
    ORDER BY o.Created_at DESC
  `);
  return result.rows;
};
import { LocationService } from "../services/location.service.js";
import { insertOrderWithItems, getAllOrders } from "../models/order.model.js";
import pool from "../config/db.js";

export const createOrder = async (req, res) => {
  try {
    const { CusID, items, lat, lng } = req.body;

    if (!CusID || !lat || !lng) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุ CusID, lat, lng" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ",
        });
    }
    for (const item of items) {
      if (!item.ProdID || !item.Quantity || item.Quantity <= 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: `รายการสินค้าไม่ถูกต้อง: ${JSON.stringify(item)}`,
          });
      }
    }

    const distanceMeters = await LocationService.calculateDistance(lat, lng);
    const isFree = LocationService.isFreeDelivery(distanceMeters);

    const { order, details } = await insertOrderWithItems({
      CusID,
      items,
      lat,
      lng,
      distanceMeters,
      isFree,
    });

    res.status(201).json({
      success: true,
      message: "สร้างคำสั่งซื้อสำเร็จ",
      data: {
        order,
        items: details,
        delivery: {
          distanceKm: parseFloat(order.distance_from_store),
          isFree: order.is_free_delivery,
        },
      },
    });
  } catch (error) {
    console.error("createOrder Error:", error.message);
    const status =
      error.message.includes("ไม่พบ") || error.message.includes("ไม่พอ")
        ? 400
        : 500;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { Name, Phone } = req.body;
    if (!Name || !Phone) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุชื่อและเบอร์โทรศัพท์" });
    }

    const exists = await pool.query(
      "SELECT CusID FROM customers WHERE Phone = $1",
      [Phone],
    );
    if (exists.rows.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "เบอร์โทรนี้มีในระบบแล้ว" });
    }

    const seqRes = await pool.query(`SELECT nextval('cus_id_seq') AS seq`);
    const CusID = `C${String(seqRes.rows[0].seq).padStart(5, "0")}`;

    const result = await pool.query(
      `INSERT INTO customers (CusID, Name, Phone)
       VALUES ($1, $2, $3)
       RETURNING CusID, Name, Phone`,
      [CusID, Name, Phone],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const lookupCustomer = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุเบอร์โทรศัพท์" });
    }

    const result = await pool.query(
      `SELECT
         c.CusID,
         c.Name,
         c.Phone,
         o.OrderNo      AS last_orderno,
         o.Delivery_lat AS last_lat,
         o.Delivery_lng AS last_lng,
         o.Created_at   AS last_order_date
       FROM customers c
       LEFT JOIN orders o
         ON o.CusID      = c.CusID
         AND o.Created_at = (
           SELECT MAX(Created_at)
           FROM orders
           WHERE CusID = c.CusID
             AND Delivery_lat IS NOT NULL
             AND Delivery_lng IS NOT NULL
         )
       WHERE c.Phone = $1
       LIMIT 1`,
      [phone],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบลูกค้า" });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        cusid: row.cusid,
        name: row.name,
        phone: row.phone,
        last_lat: row.last_lat ? parseFloat(row.last_lat) : null,
        last_lng: row.last_lng ? parseFloat(row.last_lng) : null,
        last_orderno: row.last_orderno ?? null,
        last_order_date: row.last_order_date ?? null,
        is_returning: !!row.last_orderno,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkDeliveryFee = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณาระบุ lat, lng" });
    }
    const distanceMeters = await LocationService.calculateDistance(lat, lng);
    const isFree = LocationService.isFreeDelivery(distanceMeters);
    res.json({
      success: true,
      distanceKm: parseFloat((distanceMeters / 1000).toFixed(2)),
      isFree,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoreLocation = (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        lat: parseFloat(process.env.STORE_LAT),
        lng: parseFloat(process.env.STORE_LNG),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markOrderDelivered = async (req, res) => {
  try {
    const { orderNo } = req.params;
    const result = await pool.query(
      `UPDATE orders SET Status = 'delivered'
       WHERE OrderNo = $1
       RETURNING OrderNo, Status`,
      [orderNo],
    );
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "ไม่พบ order นี้" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProducts = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.ProdID, p.Prodname, p.price, p.weight_per_unit, p.QTY,
             pt.ProdTypeName
      FROM products p
      LEFT JOIN product_types pt ON p.ProdTypeID = pt.ProdTypeID
      ORDER BY pt.ProdTypeName, p.Prodname
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

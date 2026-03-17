import { LocationService } from '../services/location.service.js';
import { insertOrder } from '../models/order.model.js';
import { getAllOrders } from '../models/order.model.js';

export const createOrder = async (req, res) => {
  try {
    const { CusID, Total_weight, lat, lng } = req.body;

    const OrderNo = `ORD-${Date.now()}`;

    const distanceMeters = await LocationService.calculateDistance(lat, lng);
    const isFree = LocationService.isFreeDelivery(distanceMeters);

    const newOrder = await insertOrder({
      OrderNo,
      CusID,
      Total_weight,
      lat,
      lng,
      distanceMeters,
      isFree
    });


    res.status(201).json({
      success: true,
      message: "สร้างคำสั่งซื้อและบันทึกพิกัดสำเร็จ",
      data: newOrder
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
        success: false, 
        message: "เกิดข้อผิดพลาดในการสร้างออเดอร์",
        error: error.message 
    });
  }
};

export const getStoreLocation = (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        lat: parseFloat(process.env.STORE_LAT ),
        lng: parseFloat(process.env.STORE_LNG )
      }
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
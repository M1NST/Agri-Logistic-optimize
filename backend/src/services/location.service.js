import pool from '../config/db.js';

export class LocationService {
  static get STORE_LAT() { return Number(process.env.STORE_LAT); }
  static get STORE_LNG() { return Number(process.env.STORE_LNG); }
  static get FREE_KM()   { return Number(process.env.FREE_DELIVERY_KM); }
  static get FEE_PER_KM() { return Number(process.env.DELIVERY_FEE_PER_KM); }
  static get MAPBOX_TOKEN() { return process.env.MAPBOX_ACCESS_TOKEN; }

    static async calculateDistance(customerLat, customerLng) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/`
      + `${this.STORE_LNG},${this.STORE_LAT};${customerLng},${customerLat}`
      + `?overview=false&access_token=${this.MAPBOX_TOKEN}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (!data.routes?.[0]) {
      throw new Error('ไม่สามารถคำนวณระยะทางได้ กรุณาตรวจสอบพิกัด');
    }

    return data.routes[0].distance;
  }

  static isFreeDelivery(distanceMeters) {
    return (distanceMeters / 1000) <= this.FREE_KM;
  }

  static calculateDeliveryFee(distanceMeters) {
    const distanceKm = distanceMeters / 1000;
    if (distanceKm <= this.FREE_RADIUS_KM) return 0;
    const extraKm = distanceKm - this.FREE_RADIUS_KM;
    return Math.ceil(extraKm) * this.FEE_PER_KM;
  } 

}
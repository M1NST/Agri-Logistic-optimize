import pool from '../config/db.js';

export class LocationService {
  static get STORE_LAT() { return Number(process.env.STORE_LAT); }
  static get STORE_LNG() { return Number(process.env.STORE_LNG); }ฃ
  static get FREE_RADIUS_KM() { return Number(process.env.FREE_DELIVERY_RADIUS_KM); }
  static get FEE_PER_KM() { return Number(process.env.DELIVERY_FEE_PER_KM); }

  static async calculateDistance(customerLat, customerLng) {
    const query = `
      SELECT ST_Distance(
        ST_MakePoint($1, $2)::geography, 
        ST_MakePoint($3, $4)::geography
      ) as distance_meters;
    `;
    const values = [this.STORE_LNG, this.STORE_LAT, customerLng, customerLat];
    const result = await pool.query(query, values);
    
    return parseFloat(result.rows[0].distance_meters);
  }

  static isFreeDelivery(distanceMeters) {
    return (distanceMeters / 1000) <= this.FREE_RADIUS_KM;
  }

  static calculateDeliveryFee(distanceMeters) {
    const distanceKm = distanceMeters / 1000;
    if (distanceKm <= this.FREE_RADIUS_KM) return 0;
    const extraKm = distanceKm - this.FREE_RADIUS_KM;
    return Math.ceil(extraKm) * this.FEE_PER_KM;
  } 

}
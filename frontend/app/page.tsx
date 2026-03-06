"use client";

import { useEffect, useRef, useState, FormEvent } from 'react';
import mapboxgl from 'mapbox-gl';



// กำหนด Type ให้กับข้อมูลออเดอร์
interface Order {
  orderno?: string;
  OrderNo?: string;
  total_weight?: string | number;
  Total_weight?: string | number;
  distance_from_store?: string | number;
  Distance_from_store?: string | number;
  delivery_lat?: number;
  Delivery_lat?: number;
  delivery_lng?: number;
  Delivery_lng?: number;
  delivery_location?: { coordinates: [number, number] };
}

// ดึง Key จากไฟล์ .env.local
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

export default function Home() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // State สำหรับฟอร์ม
  const [formData, setFormData] = useState({
    CusID: 'U00001',
    Total_weight: '',
    lat: '',
    lng: ''
  });

  // ฟังก์ชันดึงข้อมูลจาก Backend
  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/orders/all');
      const result = await res.json();
      if (result.success) setOrders(result.data);
    } catch (error) {
      console.error('ดึงข้อมูลล้มเหลว:', error);
    }
  };

  // 1. ฟังก์ชันไปขอเส้นทางถนนจริงจาก Mapbox
  const getRoute = async (coordinates: number[][]) => {
    // coordinates คือ Array ของพิกัด [lng, lat] เช่น [พิกัดร้าน, พิกัดลูกค้า1, พิกัดลูกค้า2]
    const query = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${query}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    return data.routes[0].geometry; // ส่งข้อมูลเส้นทาง (GeoJSON) กลับมา
  };

  // 2. ฟังก์ชันวาดเส้นลงบนแผนที่
  const drawRouteOnMap = async (tripId: string, coordinates: number[][], color: string) => {
    if (!map.current) return;

    const geometry = await getRoute(coordinates);

    // ถ้ามีเส้นทางเก่าของรถคันนี้อยู่ ให้ลบทิ้งก่อน
    if (map.current.getSource(tripId)) {
      map.current.removeLayer(tripId);
      map.current.removeSource(tripId);
    }

    // สร้างข้อมูลเส้นทางใหม่
    map.current.addSource(tripId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: geometry
      }
    });

    // วาดเส้นทางลงแผนที่
    map.current.addLayer({
      id: tripId,
      type: 'line',
      source: tripId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': color,
        'line-width': 5, // ความหนาของเส้น
        'line-opacity': 0.8
      }
    });
  };

  // โหลดแผนที่ครั้งแรก
// ... โค้ดส่วนบน (State ต่างๆ) เหมือนเดิม ...

  // โหลดแผนที่ครั้งแรก
  useEffect(() => {
    if (map.current || !mapContainer.current) return; 

    const initMap = async () => {
      try {
        const storeRes = await fetch('http://localhost:3000/api/orders/store-location');
        const storeResult = await storeRes.json();
        
        let centerLng = 100.7750;
        let centerLat = 13.7367;

        if (storeResult.success) {
          centerLng = storeResult.data.lng;
          centerLat = storeResult.data.lat;
        }

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [centerLng, centerLat],
          zoom: 14
        });

        const storePopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="p-2 text-center">
            <h3 class="font-bold text-green-800 text-lg">🏪 ร้านของเรา</h3>
          </div>
        `);

        new mapboxgl.Marker({ color: '#16a34a' }) 
          .setLngLat([centerLng, centerLat])
          .setPopup(storePopup)
          .addTo(map.current);

        fetchOrders(); 

      } catch (error) {
        console.error("โหลดข้อมูลร้านล้มเหลว:", error);
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // เคลียร์หมุดเก่าก่อน
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    orders.forEach((order) => {
      // รองรับชื่อคอลัมน์ทั้งตัวเล็กตัวใหญ่
      const lat = order.delivery_lat || order.Delivery_lat || order.delivery_location?.coordinates?.[1];
      const lng = order.delivery_lng || order.Delivery_lng || order.delivery_location?.coordinates?.[0];

      if (lat && lng) {
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="p-2">
            <h3 class="font-bold text-green-700">📦 ${order.orderno || order.OrderNo}</h3>
            <p class="text-sm m-0">น้ำหนัก: ${order.total_weight || order.Total_weight} กก.</p>
            <p class="text-sm m-0 text-blue-600">ระยะทาง: ${order.distance_from_store || order.Distance_from_store} กม.</p>
          </div>
        `);

        const marker = new mapboxgl.Marker({ color: '#f97316' })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);
          
        markersRef.current.push(marker);
      }
    });
  }, [orders]);

  // จัดการเมื่อกด Submit ฟอร์ม
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3000/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CusID: formData.CusID,
          Total_weight: parseFloat(formData.Total_weight),
          lat: parseFloat(formData.lat),
          lng: parseFloat(formData.lng)
        })
      });

      const result = await res.json();
      if (result.success) {
        alert('✅ สร้างออเดอร์สำเร็จ!');
        setFormData({ CusID: 'U00001', Total_weight: '', lat: '', lng: '' });
        fetchOrders(); // รีเฟรชหมุดบนแผนที่
        map.current?.flyTo({ center: [parseFloat(formData.lng), parseFloat(formData.lat)], zoom: 13 });
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.message);
      }
    } catch (error) {
      alert('❌ ไม่สามารถเชื่อมต่อ Backend ได้ ตรวจสอบให้แน่ใจว่าเปิด Backend ทิ้งไว้ที่ Port 3000');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative w-full h-screen bg-gray-50 overflow-hidden">
      {/* แผนที่ Mapbox พื้นหลัง */}
      <div ref={mapContainer} className="absolute inset-0" />
      <div 
        ref={mapContainer} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh' }} 
      />
      
      {/* UI แผงควบคุม (ใช้ Tailwind) */}
      <div className="absolute top-4 left-4 z-10 w-80 bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-100">
        <h1 className="text-2xl font-black text-green-800 tracking-tight flex items-center gap-2">
          🌱 Agri-Logistics
        </h1>
        <p className="text-gray-500 text-sm font-medium mb-6 mt-1">
          ระบบจัดการรอบการจัดส่งอัจฉริยะ
        </p>

        <div className="bg-orange-50 text-orange-800 px-4 py-3 rounded-lg flex justify-between items-center mb-6 font-semibold">
          <span>ออเดอร์ทั้งหมด</span>
          <span className="bg-orange-200 px-2 py-0.5 rounded-full">{orders.length}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="font-bold text-gray-700 border-b pb-2">➕ สร้างออเดอร์จัดส่ง</h2>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">รหัสลูกค้า</label>
            <input required type="text" 
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={formData.CusID} onChange={(e) => setFormData({...formData, CusID: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">น้ำหนักรวม (กก.)</label>
            <input required type="number" step="0.1" placeholder="เช่น 50.5"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
              value={formData.Total_weight} onChange={(e) => setFormData({...formData, Total_weight: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ละติจูด (Lat)</label>
              <input required type="number" step="any" placeholder="13.7xx"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                value={formData.lat} onChange={(e) => setFormData({...formData, lat: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ลองจิจูด (Lng)</label>
              <input required type="number" step="any" placeholder="100.7xx"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                value={formData.lng} onChange={(e) => setFormData({...formData, lng: e.target.value})} />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className={`mt-2 w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all 
              ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 hover:shadow-green-500/30 hover:-translate-y-0.5'}`}
          >
            {isLoading ? '⏳ กำลังบันทึก...' : '📍 บันทึกและปักหมุด'}
          </button>
        </form>
      <button 
          onClick={async () => {
            alert('กำลังคำนวณเส้นทางและจัดรถ...');
            
            // พิกัดร้าน (จาก .env ของคุณที่นครศรีธรรมราช)
            const storeCoords = [99.6542086, 8.1602847]; 
            
            // คันที่ 1: รถ 6 ล้อ (สีน้ำเงิน)
            const truck1Coords = [
              storeCoords, 
              [99.6600, 8.1650], 
              [99.6400, 8.1500], 
              storeCoords  
            ];

            // คันที่ 2: รถกระบะ (สีม่วง)
            const pickup1Coords = [
              storeCoords,
              [99.6800, 8.1800],
              [99.6900, 8.1900],
              [99.7000, 8.2000]
            ];

            // สั่งวาดเส้นทางบนแผนที่
            await drawRouteOnMap('route-truck1', truck1Coords, '#3b82f6'); // สีน้ำเงิน
            await drawRouteOnMap('route-pickup1', pickup1Coords, '#a855f7'); // สีม่วง
            
          }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
        >
          🚚 ประมวลผลจัดรถ (Optimize)
        </button>
        {/* ========================================= */}

      </div> {/* สิ้นสุดกรอบ UI สีขาวด้านซ้าย */}
    </main>
  );
}
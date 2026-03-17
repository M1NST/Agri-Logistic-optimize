"use client";

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'; // อย่าลืม import css ของ mapbox

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
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const STORE_LAT = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || '8.1650');
const STORE_LNG = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || '99.6600');

export default function Home() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // State สำหรับฟอร์ม
  const [formData, setFormData] = useState({
    CusID: 'U00001',
    Total_weight: '',
    lat: '',
    lng: ''
  });

  // 🔒 1. ตรวจสอบสิทธิ์ (ต้องเป็น ADMIN เท่านั้น)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    
    if (!token || !userStr) {
      router.push("/login");
      return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== 'ADMIN') {
      alert("คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลระบบ)");
      router.push("/login"); // หรือเด้งไปหน้า Customer/Driver ตามเหมาะสม
    }
  }, [router]);

  // 2. ฟังก์ชันดึงข้อมูลจาก Backend
  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/orders/all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (result.success) setOrders(result.data);
    } catch (error) {
      console.error('ดึงข้อมูลออเดอร์ล้มเหลว:', error);
    }
  };

  // 3. ฟังก์ชันไปขอเส้นทางถนนจริงจาก Mapbox
  const getRoute = async (coordinates: number[][]) => {
    const query = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${query}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    return data.routes[0].geometry; 
  };

  // 4. ฟังก์ชันวาดเส้นลงบนแผนที่
  const drawRouteOnMap = async (tripId: string, coordinates: number[][], color: string) => {
    if (!map.current) return;

    try {
      const geometry = await getRoute(coordinates);

      if (map.current.getSource(tripId)) {
        map.current.removeLayer(tripId);
        map.current.removeSource(tripId);
      }

      map.current.addSource(tripId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: geometry
        }
      });

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
          'line-width': 5,
          'line-opacity': 0.8
        }
      });
    } catch (error) {
      console.error(`วาดเส้นทาง ${tripId} ล้มเหลว:`, error);
    }
  };

  // 5. โหลดแผนที่ครั้งแรก
  useEffect(() => {
    if (map.current || !mapContainer.current) return; 

    const initMap = async () => {
      try {
        // ใช้พิกัดจาก .env เป็นศูนย์กลาง
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [STORE_LNG, STORE_LAT],
          zoom: 14
        });

        const storePopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="p-2 text-center">
            <h3 class="font-bold text-green-800 text-lg">🏪 ร้านของเรา</h3>
          </div>
        `);

        new mapboxgl.Marker({ color: '#16a34a' }) 
          .setLngLat([STORE_LNG, STORE_LAT])
          .setPopup(storePopup)
          .addTo(map.current);

        fetchOrders(); 

      } catch (error) {
        console.error("โหลดแผนที่ล้มเหลว:", error);
      }
    };

    initMap();
  }, []);

  // 6. อัปเดตหมุดออเดอร์เมื่อ State เปลี่ยน
  useEffect(() => {
    if (!map.current) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    orders.forEach((order) => {
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

  // 7. จัดการฟอร์มสร้างออเดอร์
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/orders/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
        fetchOrders(); 
        map.current?.flyTo({ center: [parseFloat(formData.lng), parseFloat(formData.lat)], zoom: 13 });
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.message);
      }
    } catch (error) {
      alert('❌ ไม่สามารถเชื่อมต่อ Backend ได้');
    } finally {
      setIsLoading(false);
    }
  };

  // 8. จัดการปุ่ม Optimize
  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/optimize/run`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        }
      });
      
      const result = await res.json();
      
      if (result.success) {
        alert('🚚 จัดรถสำเร็จ!');
        fetchOrders(); // อัปเดตสถานะออเดอร์
        
        // ---------------------------------------------------------
        // ตัวอย่างการแสดงเส้นทาง (สามารถนำข้อมูลที่ได้จาก API มาประยุกต์ต่อได้)
        // ---------------------------------------------------------
        const storeCoords = [STORE_LNG, STORE_LAT]; 
        
        // คันที่ 1: รถ 6 ล้อ (สีน้ำเงิน)
        const truck1Coords = [
          storeCoords, 
          [STORE_LNG + 0.005, STORE_LAT + 0.005], 
          [STORE_LNG - 0.015, STORE_LAT - 0.015], 
          storeCoords  
        ];

        // คันที่ 2: รถกระบะ (สีม่วง)
        const pickup1Coords = [
          storeCoords,
          [STORE_LNG + 0.02, STORE_LAT + 0.02],
          [STORE_LNG + 0.03, STORE_LAT + 0.03]
        ];

        await drawRouteOnMap('route-truck1', truck1Coords, '#3b82f6');
        await drawRouteOnMap('route-pickup1', pickup1Coords, '#a855f7');
        
      } else {
        alert('ℹ️ ' + result.message);
      }
    } catch (error) {
      console.error(error);
      alert('❌ ไม่สามารถเชื่อมต่อ API จัดรถได้');
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <main className="relative w-full h-screen bg-gray-50 overflow-hidden">
      {/* แผนที่ Mapbox (แก้ไข div ซ้ำซ้อนให้เหลืออันเดียว) */}
      <div 
        ref={mapContainer} 
        className="absolute inset-0 w-full h-full" 
      />
      
      {/* UI แผงควบคุม (ด้านซ้าย) */}
      <div className="absolute top-4 left-4 z-10 w-80 bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-100 max-h-[95vh] overflow-y-auto">
        
        <div className="flex justify-between items-start mb-2">
          <h1 className="text-2xl font-black text-green-800 tracking-tight flex items-center gap-2">
            🌱 Agri-Logistics
          </h1>
          <button 
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              router.push("/login");
            }}
            className="text-xs text-red-500 font-bold hover:underline mt-1"
          >
            ออกจากระบบ
          </button>
        </div>
        
        <p className="text-gray-500 text-sm font-medium mb-6 mt-1">
          ระบบจัดการรอบการจัดส่งอัจฉริยะ (ADMIN)
        </p>

        <div className="bg-orange-50 text-orange-800 px-4 py-3 rounded-lg flex justify-between items-center mb-6 font-semibold">
          <span>ออเดอร์ที่รอดำเนินการ</span>
          <span className="bg-orange-200 px-2 py-0.5 rounded-full">{orders.length}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-6">
          <h2 className="font-bold text-gray-700 border-b pb-2">➕ สร้างออเดอร์จัดส่งจำลอง</h2>
          
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
              <input required type="number" step="any" placeholder={`${STORE_LAT}`}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                value={formData.lat} onChange={(e) => setFormData({...formData, lat: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ลองจิจูด (Lng)</label>
              <input required type="number" step="any" placeholder={`${STORE_LNG}`}
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
          onClick={handleOptimize}
          disabled={isOptimizing}
          className={`w-full font-bold py-3 rounded-xl shadow-lg transition-all 
            ${isOptimizing ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/30 hover:-translate-y-0.5'}`}
        >
          {isOptimizing ? '⚙️ กำลังประมวลผล...' : '🚚 ประมวลผลจัดรถ (Optimize)'}
        </button>

      </div> 
    </main>
  );
}
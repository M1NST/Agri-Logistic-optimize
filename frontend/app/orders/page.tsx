"use client";

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrderItem {
  prodname: string;
  quantity: number;
  price_at_that_time: number;
}

interface Order {
  orderno?: string;
  OrderNo?: string;
  total_weight?: string | number;
  Total_weight?: string | number;
  total_price?: string | number;
  Total_price?: string | number;
  payment_status?: string;
  distance_from_store?: string | number;
  Distance_from_store?: string | number;
  delivery_lat?: number;
  Delivery_lat?: number;
  delivery_lng?: number;
  Delivery_lng?: number;
  delivery_location?: { coordinates: [number, number] };
  status?: string;
  items?: OrderItem[];
}

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;
const API_URL    = process.env.NEXT_PUBLIC_API_URL   || 'http://localhost:3000/api';
const STORE_LAT  = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || '8.1650');
const STORE_LNG  = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || '99.6600');

const ROUTE_COLORS = ['#3b82f6', '#a855f7', '#f97316', '#ec4899', '#06b6d4', '#84cc16'];

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABEL: Record<string, string> = {
  pending: '⏳ รอชำระ',
  paid:    '✅ ชำระแล้ว',
  credit:  '📋 เครดิต',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const router       = useRouter();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map          = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);

  const [orders,       setOrders]       = useState<Order[]>([]);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // ── auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const token   = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) { router.push('/login'); return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'ADMIN') {
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      router.push('/login');
    }
  }, [router]);

  // ── fetch orders ─────────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_URL}/orders/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) setOrders(result.data);
    } catch (error) {
      console.error('ดึงข้อมูลออเดอร์ล้มเหลว:', error);
    }
  };

  // ── get real road route from Mapbox Directions ────────────────────────────────
  const getRoute = async (coordinates: number[][]) => {
    const query = coordinates.map(c => `${c[0]},${c[1]}`).join(';');
    const url   = `https://api.mapbox.com/directions/v5/mapbox/driving/${query}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    const res   = await fetch(url);
    const data  = await res.json();
    return data.routes[0].geometry;
  };

  // ── draw route on map ─────────────────────────────────────────────────────────
  const drawRouteOnMap = async (tripId: string, coordinates: number[][], color: string) => {
    if (!map.current) return;
    try {
      const geometry = await getRoute(coordinates);

      if (map.current.getSource(tripId)) {
        map.current.removeLayer(`${tripId}-shadow`);
        map.current.removeLayer(tripId);
        map.current.removeSource(tripId);
      }

      map.current.addSource(tripId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry },
      });
      // shadow
      map.current.addLayer({
        id: `${tripId}-shadow`, type: 'line', source: tripId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 4 },
      });
      map.current.addLayer({
        id: tripId, type: 'line', source: tripId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 },
      });
    } catch (error) {
      console.error(`วาดเส้นทาง ${tripId} ล้มเหลว:`, error);
    }
  };

  // ── init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style:     'mapbox://styles/mapbox/satellite-streets-v12',
      center:    [STORE_LNG, STORE_LAT],
      zoom:      14,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    new mapboxgl.Marker({ color: '#16a34a' })
      .setLngLat([STORE_LNG, STORE_LAT])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div class="p-2 text-center"><h3 class="font-bold text-green-800 text-lg">🏪 ร้านของเรา</h3></div>`
      ))
      .addTo(map.current);

    fetchOrders();
  }, []);

  // ── update order markers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    orders.forEach((order) => {
      const lat = order.delivery_lat  ?? order.Delivery_lat  ?? order.delivery_location?.coordinates?.[1];
      const lng = order.delivery_lng  ?? order.Delivery_lng  ?? order.delivery_location?.coordinates?.[0];
      if (!lat || !lng) return;

      const orderNo    = order.orderno    ?? order.OrderNo    ?? '-';
      const weight     = order.total_weight   ?? order.Total_weight   ?? 0;
      const price      = order.total_price    ?? order.Total_price    ?? 0;
      const distance   = order.distance_from_store ?? order.Distance_from_store ?? 0;
      const payment    = PAYMENT_LABEL[order.payment_status ?? ''] ?? '-';

      // items summary
      const itemsHtml = order.items && order.items.length > 0
        ? order.items.map(i =>
            `<p class="text-xs m-0 text-gray-600">${i.prodname} ×${i.quantity}</p>`
          ).join('')
        : '<p class="text-xs m-0 text-gray-400">-</p>';

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="p-2" style="min-width:180px">
          <h3 class="font-bold text-green-700 mb-1">📦 ${orderNo}</h3>
          <p class="text-sm m-0">⚖️ น้ำหนัก: <b>${weight} กก.</b></p>
          <p class="text-sm m-0 text-blue-600">📍 ระยะทาง: ${distance} กม.</p>
          <p class="text-sm m-0 text-emerald-600">💰 ยอด: ฿${fmt(Number(price))}</p>
          <p class="text-sm m-0">${payment}</p>
          <hr class="my-1"/>
          <p class="text-xs font-semibold text-gray-500 mb-1">รายการสินค้า</p>
          ${itemsHtml}
        </div>
      `);

      const marker = new mapboxgl.Marker({ color: '#f97316' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [orders]);

  // ── optimize ──────────────────────────────────────────────────────────────────
  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const token = localStorage.getItem('token');
      const res   = await fetch(`${API_URL}/optimize/run`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const result = await res.json();

      if (result.success) {
        alert(`🚚 จัดรถสำเร็จ! ${result.summary.totalTripsCreated} รอบ`);
        fetchOrders();

        // วาดเส้นทางจริงจาก coords ที่ optimize controller ส่งมา
        for (let i = 0; i < result.summary.tripsDetail.length; i++) {
          const trip  = result.summary.tripsDetail[i];
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length];

          if (!trip.coords || trip.coords.length === 0) continue;

          const coords = [
            [STORE_LNG, STORE_LAT],   // เริ่มจากร้าน
            ...trip.coords,            // จุดส่งจริงแต่ละ order
            [STORE_LNG, STORE_LAT],   // กลับร้าน
          ];

          await drawRouteOnMap(`route-trip-${i}`, coords, color);
        }
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

  const pendingOrders = orders.filter(o => (o.status ?? '') === 'pending');

  // UI
  return (
    <main className="relative w-full h-screen bg-gray-50 overflow-hidden">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Control panel */}
      <div className="absolute top-4 left-4 z-10 w-80 bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-100 max-h-[95vh] overflow-y-auto">

        <div className="flex justify-between items-start mb-2">
          <h1 className="text-2xl font-black text-green-800 tracking-tight flex items-center gap-2">
            🌱 Agri-Logistics
          </h1>
          <button
            onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/login'); }}
            className="text-xs text-red-500 font-bold hover:underline mt-1"
          >
            ออกจากระบบ
          </button>
        </div>

        <p className="text-gray-500 text-sm font-medium mb-6 mt-1">
          ระบบจัดการรอบการจัดส่งอัจฉริยะ (ADMIN)
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-orange-50 text-orange-800 px-4 py-3 rounded-lg font-semibold">
            <div className="text-xs text-orange-500 mb-1">รอดำเนินการ</div>
            <div className="text-2xl font-black">{pendingOrders.length}</div>
          </div>
          <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-lg font-semibold">
            <div className="text-xs text-blue-500 mb-1">ทั้งหมด</div>
            <div className="text-2xl font-black">{orders.length}</div>
          </div>
        </div>

        {/* Order list preview */}
        {orders.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold text-gray-700 border-b pb-2 mb-3">📋 ออเดอร์ล่าสุด</h2>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {orders.slice(0, 10).map((order) => {
                const orderNo  = order.orderno  ?? order.OrderNo  ?? '-';
                const weight   = order.total_weight  ?? order.Total_weight  ?? 0;
                const price    = order.total_price   ?? order.Total_price   ?? 0;
                const status   = order.status ?? 'pending';
                const statusColor: Record<string,string> = {
                  pending:   'bg-yellow-100 text-yellow-700',
                  assigned:  'bg-blue-100 text-blue-700',
                  delivered: 'bg-green-100 text-green-700',
                };
                return (
                  <div key={orderNo} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-700">{orderNo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusColor[status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                      <span>⚖️ {weight} กก.</span>
                      <span>฿{fmt(Number(price))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optimize button */}
        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className={`w-full font-bold py-3 rounded-xl shadow-lg transition-all 
            ${isOptimizing
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/30 hover:-translate-y-0.5'
            }`}
        >
          {isOptimizing ? '⚙️ กำลังประมวลผล...' : '🚚 ประมวลผลจัดรถ (Optimize)'}
        </button>

        {pendingOrders.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-2">ไม่มีออเดอร์รอจัดส่ง</p>
        )}
      </div>
    </main>
  );
}
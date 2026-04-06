"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;
const API_URL   = process.env.NEXT_PUBLIC_API_URL;
const STORE_LAT = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || "8.1650");
const STORE_LNG = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || "99.6600");
const COLORS    = ["#3b82f6", "#a855f7", "#f97316", "#ec4899", "#06b6d4", "#84cc16"];

interface OrderItem { prodname: string; quantity: number; price_at_that_time: number; }
interface Order {
  orderno: string; cusid: string; customer_name: string; customer_phone: string;
  total_weight: number; total_price: number; status: string;
  distance_from_store: number; is_free_delivery: boolean;
  delivery_lat: number; delivery_lng: number;
  payment_status: string; items: OrderItem[];
}
interface TripDetail {
  tripNo: string; carNo: string; driverID: string;
  usedCapacity: string; orderCount: number;
  orderNos: string[]; coords: [number, number][];
}

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "รอส่ง",       bg: "#2d1a00", color: "#d29922" },
  assigned:  { label: "จัดรถแล้ว",   bg: "#0d1a2d", color: "#60a5fa" },
  delivered: { label: "ส่งแล้ว",     bg: "#0d2818", color: "#4ade80" },
};

const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdminPage() {
  const router       = useRouter();
  const mapRef       = useRef<HTMLDivElement>(null);
  const map          = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);

  const [orders,       setOrders]       = useState<Order[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<TripDetail[] | null>(null);
  const [statusFilter,  setStatusFilter]  = useState<string>("all");
  const [expandOrder,   setExpandOrder]   = useState<string | null>(null);

  // auth check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const usr   = localStorage.getItem("user");
    if (!token || !usr) { router.push("/login"); return; }
    if (JSON.parse(usr).role !== "ADMIN") { router.push("/login"); return; }
  }, [router]);

  // fetch orders
  const fetchOrders = async () => {
    const token = localStorage.getItem("token");
    const r     = await fetch(`${API_URL}/orders/all`, { headers: { Authorization: `Bearer ${token}` } });
    const d     = await r.json();
    if (d.success) setOrders(d.data);
  };

  // initial map setup
  useEffect(() => {
    if (map.current || !mapRef.current) return;
    map.current = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [STORE_LNG, STORE_LAT],
      zoom: 12,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    new mapboxgl.Marker({ color: "#22c55e" })
      .setLngLat([STORE_LNG, STORE_LAT])
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(`<b style="color:#22c55e">🏪 ร้านของเรา</b>`))
      .addTo(map.current);
    fetchOrders();
  }, []);

  //update markers when orders change
  useEffect(() => {
    if (!map.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    orders.forEach(order => {
      if (!order.delivery_lat || !order.delivery_lng) return;
      const st = STATUS[order.status] ?? STATUS.pending;
      const popup = new mapboxgl.Popup({ offset: 22, closeButton: false }).setHTML(`
        <div style="font-size:12px;line-height:1.7;min-width:160px">
          <b style="color:#3b82f6">${order.orderno}</b><br>
          👤 ${order.customer_name ?? "-"} · ${order.customer_phone ?? ""}<br>
          ⚖️ ${order.total_weight} กก. · ฿${fmt(order.total_price)}<br>
          📍 ${order.distance_from_store} กม. ${order.is_free_delivery ? "· ฟรีค่าส่ง ✅" : ""}<br>
          <span style="color:${st.color}">${st.label}</span>
        </div>
      `);
      const marker = new mapboxgl.Marker({ color: order.status === "delivered" ? "#22c55e" : order.status === "assigned" ? "#3b82f6" : "#f97316" })
        .setLngLat([order.delivery_lng, order.delivery_lat])
        .setPopup(popup)
        .addTo(map.current!);
      markersRef.current.push(marker);
    });
  }, [orders]);

  //draw route on activeTrip change
  const drawRoute = async (id: string, coords: number[][], color: string) => {
    if (!map.current) return;
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${
        coords.map(c => c.join(",")).join(";")
      }?geometries=geojson&overview=full&optimize_waypoints=true&access_token=${mapboxgl.accessToken}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.routes?.[0]) return;

      if (map.current.getSource(id)) {
        map.current.removeLayer(`${id}-s`);
        map.current.removeLayer(id);
        map.current.removeSource(id);
      }
      map.current.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: data.routes[0].geometry } });
      map.current.addLayer({ id: `${id}-s`, type: "line", source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#000", "line-width": 8, "line-opacity": 0.3, "line-blur": 5 } });
      map.current.addLayer({ id, type: "line", source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": color, "line-width": 4, "line-opacity": 0.9 } });
    } catch (e) { console.error(e); }
  };

  // optimize route
  const handleOptimize = async () => {
    setIsOptimizing(true); setOptimizeResult(null);
    try {
      const token = localStorage.getItem("token");
      const r     = await fetch(`${API_URL}/optimize/run`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (d.success) {
        setOptimizeResult(d.summary.tripsDetail);
        fetchOrders();
        for (let i = 0; i < d.summary.tripsDetail.length; i++) {
          const trip = d.summary.tripsDetail[i];
          if (!trip.coords?.length) continue;
          await drawRoute(`route-${i}`, [[STORE_LNG, STORE_LAT], ...trip.coords, [STORE_LNG, STORE_LAT]], COLORS[i % COLORS.length]);
        }
      } else {
        alert("ℹ️ " + d.message);
      }
    } finally { setIsOptimizing(false); }
  };

  // derived data
  const filtered    = statusFilter === "all" ? orders : orders.filter(o => o.status === statusFilter);
  const pendingCnt  = orders.filter(o => o.status === "pending").length;
  const totalWeight = orders.filter(o => o.status === "pending").reduce((s, o) => s + Number(o.total_weight), 0);
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);

  return (
    <main style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0d1117", fontFamily: "'IBM Plex Sans Thai','IBM Plex Sans',sans-serif", color: "#e6edf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet"/>

      {/* ── Left panel ── */}
      <div style={{ width: 340, display: "flex", flexDirection: "column", borderRight: "1px solid #21262d", overflow: "hidden", flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #21262d", background: "#161b22" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 500, fontSize: 14, color: "#3fb950" }}>🌱 Agri-Logistics</span>
            <button onClick={() => { localStorage.clear(); router.push("/login"); }}
              style={{ fontSize: 11, color: "#f85149", background: "none", border: "none", cursor: "pointer" }}>ออกจากระบบ</button>
          </div>

          {/* stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "รอจัดส่ง",   value: pendingCnt,               color: "#d29922" },
              { label: "ทั้งหมด",    value: orders.length,            color: "#e6edf3" },
              { label: "น้ำหนักรวม", value: `${totalWeight.toFixed(0)} กก.`, color: "#60a5fa" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0d1117", borderRadius: 8, padding: "8px 10px", border: "1px solid #21262d" }}>
                <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 16, fontWeight: 500, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#6e7681", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* optimize button */}
          <button onClick={handleOptimize} disabled={isOptimizing || pendingCnt === 0}
            style={{ width: "100%", padding: "10px 0", borderRadius: 9, border: `1px solid ${pendingCnt > 0 ? "#1f6feb" : "#30363d"}`, background: pendingCnt > 0 && !isOptimizing ? "linear-gradient(135deg,#1f6feb,#1958b7)" : "#21262d", color: pendingCnt > 0 && !isOptimizing ? "#fff" : "#484f58", fontWeight: 700, fontSize: 13, cursor: pendingCnt > 0 && !isOptimizing ? "pointer" : "not-allowed", transition: "all .2s" }}>
            {isOptimizing ? "⚙️ กำลังจัดรถ..." : `🚚 จัดรถ Optimize (${pendingCnt} orders)`}
          </button>
        </div>

        {/* Optimize result — car weight breakdown */}
        {optimizeResult && (
          <div style={{ background: "#0d1117", borderBottom: "1px solid #21262d", padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "#8b949e", fontWeight: 600, letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 8 }}>ผลการจัดรถ</div>
            {optimizeResult.map((t, i) => {
              const [used, max] = t.usedCapacity.replace(" kg", "").split(" / ").map(Number);
              const pct = max > 0 ? (used / max) * 100 : 0;
              return (
                <div key={t.tripNo} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: COLORS[i % COLORS.length] }}>{t.tripNo}</span>
                    <span style={{ fontSize: 11, color: "#8b949e" }}>🚗 {t.carNo} · {t.orderCount} orders</span>
                  </div>
                  {/* weight bar */}
                  <div style={{ height: 6, background: "#21262d", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct > 90 ? "#f85149" : pct > 70 ? "#d29922" : COLORS[i % COLORS.length], borderRadius: 3, transition: "width .5s" }}/>
                  </div>
                  <div style={{ fontSize: 10, color: "#6e7681", marginTop: 3 }}>{used} / {max} กก. ({pct.toFixed(0)}%)</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Status filter tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #21262d", background: "#161b22", flexShrink: 0 }}>
          {[["all","ทั้งหมด"], ["pending","รอส่ง"], ["assigned","จัดรถแล้ว"], ["delivered","ส่งแล้ว"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 500, color: statusFilter === v ? "#3fb950" : "#8b949e", borderBottom: `2px solid ${statusFilter === v ? "#3fb950" : "transparent"}`, transition: "all .15s" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Order list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#484f58", fontSize: 13 }}>ไม่มีออเดอร์</div>
          ) : filtered.map(order => {
            const st      = STATUS[order.status] ?? STATUS.pending;
            const isOpen  = expandOrder === order.orderno;
            return (
              <div key={order.orderno} style={{ borderBottom: "1px solid #21262d" }}>
                <button onClick={() => setExpandOrder(isOpen ? null : order.orderno)}
                  style={{ width: "100%", padding: "11px 14px", background: isOpen ? "#161b22" : "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background .15s" }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#161b22"; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "none"; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, fontWeight: 500, color: "#e6edf3" }}>{order.orderno}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4, display: "flex", gap: 12 }}>
                    <span>👤 {order.customer_name ?? "—"}</span>
                    <span>⚖️ {order.total_weight} กก.</span>
                    <span style={{ color: "#3fb950" }}>฿{fmt(Number(order.total_price))}</span>
                  </div>
                </button>

                {/* expanded items */}
                {isOpen && (
                  <div style={{ padding: "0 14px 12px", background: "#161b22" }}>
                    <div style={{ fontSize: 10, color: "#6e7681", marginBottom: 6 }}>
                      📍 {order.distance_from_store} กม. {order.is_free_delivery ? "· ฟรีค่าส่ง ✅" : "· มีค่าส่ง"}
                      {" · "}{order.customer_phone}
                    </div>
                    {order.items?.map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8b949e", marginBottom: 3 }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{item.prodname} ×{item.quantity}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono'", color: "#e6edf3", flexShrink: 0 }}>฿{fmt(item.price_at_that_time * item.quantity)}</span>
                      </div>
                    ))}
                    <button onClick={() => map.current?.flyTo({ center: [order.delivery_lng, order.delivery_lat], zoom: 15, duration: 800 })}
                      style={{ marginTop: 8, fontSize: 11, color: "#60a5fa", background: "none", border: "1px solid #1f6feb", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
                      📍 ดูบนแผนที่
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Map (right, fullscreen) ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }}/>
      </div>
    </main>
  );
}
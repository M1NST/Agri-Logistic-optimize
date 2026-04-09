"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

const API = process.env.NEXT_PUBLIC_API_URL;
const STORE_LAT = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || "8.1650");
const STORE_LNG = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || "99.6470");
const COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
];

interface OrderStop {
  orderno: string;
  delivery_sequence: number;
  delivery_lat: number;
  delivery_lng: number;
  total_weight: number;
  status: string;
}
interface Trip {
  tripno: string;
  carno: string;
  total_weight: number;
  status: string;
  orders: OrderStop[];
}

export default function DriverTasksPage() {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTrip, setActiveTrip] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [driverName, setDriverName] = useState("");
  const [token, setToken] = useState("");

  const [drawerSize, setDrawerSize] = useState<"collapsed" | "half" | "full">(
    "half",
  );
  const drawerHeights = { collapsed: 56, half: 280, full: 480 };

  // auth
  useEffect(() => {
    const tk = localStorage.getItem("token");
    const usr = localStorage.getItem("user");
    if (!tk || !usr) {
      router.push("/login");
      return;
    }
    const u = JSON.parse(usr);
    if (u.role !== "DRIVER") {
      router.push("/login");
      return;
    }
    setDriverName(u.name);
    setToken(tk);
    fetchTrips(tk);
  }, [router]);

  // initialize map
  useEffect(() => {
    if (map.current || !mapRef.current) return;
    map.current = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [STORE_LNG, STORE_LAT],
      zoom: 11,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    new mapboxgl.Marker({ color: "#22c55e" })
      .setLngLat([STORE_LNG, STORE_LAT])
      .setPopup(
        new mapboxgl.Popup({ closeButton: false }).setHTML(
          `<div style="font-size:12px;font-weight:700;color:#22c55e">🏪 ร้าน</div>`,
        ),
      )
      .addTo(map.current);
  }, []);

  // fetch trips
  const fetchTrips = async (tk: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/trips/my`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const d = await r.json();
      if (d.success) {
        setTrips(d.data);
        if (d.data.length > 0) setActiveTrip(d.data[0].tripno);
      }
    } finally {
      setLoading(false);
    }
  };

  // draw map when active trip changes
  useEffect(() => {
    if (!map.current || !activeTrip) return;
    const trip = trips.find((t) => t.tripno === activeTrip);
    if (!trip) return;

    const draw = async () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      ["route","route-shadow", "route-line"].forEach((id) => {
        if (map.current!.getLayer(id)) map.current!.removeLayer(id);
      });
      if (map.current!.getSource("route")) map.current!.removeSource("route");

      const sorted = [...trip.orders].sort(
        (a, b) => a.delivery_sequence - b.delivery_sequence,
      );
      const valid = sorted.filter((o) => o.delivery_lat && o.delivery_lng);
      if (!valid.length) return;

      const color = COLORS[trips.indexOf(trip) % COLORS.length];

      // markers
      valid.forEach((order) => {
        const isDone = order.status === "delivered";
        const el = document.createElement("div");
        el.style.cssText = `width:36px;height:36px;border-radius:50%;background:${isDone ? "#14532d" : color};border:3px solid ${isDone ? "#22c55e" : "#fff"};color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.6);cursor:pointer;`;
        el.textContent = isDone ? "✓" : String(order.delivery_sequence);

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
          .setHTML(`
          <div style="font-size:12px;line-height:1.8;padding:2px 4px">
            <b style="color:${color}">${order.orderno}</b><br>
            ลำดับที่ <b>${order.delivery_sequence}</b> · ${order.total_weight} กก.<br>
            <span style="color:${isDone ? "#4ade80" : "#fbbf24"}">${isDone ? "✅ ส่งแล้ว" : "⏳ รอส่ง"}</span>
          </div>`);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([
            parseFloat(String(order.delivery_lng)),
            parseFloat(String(order.delivery_lat)),
          ])
          .setPopup(popup)
          .addTo(map.current!);
        markers.current.push(marker);
      });

      // directions route
      const coords = [
        [STORE_LNG, STORE_LAT],
        ...valid.map((o) => [
          parseFloat(String(o.delivery_lng)),
          parseFloat(String(o.delivery_lat)),
        ]),
        [STORE_LNG, STORE_LAT],
      ];
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords
          .map((c) => c.join(","))
          .join(
            ";",
          )}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
        const data = await (await fetch(url)).json();
        if (!data.routes?.[0]) return;

        if (map.current!.getSource("route")) {
          (map.current!.getSource("route") as mapboxgl.GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: data.routes[0].geometry,
          });
        } else {
          map.current!.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: data.routes[0].geometry,
            },
          });

          map.current!.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#3b82f6", 
              "line-width": 5,
            },
          });
        }

        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new mapboxgl.LngLatBounds(
            coords[0] as [number, number],
            coords[0] as [number, number],
          ),
        );
        map.current!.fitBounds(bounds, { padding: 60, duration: 900 });
      } catch (e) {
        console.error("Route error:", e);
      }
    };

    if (map.current.isStyleLoaded()) draw();
    else map.current.once("load", draw);
  }, [activeTrip, trips]);

  // trigger map resize when drawer height changes
  useEffect(() => {
    setTimeout(() => map.current?.resize(), 360);
  }, [drawerSize]);

  // mark order as delivered
  const markDelivered = async (orderNo: string) => {
    setUpdating(orderNo);
    try {
      const r = await fetch(`${API}/orders/${orderNo}/delivered`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const d = await r.json();
      if (d.success) {
        setTrips((prev) =>
          prev.map((t) => ({
            ...t,
            orders: t.orders.map((o) =>
              o.orderno === orderNo ? { ...o, status: "delivered" } : o,
            ),
          })),
        );
      }
    } finally {
      setUpdating(null);
    }
  };

  const activeT = trips.find((t) => t.tripno === activeTrip);
  const sorted = activeT
    ? [...activeT.orders].sort(
        (a, b) => a.delivery_sequence - b.delivery_sequence,
      )
    : [];
  const doneCount = sorted.filter((o) => o.status === "delivered").length;
  const tripColor =
    COLORS[trips.findIndex((t) => t.tripno === activeTrip) % COLORS.length];
  const drawerH = drawerHeights[drawerSize];

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        overflow: "hidden",
        fontFamily: "'DM Sans',sans-serif",
        color: "#f1f5f9",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@500&display=swap"
        rel="stylesheet"
      />

      {/* ── Header ── */}
      <header
        style={{
          height: 50,
          background: "#111827",
          borderBottom: "1px solid #1f2937",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          justifyContent: "space-between",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg,#06b6d4,#3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            🚚
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Driver Tasks</div>
            <div style={{ fontSize: 10, color: "#6b7280" }}>{driverName}</div>
          </div>
        </div>

        {/* trip selector */}
        {trips.length > 1 && (
          <div style={{ display: "flex", gap: 6 }}>
            {trips.map((t, i) => (
              <button
                key={t.tripno}
                onClick={() => setActiveTrip(t.tripno)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 16,
                  border: `1.5px solid ${activeTrip === t.tripno ? COLORS[i % COLORS.length] : "#374151"}`,
                  background:
                    activeTrip === t.tripno
                      ? `${COLORS[i % COLORS.length]}20`
                      : "none",
                  color:
                    activeTrip === t.tripno
                      ? COLORS[i % COLORS.length]
                      : "#9ca3af",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.tripno}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Map — flex fills remaining space above drawer ── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

        {/* trip info overlay */}
        {activeT && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: "rgba(0,0,0,.7)",
              backdropFilter: "blur(8px)",
              borderRadius: 10,
              padding: "10px 14px",
              border: `1px solid ${tripColor}50`,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: "'DM Mono'",
                fontSize: 12,
                color: tripColor,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              {activeT.tripno}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,.7)",
                lineHeight: 1.8,
              }}
            >
              🚗 {activeT.carno} · ⚖️ {activeT.total_weight} กก.
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,.5)",
                marginTop: 2,
              }}
            >
              📦 {doneCount}/{sorted.length} จุด
            </div>
            <div
              style={{
                marginTop: 6,
                height: 3,
                background: "rgba(255,255,255,.1)",
                borderRadius: 2,
              }}
            >
              <div
                style={{
                  width: `${sorted.length > 0 ? (doneCount / sorted.length) * 100 : 0}%`,
                  height: "100%",
                  background:
                    doneCount === sorted.length ? "#22c55e" : tripColor,
                  borderRadius: 2,
                  transition: "width .5s",
                }}
              />
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              ⏳ โหลดเส้นทาง...
            </div>
          </div>
        )}
      </div>

      {/* แยกออกมาต่างหาก ไม่อยู่ใน pointerEvents:none div */}
      <div style={{ position: "absolute", top: 12, right: 14, zIndex: 30 }}>
        <button
          onClick={() => {
            localStorage.clear();
            router.push("/login");
          }}
          style={{
            fontSize: 12,
            color: "#f87171",
            background: "rgba(0,0,0,.6)",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 8,
            padding: "6px 12px",
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          ออกจากระบบ
        </button>
      </div>

      {/* ── Drawer — sits BELOW map, not on top ── */}
      <div
        style={{
          height: drawerH,
          transition: "height .35s ease",
          background: "#111827",
          borderTop: "1px solid #1f2937",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* drawer handle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            height: 44,
            flexShrink: 0,
            cursor: "pointer",
            borderBottom:
              drawerSize !== "collapsed" ? "1px solid #1f2937" : "none",
          }}
          onClick={() =>
            setDrawerSize((s) =>
              s === "collapsed" ? "half" : s === "half" ? "full" : "collapsed",
            )
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 3,
                background: "#374151",
                borderRadius: 2,
              }}
            />
            <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>
              {drawerSize === "collapsed"
                ? `▲ รายการส่ง (${sorted.length} จุด)`
                : drawerSize === "half"
                  ? `▲ ขยาย  ·  ${doneCount}/${sorted.length} เสร็จแล้ว`
                  : `▼ ย่อลง`}
            </span>
          </div>
          {activeT && drawerSize !== "collapsed" && (
            <span
              style={{
                fontSize: 11,
                color: tripColor,
                fontFamily: "'DM Mono'",
              }}
            >
              {activeT.tripno}
            </span>
          )}
        </div>

        {/* order rows */}
        {drawerSize !== "collapsed" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!loading && sorted.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#374151",
                  padding: "32px 0",
                  fontSize: 13,
                }}
              >
                ยังไม่มีรอบจัดส่ง
              </div>
            ) : (
              sorted.map((order) => {
                const isDone = order.status === "delivered";
                const isUpd = updating === order.orderno;
                return (
                  <div
                    key={order.orderno}
                    style={{
                      padding: "11px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      borderBottom: "1px solid #1f2937",
                      background: isDone ? "rgba(5,46,22,.4)" : "transparent",
                      transition: "background .3s",
                    }}
                  >
                    {/* sequence badge */}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: isDone ? "#14532d" : tripColor,
                        border: `2px solid ${isDone ? "#22c55e" : "rgba(255,255,255,.2)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#fff",
                      }}
                    >
                      {isDone ? "✓" : order.delivery_sequence}
                    </div>

                    {/* info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "'DM Mono'",
                          fontSize: 13,
                          fontWeight: 500,
                          color: isDone ? "#4ade80" : "#f1f5f9",
                        }}
                      >
                        {order.orderno}
                      </div>
                      <div
                        style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}
                      >
                        ⚖️ {order.total_weight} กก. &nbsp;·&nbsp;
                        <span style={{ color: isDone ? "#4ade80" : "#fbbf24" }}>
                          {isDone ? "✅ ส่งแล้ว" : "⏳ รอส่ง"}
                        </span>
                      </div>
                    </div>

                    {/* fly to button */}
                    <button
                      onClick={() =>
                        map.current?.flyTo({
                          center: [
                            parseFloat(String(order.delivery_lng)),
                            parseFloat(String(order.delivery_lat)),
                          ],
                          zoom: 15,
                          duration: 700,
                        })
                      }
                      style={{
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "none",
                        border: "1px solid #374151",
                        color: "#9ca3af",
                        fontSize: 11,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      📍
                    </button>

                    {/* delivered button */}
                    {!isDone ? (
                      <button
                        onClick={() => markDelivered(order.orderno)}
                        disabled={isUpd}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 8,
                          background: isUpd ? "#1f2937" : "#166534",
                          color: isUpd ? "#6b7280" : "#4ade80",
                          fontSize: 12,
                          fontWeight: 700,
                          border: `1px solid ${isUpd ? "#374151" : "#22c55e"}`,
                          cursor: isUpd ? "not-allowed" : "pointer",
                          flexShrink: 0,
                          transition: "all .15s",
                        }}
                      >
                        {isUpd ? "⏳" : "✓ ส่งแล้ว"}
                      </button>
                    ) : (
                      <div style={{ fontSize: 20, flexShrink: 0 }}>✅</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <style>{`* { box-sizing:border-box; margin:0; padding:0; } ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1f2937;border-radius:2px}`}</style>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string;

const API       = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
const STORE_LAT = parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || "8.1650");
const STORE_LNG = parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || "99.6600");
const FREE_KM   = parseFloat(process.env.NEXT_PUBLIC_FREE_KM   || "20");

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product  { prodid: string; prodname: string; price: number; weight_per_unit: number; qty: number; prodtypename: string; }
interface CartItem extends Product { quantity: number }
interface Customer { cusid: string; name: string; phone: string; last_lat: number | null; last_lng: number | null; last_orderno: string | null; last_order_date: string | null; is_returning: boolean; }
interface DeliveryInfo { distanceKm: number; isFree: boolean; deliveryFee: number; freeRadiusKm: number; feePerKm: number }

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PosPage() {
  const router  = useRouter();
  const mapRef  = useRef<HTMLDivElement>(null);
  const map     = useRef<mapboxgl.Map | null>(null);
  const pinMark = useRef<mapboxgl.Marker | null>(null);

  const [token,     setToken]     = useState("");
  const [staffName, setStaffName] = useState("");
  const [step,      setStep]      = useState<1 | 2>(1);

  // ── Step 1: Products ─────────────────────────────────────────────────────────
  const [products,    setProducts]    = useState<Product[]>([]);
  const [typeFilter,  setTypeFilter]  = useState("ทั้งหมด");
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [loadingProd, setLoadingProd] = useState(false);

  // ── Step 2: Customer + Map ───────────────────────────────────────────────────
  const [phoneInput,    setPhoneInput]    = useState("");
  const [customer,      setCustomer]      = useState<Customer | null>(null);
  const [lookingUp,     setLookingUp]     = useState(false);
  const [lookupError,   setLookupError]   = useState("");

  // new customer form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newPhone,    setNewPhone]    = useState("");
  const [creating,    setCreating]    = useState(false);

  // map / delivery
  const [pinLat,       setPinLat]       = useState<number | null>(null);
  const [pinLng,       setPinLng]       = useState<number | null>(null);
  const [delivery,     setDelivery]     = useState<DeliveryInfo | null>(null);
  const [checkingDist, setCheckingDist] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [successOrder, setSuccessOrder] = useState<string | null>(null);

  // ── auth ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tk  = localStorage.getItem("token");
    const usr = localStorage.getItem("user");
    if (!tk || !usr) { router.push("/login"); return; }
    const u = JSON.parse(usr);
    if (!["STAFF", "ADMIN"].includes(u.role)) { router.push("/login"); return; }
    setToken(tk);
    setStaffName(u.name);
  }, [router]);

  // ── fetch products ─────────────────────────────────────────────────────────────
  const fetchProducts = () => {
    if (!token) return;
    setLoadingProd(true);
    fetch(`${API}/products`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setProducts(d.data); })
      .finally(() => setLoadingProd(false));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let onlyNumber = e.target.value.replace(/\D/g, "");
    if (onlyNumber.length > 10) {
    onlyNumber = onlyNumber.slice(0, 10);
    }
    setPhoneInput(onlyNumber);};
  useEffect(() => {
    fetchProducts();
  }, [token]);

  // ── init map (only when step 2 mounts) ────────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    if (map.current || !mapRef.current) return;

    setTimeout(() => {
      if (!mapRef.current || map.current) return;
      map.current = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [STORE_LNG, STORE_LAT],
        zoom: 12,
      });
      map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

      // store marker
      new mapboxgl.Marker({ color: "#16a34a" })
        .setLngLat([STORE_LNG, STORE_LAT])
        .setPopup(new mapboxgl.Popup().setHTML("<b>🏪 ร้าน</b>"))
        .addTo(map.current);

      // click to pin
      map.current.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        placePin(lng, lat);
      });
    }, 80);
  }, [step]);

  // ── place pin helper ──────────────────────────────────────────────────────────
  const placePin = (lng: number, lat: number) => {
    setPinLat(lat); setPinLng(lng); setDelivery(null);
    if (pinMark.current) {
      pinMark.current.setLngLat([lng, lat]);
    } else {
      pinMark.current = new mapboxgl.Marker({ color: "#f97316", draggable: true })
        .setLngLat([lng, lat])
        .addTo(map.current!);
      pinMark.current.on("dragend", () => {
        const ll = pinMark.current!.getLngLat();
        setPinLat(ll.lat); setPinLng(ll.lng); setDelivery(null);
      });
    }
  };

  // ── cart helpers ──────────────────────────────────────────────────────────────
  const addToCart = (prod: Product) => {
    setCart(prev => {
      const ex = prev.find(c => c.prodid === prod.prodid);
      if (ex) {
        if (ex.quantity >= prod.qty) return prev;
        return prev.map(c => c.prodid === prod.prodid ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ...prod, quantity: 1 }];
    });
  };
  const setQty = (prodid: string, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.prodid !== prodid)); return; }
    setCart(prev => prev.map(c => c.prodid === prodid ? { ...c, quantity: Math.min(qty, c.qty) } : c));
  };

  const totalWeight = cart.reduce((s, c) => s + c.weight_per_unit * c.quantity, 0);
  const totalPrice  = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  // lookup customer by phone
  const lookupCust = async () => {
    if (!phoneInput.trim()) return;
    setLookingUp(true); setLookupError(""); setCustomer(null); setShowNewForm(false);
    try {
      const r = await fetch(`${API}/customers/lookup?phone=${encodeURIComponent(phoneInput)}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) {
        setCustomer(d.data);
        // auto-pin ถ้าเคยสั่งแล้ว
        if (d.data.last_lat && d.data.last_lng) {
          setTimeout(() => {
            placePin(d.data.last_lng, d.data.last_lat);
            map.current?.flyTo({ center: [d.data.last_lng, d.data.last_lat], zoom: 14, duration: 800 });
          }, 200);
        }
      } else {
        setLookupError("ไม่พบลูกค้า");
        setNewPhone(phoneInput);
      }
    } finally { setLookingUp(false); }
  };

  //create new customer
  const createCust = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Name: newName, Phone: newPhone }),
      });
      const d = await r.json();
      if (d.success) {
        setCustomer({ cusid: d.data.cusid, name: d.data.name, phone: d.data.phone, last_lat: null, last_lng: null, last_orderno: null, last_order_date: null, is_returning: false });
        setShowNewForm(false); setLookupError("");
      } else {
        alert("❌ " + d.message);
      }
    } finally { setCreating(false); }
  };

  // check delivery fee
  const checkDelivery = async () => {
    if (!pinLat || !pinLng) return;
    setCheckingDist(true);
    try {
      const r = await fetch(`${API}/orders/check-delivery-fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: pinLat, lng: pinLng }),
      });
      const d = await r.json();
      if (d.success) setDelivery({ distanceKm: d.distanceKm, isFree: d.isFree, deliveryFee: d.deliveryFee ?? 0, freeRadiusKm: d.freeRadiusKm ?? 20, feePerKm: d.feePerKm ?? 10 });
    } finally { setCheckingDist(false); }
  };

  // submit order
  const submitOrder = async () => {
    if (!customer || cart.length === 0 || !pinLat || !pinLng) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/orders/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          CusID: customer.cusid,
          items: cart.map(c => ({ ProdID: c.prodid, Quantity: c.quantity })),
          lat: pinLat, lng: pinLng,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSuccessOrder(d.data.order.orderno);
        // reset all
        setCart([]); setCustomer(null); setPhoneInput("");
        setPinLat(null); setPinLng(null); setDelivery(null);
        pinMark.current?.remove(); pinMark.current = null;
        map.current?.remove(); map.current = null;
        setStep(1);
        // refetch products to update stock
        fetchProducts();
      } else {
        alert("❌ " + d.message);
      }
    } finally { setSubmitting(false); }
  };

  //derive types and filtered products
  const types         = ["ทั้งหมด", ...Array.from(new Set(products.map(p => p.prodtypename || "อื่นๆ")))];
  const filteredProds = typeFilter === "ทั้งหมด" ? products : products.filter(p => (p.prodtypename || "อื่นๆ") === typeFilter);
  const canSubmit     = !!customer && cart.length > 0 && !!pinLat && !!pinLng && !submitting;

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0d1117", color: "#e6edf3", fontFamily: "'IBM Plex Sans Thai','IBM Plex Sans',sans-serif", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* ── Header ── */}
      <header style={{ height: 50, background: "#161b22", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", padding: "0 20px", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 500, fontSize: 14, color: "#3fb950" }}>🌱 Agri-POS</span>

          {/* Step pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {(["เลือกสินค้า", "พิกัดและยืนยัน"] as const).map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "3px 10px", borderRadius: 20,
                  background: step === i + 1 ? "#238636" : "#21262d",
                  border: `1px solid ${step === i + 1 ? "#3fb950" : "#30363d"}`,
                  transition: "all .2s",
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: step === i + 1 ? "#3fb950" : step > i + 1 ? "#1f6feb" : "#30363d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: step === i + 1 ? "#e6edf3" : "#6e7681" }}>{label}</span>
                </div>
                {i < 1 && <span style={{ color: "#30363d", fontSize: 12 }}>›</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {cart.length > 0 && step === 1 && (
            <span style={{ fontSize: 11, background: "#0d2818", color: "#3fb950", border: "1px solid #238636", borderRadius: 12, padding: "2px 10px" }}>
              🛒 {cart.length} รายการ · ฿{fmt(totalPrice)}
            </span>
          )}
          <span style={{ fontSize: 12, color: "#8b949e" }}>👤 {staffName}</span>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }}
            style={{ fontSize: 12, color: "#f85149", background: "none", border: "none", cursor: "pointer" }}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* ── Success banner ── */}
      {successOrder && (
        <div style={{ background: "#0d4429", borderBottom: "1px solid #238636", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ color: "#3fb950", fontWeight: 600, fontSize: 13 }}>
            ✅ สร้าง Order สำเร็จ: <span style={{ fontFamily: "'IBM Plex Mono'" }}>{successOrder}</span>
          </span>
          <button onClick={() => setSuccessOrder(null)} style={{ color: "#3fb950", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 1 — เลือกสินค้า (full screen)
      ══════════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Type filter tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #21262d", overflowX: "auto", flexShrink: 0, background: "#161b22", padding: "0 16px" }}>
            {types.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", color: typeFilter === t ? "#3fb950" : "#8b949e", borderBottom: `2px solid ${typeFilter === t ? "#3fb950" : "transparent"}`, transition: "all .15s" }}>
                {t}
              </button>
            ))}
          </div>

          {/* Product grid — ใหญ่เต็มจอ */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loadingProd ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#484f58" }}>⏳ กำลังโหลดสินค้า...</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {filteredProds.map(p => {
                  const inCart     = cart.find(c => c.prodid === p.prodid);
                  const outOfStock = p.qty <= 0;
                  return (
                    <div key={p.prodid} onClick={() => !outOfStock && addToCart(p)} 
                      style={{ background: inCart ? "#0d2818" : "#161b22", border: `1px solid ${inCart ? "#238636" : "#21262d"}`, borderRadius: 12, padding: "16px 14px", textAlign: "left", cursor: outOfStock ? "not-allowed" : "pointer", transition: "border-color .15s, background .15s", opacity: outOfStock ? 0.4 : 1 }}
                      onMouseEnter={e => { if (!outOfStock) e.currentTarget.style.borderColor = inCart ? "#3fb950" : "#388bfd"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = inCart ? "#238636" : "#21262d"; }}>

                      <div style={{ fontSize: 14, fontWeight: 500, color: "#e6edf3", lineHeight: 1.4, marginBottom: 10, minHeight: 40 }}>{p.prodname}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 18, fontWeight: 500, color: inCart ? "#3fb950" : "#f0f6fc", marginBottom: 6 }}>฿{fmt(p.price)}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: inCart ? 10 : 0 }}>
                        <span style={{ fontSize: 11, color: "#6e7681" }}>{p.weight_per_unit} กก./ชิ้น</span>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: p.qty > 10 ? "#0d2818" : p.qty > 0 ? "#2d1a00" : "#2d0000", color: p.qty > 10 ? "#3fb950" : p.qty > 0 ? "#d29922" : "#f85149" }}>
                          {outOfStock ? "หมด" : `${p.qty} ชิ้น`}
                        </span>
                      </div>

                      {/* qty controls */}
                      {inCart && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setQty(p.prodid, inCart.quantity - 1)}
                            style={{ width: 30, height: 30, background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <input type="number" value={inCart.quantity} min={1} max={p.qty}
                            onChange={e => setQty(p.prodid, parseInt(e.target.value) || 1)}
                            style={{ width: 44, textAlign: "center", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", fontSize: 14, padding: "4px 0", fontFamily: "'IBM Plex Mono'" }}
                          />
                          <button onClick={() => setQty(p.prodid, inCart.quantity + 1)}
                            style={{ width: 30, height: 30, background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom bar — cart summary + next button */}
          <div style={{ borderTop: "1px solid #30363d", background: "#161b22", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              {cart.length > 0 ? (
                <div style={{ display: "flex", gap: 20 }}>
                  <span style={{ fontSize: 13, color: "#8b949e" }}>
                    {cart.length} รายการ · <span style={{ color: "#e6edf3" }}>{totalWeight.toFixed(1)} กก.</span>
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 16, fontWeight: 600, color: "#3fb950" }}>฿{fmt(totalPrice)}</span>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: "#484f58" }}>ยังไม่ได้เลือกสินค้า</span>
              )}
            </div>
            <button onClick={() => cart.length > 0 && setStep(2)} disabled={cart.length === 0}
              style={{ padding: "10px 28px", borderRadius: 10, border: `1px solid ${cart.length > 0 ? "#3fb950" : "#30363d"}`, background: cart.length > 0 ? "linear-gradient(135deg,#238636,#196127)" : "#21262d", color: cart.length > 0 ? "#fff" : "#484f58", fontWeight: 700, fontSize: 14, cursor: cart.length > 0 ? "pointer" : "not-allowed", transition: "all .2s" }}>
              ถัดไป: ระบุพิกัดส่ง →
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 2 — แผนที่ (ใหญ่) + sidebar ขวา
      ══════════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", overflow: "hidden" }}>

          {/* ── Map (left, fullscreen) ── */}
          <div style={{ position: "relative" }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }}/>

            {/* map hints */}
            <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(22,27,34,.92)", backdropFilter: "blur(4px)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#8b949e", pointerEvents: "none" }}>
              👆 แตะแผนที่เพื่อปักหมุดจุดส่ง · ลากหมุดเพื่อปรับตำแหน่ง
            </div>

            {pinLat && (
              <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(22,27,34,.92)", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#8b949e", fontFamily: "'IBM Plex Mono'" }}>
                📍 {pinLat.toFixed(5)}, {pinLng?.toFixed(5)}
              </div>
            )}

            {/* back button */}
            <button onClick={() => { setStep(1); map.current?.remove(); map.current = null; pinMark.current?.remove(); pinMark.current = null; setPinLat(null); setPinLng(null); setDelivery(null); }}
              style={{ position: "absolute", top: 12, right: 56, background: "rgba(22,27,34,.92)", border: "1px solid #30363d", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "#e6edf3", cursor: "pointer" }}>
              ← กลับแก้สินค้า
            </button>
          </div>

          {/* ── Right sidebar ── */}
          <div style={{ background: "#161b22", borderLeft: "1px solid #30363d", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0" }}>

              {/* ── Customer lookup ── */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#8b949e", fontWeight: 600, letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 8 }}>ข้อมูลลูกค้า</div>

                {!customer ? (
                  <>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input placeholder="กรอกเบอร์โทรลูกค้า"
                        value={phoneInput}
                        onChange={e => {const onlyNums = e.target.value.replace(/\D/g, '');
                          if (onlyNums.length <= 10) {
                            setPhoneInput(onlyNums);
                            setLookupError(""); }}}
                        onKeyDown={e => e.key === "Enter" && lookupCust()}
                        type="tel" maxLength={10}
                        style={{ flex: 1, background: "#0d1117", border: "1px solid #30363d", borderRadius: 7, color: "#e6edf3", padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "'IBM Plex Mono'" }}
                      />
                      <button onClick={lookupCust} disabled={lookingUp || !phoneInput.trim()}
                        style={{ padding: "8px 12px", background: "#238636", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer" }}>
                        {lookingUp ? "⏳" : "🔍"}
                      </button>
                    </div>

                    {/* not found → show create form toggle */}
                    {lookupError && (
                      <div style={{ background: "#2d1a00", border: "1px solid #9e6a03", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: "#d29922", marginBottom: 8 }}>⚠️ {lookupError}</div>
                        {!showNewForm ? (
                          <button onClick={() => { setShowNewForm(true); setNewPhone(phoneInput); }}
                            style={{ fontSize: 12, fontWeight: 600, color: "#3fb950", background: "none", border: "1px solid #238636", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                            + สร้างลูกค้าใหม่
                          </button>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            <input placeholder="ชื่อ-นามสกุล" value={newName} onChange={e => setNewName(e.target.value)}
                              style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 7, color: "#e6edf3", padding: "8px 10px", fontSize: 13, outline: "none" }}
                            />
                            <input placeholder="เบอร์โทร" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                              style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 7, color: "#e6edf3", padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "'IBM Plex Mono'" }}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={createCust} disabled={creating || !newName.trim() || !newPhone.trim()}
                                style={{ flex: 1, padding: "8px 0", background: "#238636", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                {creating ? "⏳ กำลังสร้าง..." : "✓ บันทึกลูกค้า"}
                              </button>
                              <button onClick={() => setShowNewForm(false)}
                                style={{ padding: "8px 12px", background: "none", border: "1px solid #30363d", borderRadius: 7, color: "#8b949e", fontSize: 12, cursor: "pointer" }}>
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* customer found card */
                  <div style={{ background: "#0d2818", border: "1px solid #238636", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#3fb950" }}>{customer.name}</div>
                        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2, fontFamily: "'IBM Plex Mono'" }}>{customer.phone}</div>
                        {customer.is_returning && customer.last_order_date && (
                          <div style={{ fontSize: 11, color: "#6e7681", marginTop: 4 }}>
                            🔄 ลูกค้าเก่า · สั่งล่าสุด {new Date(customer.last_order_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                            {customer.last_lat && <span style={{ color: "#3fb950" }}> · auto-pin ✓</span>}
                          </div>
                        )}
                        {!customer.is_returning && (
                          <div style={{ fontSize: 11, color: "#d29922", marginTop: 4 }}>✨ ลูกค้าใหม่</div>
                        )}
                      </div>
                      <button onClick={() => { setCustomer(null); setPhoneInput(""); setLookupError(""); }}
                        style={{ fontSize: 11, color: "#8b949e", background: "none", border: "1px solid #30363d", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                        เปลี่ยน
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Delivery fee check ── */}
              {pinLat && !delivery && (
                <button onClick={checkDelivery} disabled={checkingDist}
                  style={{ width: "100%", padding: "9px 0", background: "#21262d", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3", fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 12 }}>
                  {checkingDist ? "⏳ กำลังคำนวณ..." : "📐 คำนวณระยะทาง"}
                </button>
              )}

              {delivery && (
                <div style={{ borderRadius: 10, padding: "11px 14px", marginBottom: 12, background: delivery.isFree ? "#0d2818" : "#1a1200", border: `1px solid ${delivery.isFree ? "#238636" : "#9e6a03"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: delivery.isFree ? "#3fb950" : "#d29922" }}>
                        {delivery.isFree ? "ฟรีค่าจัดส่ง 🎉" : `ค่าจัดส่ง ฿${fmt(delivery.deliveryFee)}`}
                      </div>
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 3, fontFamily: "'IBM Plex Mono'", lineHeight: 1.7 }}>
                        {delivery.distanceKm} กม. จากร้าน
                        {!delivery.isFree && ` · เกิน ${(delivery.distanceKm - delivery.freeRadiusKm).toFixed(1)} กม. × ฿${delivery.feePerKm}`}
                      </div>
                    </div>
                    <button onClick={() => { setPinLat(null); setPinLng(null); setDelivery(null); pinMark.current?.remove(); pinMark.current = null; }}
                      style={{ fontSize: 11, color: "#8b949e", background: "none", border: "1px solid #30363d", borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>
                      ปักใหม่
                    </button>
                  </div>
                </div>
              )}

              {/* ── Cart summary ── */}
              <div style={{ background: "#0d1117", borderRadius: 10, padding: "12px 14px", border: "1px solid #21262d", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#8b949e", fontWeight: 600, letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 8 }}>รายการสินค้า</div>
                {cart.map(c => (
                  <div key={c.prodid} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: "#8b949e" }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{c.prodname} ×{c.quantity}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono'", color: "#e6edf3", flexShrink: 0 }}>฿{fmt(c.price * c.quantity)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #21262d", marginTop: 8, paddingTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "#8b949e" }}>น้ำหนักรวม</span>
                    <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: "#e6edf3" }}>{totalWeight.toFixed(1)} กก.</span>
                  </div>
                  {delivery && !delivery.isFree && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: "#d29922" }}>ค่าจัดส่ง</span>
                      <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: "#d29922" }}>+฿{fmt(delivery.deliveryFee)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #30363d", marginTop: 6, paddingTop: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>ยอดสุทธิ</span>
                    <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 16, fontWeight: 600, color: "#3fb950" }}>
                      ฿{fmt(totalPrice + (delivery?.deliveryFee ?? 0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Confirm button (sticky bottom) ── */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #30363d", flexShrink: 0 }}>
              {!customer && <div style={{ fontSize: 11, color: "#484f58", textAlign: "center", marginBottom: 8 }}>กรอกเบอร์ลูกค้าก่อนยืนยัน</div>}
              {!pinLat    && <div style={{ fontSize: 11, color: "#484f58", textAlign: "center", marginBottom: 8 }}>ปักหมุดบนแผนที่ก่อนยืนยัน</div>}
              <button onClick={submitOrder} disabled={!canSubmit}
                style={{ width: "100%", padding: "14px 0", borderRadius: 11, border: `1px solid ${canSubmit ? "#3fb950" : "#30363d"}`, background: canSubmit ? "linear-gradient(135deg,#238636,#196127)" : "#21262d", color: canSubmit ? "#fff" : "#484f58", fontWeight: 700, fontSize: 15, cursor: canSubmit ? "pointer" : "not-allowed", transition: "all .2s" }}>
                {submitting ? "⏳ กำลังสร้างออเดอร์..." : "✅ ยืนยันสร้างออเดอร์"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`* { box-sizing:border-box; margin:0; padding:0; } ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px} input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}`}</style>
    </div>
  );
}
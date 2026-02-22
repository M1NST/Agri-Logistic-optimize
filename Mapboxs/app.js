"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mapbox_gl_1 = require("mapbox-gl");
// 1. ใส่ Access Token ของคุณ
mapbox_gl_1.default.accessToken = 'pk.eyJ1IjoibTFuc3QiLCJhIjoiY21sbzIwaTliMGUyZzNnc2FzODYzMHF1dyJ9.NRj-SAEm77aERzWGemGk7Q';
// 2. สร้าง Instance ของแผนที่
var map = new mapbox_gl_1.default.Map({
    container: 'map', // ID ของ div ใน HTML
    style: 'mapbox://styles/mapbox/streets-v12', // สไตล์แผนที่ (เปลี่ยนเป็น satellite-v9 ได้ถ้าจะดูพื้นที่เกษตร)
    center: [100.5018, 13.7563], // [Lon, Lat] เริ่มต้นที่กรุงเทพฯ
    zoom: 9
});
// เก็บรายการพิกัดสวนเกษตร (เพื่อนำไปใช้ใน Optimization Algo ต่อไป)
var gardenPoints = [];
// 3. ฟังก์ชันคลิกเพื่อเพิ่มจุดส่งสินค้า
map.on('click', function (e) {
    var coords = e.lngLat;
    gardenPoints.push(coords);
    // สร้าง Marker บนแผนที่
    new mapbox_gl_1.default.Marker({ color: '#27ae60' }) // สีเขียวเกษตร
        .setLngLat(coords)
        .setPopup(new mapbox_gl_1.default.Popup().setHTML("\u0E08\u0E38\u0E14\u0E2A\u0E48\u0E07\u0E17\u0E35\u0E48 ".concat(gardenPoints.length)))
        .addTo(map);
    console.log('รายการพิกัดปัจจุบัน:', gardenPoints.map(function (p) { return "Lon: ".concat(p.lng, ", Lat: ").concat(p.lat); }));
});

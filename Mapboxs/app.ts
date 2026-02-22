import mapboxgl from 'mapbox-gl';

// 1. ใส่ Access Token ของคุณ
mapboxgl.accessToken = 'pk.eyJ1IjoibTFuc3QiLCJhIjoiY21sbzIwaTliMGUyZzNnc2FzODYzMHF1dyJ9.NRj-SAEm77aERzWGemGk7Q';

// 2. สร้าง Instance ของแผนที่
const map = new mapboxgl.Map({
    container: 'map', // ID ของ div ใน HTML
    style: 'mapbox://styles/mapbox/streets-v12', // สไตล์แผนที่ (เปลี่ยนเป็น satellite-v9 ได้ถ้าจะดูพื้นที่เกษตร)
    center: [100.5018, 13.7563], // [Lon, Lat] เริ่มต้นที่กรุงเทพฯ
    zoom: 9
});

// เก็บรายการพิกัดสวนเกษตร (เพื่อนำไปใช้ใน Optimization Algo ต่อไป)
let gardenPoints: mapboxgl.LngLat[] = [];

// 3. ฟังก์ชันคลิกเพื่อเพิ่มจุดส่งสินค้า
map.on('click', (e) => {
    const coords = e.lngLat;
    gardenPoints.push(coords);

    // สร้าง Marker บนแผนที่
    new mapboxgl.Marker({ color: '#27ae60' }) // สีเขียวเกษตร
        .setLngLat(coords)
        .setPopup(new mapboxgl.Popup().setHTML(`จุดส่งที่ ${gardenPoints.length}`))
        .addTo(map);

    console.log('รายการพิกัดปัจจุบัน:', gardenPoints.map(p => `Lon: ${p.lng}, Lat: ${p.lat}`));
});
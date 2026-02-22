// เก็บ Instance ของแผนที่ไว้ในตัวแปร
var map;
// ฟังก์ชันเริ่มต้นสร้างแผนที่
function initMap() {
    map = new longdo.Map({
        placeholder: document.getElementById('map')
    });
    // ตั้งค่าเริ่มต้นให้แผนที่ไปที่กรุงเทพฯ
    map.location({ lon: 100.5018, lat: 13.7563 }, true);
}
// ฟังก์ชันค้นหาสถานที่
function handleSearch() {
    var searchBox = document.getElementById('searchBox');
    if (searchBox.value) {
        map.Search.search(searchBox.value);
    }
}
// ฟังก์ชันคำนวณเส้นทาง
function handleRouting() {
    map.Route.clear();
    // จุด A (สยาม)
    map.Route.add(new longdo.Marker({ lon: 100.5348, lat: 13.7461 }, { title: 'Start' }));
    // จุด B (ทองหล่อ)
    map.Route.add({ lon: 100.5852, lat: 13.7262 });
    map.Route.search();
    // ดึงระยะทางออกมาแสดง
    setTimeout(function () {
        var dist = map.Route.distance();
        alert("\u0E23\u0E30\u0E22\u0E30\u0E17\u0E32\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14: ".concat((dist / 1000).toFixed(2), " \u0E01\u0E21."));
    }, 1000);
}
// เรียกให้ทำงานเมื่อโหลดหน้าเว็บ
window.onload = initMap;

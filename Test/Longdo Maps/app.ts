// บอก TypeScript ว่ามีตัวแปร global ชื่อ longdo
declare const longdo: any;

// เก็บ Instance ของแผนที่ไว้ในตัวแปร
let map: any;

// ฟังก์ชันเริ่มต้นสร้างแผนที่
function initMap(): void {
    map = new longdo.Map({
        placeholder: document.getElementById('map')
    });

    // ตั้งค่าเริ่มต้นให้แผนที่ไปที่กรุงเทพฯ
    map.location({ lon: 100.5018, lat: 13.7563 }, true);
}

// ฟังก์ชันค้นหาสถานที่
function handleSearch(): void {
    const searchBox = document.getElementById('searchBox') as HTMLInputElement;
    if (searchBox.value) {
        map.Search.search(searchBox.value);
    }
}


// เรียกให้ทำงานเมื่อโหลดหน้าเว็บ
window.onload = initMap;
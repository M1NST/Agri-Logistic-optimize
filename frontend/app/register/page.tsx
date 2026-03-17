"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    Name: "",
    Phone: "",
    Password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        alert("ลงทะเบียนสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ");
        router.push("/login");
      } else {
        setError(data.message || "ไม่สามารถลงทะเบียนได้");
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-10 shadow-xl border border-gray-100">
        <div className="text-center">
          <h1 className="text-3xl font-black text-green-700">สมัครสมาชิกใหม่</h1>
          <p className="mt-2 text-sm text-gray-500 font-medium">สำหรับลูกค้าทั่วไป (Customer Only)</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-100">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>

          <div>
            <label className="block text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</label>
            <input required type="text" placeholder="ชื่อจริง - นามสกุลจริง"
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-green-500"
              value={formData.Name} onChange={(e) => setFormData({...formData, Name: e.target.value})} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">เบอร์โทรศัพท์</label>
            <input required type="text" placeholder="08XXXXXXXX"
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-green-500"
              value={formData.Phone} onChange={(e) => setFormData({...formData, Phone: e.target.value})} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">รหัสผ่าน</label>
            <input required type="password" placeholder="ระบุรหัสผ่านของคุณ"
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-green-500"
              value={formData.Password} onChange={(e) => setFormData({...formData, Password: e.target.value})} />
          </div>

          <button type="submit" disabled={isLoading}
            className={`w-full rounded-xl py-3 font-bold text-white shadow-md transition-all 
              ${isLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700 hover:scale-[1.02]"}`}
          >
            {isLoading ? "กำลังประมวลผล..." : "สมัครสมาชิก"}
          </button>

          <p className="text-center text-sm text-gray-600">
            เป็นสมาชิกอยู่แล้ว? <a href="/login" className="font-bold text-green-600 hover:underline">เข้าสู่ระบบ</a>
          </p>
        </form>
      </div>
    </div>
  );
}
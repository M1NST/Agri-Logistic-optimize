import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ success: false, message: "กรุณากรอกเบอร์โทรศัพท์และรหัสผ่าน" });
    }

    const query = `
      SELECT u.*, r.RoleName
      FROM users u
      JOIN roles r ON u.RoleID = r.RoleID
      WHERE u.Phone = $1
    `;
    const result = await pool.query(query, [phone]);

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({
          success: false,
          message: "ไม่พบเบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง",
        });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({
          success: false,
          message: "เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง",
        });
    }

    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");

    const token = jwt.sign(
      {
        userId: user.userid,
        role: user.roleid,
        name: user.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.userid,
        name: user.name,
        role: user.roleid,
        roleName: user.rolename,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์",
      error: error.message,
    });
  }
};

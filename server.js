import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* ==============================
   기본 설정
============================== */

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: "https://naebu-frontend.onrender.com",
    credentials: true,
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// admin 폴더 정적 제공
app.use(express.static(path.join(__dirname, "public")));

/* ==============================
   Supabase 연결
============================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ==============================
   관리자 로그인
============================== */

app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    res.cookie("admin", "true", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    return res.json({ ok: true });
  }

  res.json({ ok: false });
});

/* 로그인 상태 확인 */
app.get("/admin/check", (req, res) => {
  if (req.cookies.admin === "true") {
    return res.json({ ok: true });
  }
  res.json({ ok: false });
});

/* 로그아웃 */
app.post("/admin/logout", (req, res) => {
  res.clearCookie("admin", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ ok: true });
});

/* ==============================
   문의 등록 (홈페이지)
============================== */

app.post("/estimate", async (req, res) => {
  try {
    const { name, phone, budget, space, message } = req.body;

    const { error } = await supabase.from("estimates").insert([
      {
        name,
        phone,
        budget,
        space,
        message,
        status: "대기",
        memo: "",
      },
    ]);

    if (error) {
      console.error("Insert Error:", error);
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ ok: false });
  }
});

/* ==============================
   관리자 - 문의 목록 조회
============================== */

app.get("/estimates", async (req, res) => {
  try {
    if (req.cookies.admin !== "true") {
      return res.status(401).json({ ok: false });
    }

    const { data, error } = await supabase
      .from("estimates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch Error:", error);
      return res.status(500).json({ ok: false });
    }

    res.json(data);
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ ok: false });
  }
});

/* ==============================
   관리자 - 상태 / 메모 수정
============================== */

app.put("/estimates/:id", async (req, res) => {
  try {
    if (req.cookies.admin !== "true") {
      return res.status(401).json({ ok: false });
    }

    const { id } = req.params;
    const { status, memo } = req.body;

    const { error } = await supabase
      .from("estimates")
      .update({ status, memo })
      .eq("id", id);

    if (error) {
      console.error("Update Error:", error);
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ ok: false });
  }
});

// 견적 삭제
app.delete("/estimates/:id", async (req, res) => {
  try {
    if (req.cookies.admin !== "true") {
      return res.status(401).json({ ok: false });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from("estimates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete Error:", error);
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ ok: false });
  }
});

app.get("/admin/export", async (req, res) => {
  try {
    if (req.cookies.admin !== "true") {
      return res.status(401).json({ ok: false });
    }

    const { data, error } = await supabase
      .from("estimates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("견적목록");

    worksheet.columns = [
      { header: "이름", key: "name", width: 15 },
      { header: "전화번호", key: "phone", width: 20 },
      { header: "예산", key: "budget", width: 15 },
      { header: "공간", key: "space", width: 20 },
      { header: "내용", key: "message", width: 30 },
      { header: "상태", key: "status", width: 15 },
      { header: "메모", key: "memo", width: 30 },
      { header: "등록일", key: "created_at", width: 20 },
    ];

    data.forEach(item => {
      worksheet.addRow(item);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=estimates.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});


/* ==============================
   서버 시작
============================== */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

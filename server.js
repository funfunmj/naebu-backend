import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

// ⭐ ESM에서 __dirname 만들기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Supabase 연결
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// ✅ 정적 파일 설정 (public 폴더)
// =========================
app.use(express.static(path.join(__dirname, "public")));

// ✅ /admin 라우트 추가
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// =========================
// ✅ 테스트용
// =========================
app.get("/", (req, res) => {
  res.send("Server OK");
});

// =========================
// ✅ 문의 저장 API
// =========================
app.post("/estimate", async (req, res) => {
  const { name, phone, budget, space, message } = req.body;

  console.log("문의 수신:", req.body);

  const { data, error } = await supabase
    .from("estimates")
    .insert([
      {
        name,
        phone,
        budget,
        space,
        message,
      },
    ]);

  console.log("SUPABASE DATA:", data);
  console.log("SUPABASE ERROR:", error);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  res.json({ success: true });
});

// =========================
// ✅ 관리자 로그인 API
// =========================

const ADMIN_PASSWORD = "naebu2026"; // ← 여기 원하는 비번으로 바꿔

app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }

  res.status(401).json({ success: false });
});

// =========================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

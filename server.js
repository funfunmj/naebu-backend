import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// Supabase 연결
// ==============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==============================
// 관리자 비밀번호
// ==============================
const ADMIN_PASSWORD = "1234";

// ==============================
// 관리자 로그인
// ==============================
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }

  res.status(401).json({ ok: false });
});

// ==============================
// 문의 등록
// ==============================
app.post("/estimate", async (req, res) => {
  const { name, phone, budget, space, message } = req.body;

  const { error } = await supabase
    .from("estimates")
    .insert([
      {
        name,
        phone,
        budget,
        space,
        message,
        status: "대기",
        memo: ""
      }
    ]);

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

// ==============================
// 문의 전체 조회 (관리자용)
// ==============================
app.get("/estimates", async (req, res) => {
  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }

  res.json(data);
});

// ==============================
// 상태 변경
// ==============================
app.post("/estimate/status", async (req, res) => {
  const { id, status } = req.body;

  const { error } = await supabase
    .from("estimates")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

// ==============================
// 메모 저장
// ==============================
app.post("/estimate/memo", async (req, res) => {
  const { id, memo } = req.body;

  const { error } = await supabase
    .from("estimates")
    .update({ memo })
    .eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

// ==============================
// 관리자 페이지 정적 제공
// ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/admin", express.static(path.join(__dirname, "public")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ==============================
// 기본 확인용
// ==============================
app.get("/", (req, res) => {
  res.send("Server OK");
});

// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

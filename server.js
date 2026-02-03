import express from "express";
import cors from "cors";

const app = express();

/* ==================================================
   1️⃣ CORS 설정 (가장 중요)
================================================== */
app.use(cors({
  origin: "https://naebu-frontend.vercel.app",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
}));

// preflight 요청 대응
app.options("*", cors());

/* ==================================================
   2️⃣ 기본 미들웨어
================================================== */
app.use(express.json());

/* ==================================================
   3️⃣ 테스트용 루트 (서버 살아있는지 확인용)
================================================== */
app.get("/", (req, res) => {
  res.send("NAEBU BACKEND OK");
});

/* ==================================================
   4️⃣ 문의 폼 저장 (index → server)
================================================== */
app.post("/estimate", (req, res) => {
  const { name, phone, budget, space, message } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ ok: false, message: "필수값 누락" });
  }

  console.log("문의 수신:", {
    name,
    phone,
    budget,
    space,
    message
  });

  res.json({ ok: true });
});

/* ==================================================
   5️⃣ 서버 실행
================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

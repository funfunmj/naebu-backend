import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase 연결
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ 테스트용
app.get("/", (req, res) => {
  res.send("Server OK");
});

// ✅ 문의 저장 API
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

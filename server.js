import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;

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

app.use(express.static(path.join(__dirname, "public")));

/* ==============================
   Supabase 연결
============================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ==============================
   관리자 인증
============================== */

function verifyAdmin(req, res, next) {

  const token = req.cookies.admin_token;

  if (!token) {
    return res.status(401).json({ ok:false });
  }

  try {

    jwt.verify(token, JWT_SECRET);

    next();

  } catch {

    return res.status(401).json({ ok:false });

  }

}

/* ==============================
   문의 스팸 방지
============================== */

const estimateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
});

/* ==============================
   관리자 로그인
============================== */

app.post("/admin/login", (req, res) => {

  const { password } = req.body;

  console.log("입력비번:", password);
  console.log("ENV비번:", process.env.ADMIN_PASSWORD);

  if(password === process.env.ADMIN_PASSWORD){

    const token = jwt.sign(
      { role:"admin" },
      JWT_SECRET,
      { expiresIn:"12h" }
    );

    res.cookie("admin_token", token, {
      httpOnly:true,
      secure:true,
      sameSite:"none"
    });

    return res.json({ok:true});
  }

  res.json({ok:false});

});

/* ==============================
   로그인 상태 확인
============================== */

app.get("/admin/check", (req, res) => {

  const token = req.cookies.admin_token;

  if (!token) {
    return res.json({ ok:false });
  }

  try {

    jwt.verify(token, JWT_SECRET);

    res.json({ ok:true });

  } catch {

    res.json({ ok:false });

  }

});

/* ==============================
   로그아웃
============================== */

app.post("/admin/logout", (req, res) => {

  res.clearCookie("admin_token", {
    httpOnly:true,
    secure:true,
    sameSite:"none"
  });

  res.json({ ok:true });

});

/* ==============================
   문의 등록 (홈페이지)
============================== */

app.post("/estimate", estimateLimiter, async (req, res) => {

  try {

    const { name, phone, budget, space, message } = req.body;

    const { error } = await supabase.from("estimates").insert([
      {
        name,
        phone,
        budget,
        space,
        message,
        status:"대기",
        memo:""
      }
    ]);

    if (error) {
      console.error("Insert Error:", error);
      return res.status(500).json({ ok:false });
    }

    /* 텔레그램 알림 */

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {

      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify({

        chat_id:process.env.TELEGRAM_CHAT_ID,

        text:`📩 신규 문의 도착

이름: ${name}
전화: ${phone}
예산: ${budget}
공간: ${space}

문의내용
${message}`

      })

    });

    res.json({ ok:true });

  } catch(err){

    console.error("Server Error:", err);

    res.status(500).json({ ok:false });

  }

});

/* ==============================
   관리자 - 문의 목록
============================== */

app.get("/estimates", verifyAdmin, async (req,res)=>{

  try{

    const { status } = req.query;

    let query = supabase
      .from("estimates")
      .select("*")
      .order("created_at",{ ascending:false });

    if(status){
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if(error){
      return res.status(500).json({ ok:false });
    }

    res.json(data);

  }catch(err){
    res.status(500).json({ ok:false });
  }

});
/* ==============================
   관리자 - 상태 수정
============================== */

app.put("/estimates/:id", verifyAdmin, async (req,res)=>{

  try{

    const { id } = req.params;
    const { status, memo } = req.body;

    // 기존 데이터 가져오기 (변경 전 상태 확인용)
    const { data: beforeData } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("estimates")
      .update({ status, memo })
      .eq("id", id);

    if(error){
      console.error(error);
      return res.status(500).json({ ok:false });
    }

    // 상태가 바뀐 경우만 알림
    if(beforeData && beforeData.status !== status){

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {

        method:"POST",
        headers:{ "Content-Type":"application/json" },

        body:JSON.stringify({
          chat_id:process.env.TELEGRAM_CHAT_ID,
          text:`📌 문의 상태 변경

이름: ${beforeData.name}
전화: ${beforeData.phone}

이전 상태: ${beforeData.status}
현재 상태: ${status}

메모:
${memo || "-"}`
        })

      });

    }

    res.json({ ok:true });

  }catch(err){

    console.error(err);
    res.status(500).json({ ok:false });

  }

});

/* ==============================
   관리자 - 문의 삭제
============================== */

app.delete("/estimates/:id", verifyAdmin, async (req,res)=>{

  try{

    const { id } = req.params;

    const { error } = await supabase
      .from("estimates")
      .delete()
      .eq("id", id);

    if(error){

      console.error(error);

      return res.status(500).json({ ok:false });

    }

    res.json({ ok:true });

  }catch(err){

    console.error(err);

    res.status(500).json({ ok:false });

  }

});

/* ==============================
   관리자 - 엑셀 다운로드
============================== */

app.get("/admin/export", verifyAdmin, async (req,res)=>{

  try{

    const { data, error } = await supabase
      .from("estimates")
      .select("*")
      .order("created_at",{ ascending:false });

    if(error){

      console.error(error);

      return res.status(500).json({ ok:false });

    }

    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("견적목록");

    worksheet.columns = [

      { header:"이름", key:"name", width:15 },
      { header:"전화번호", key:"phone", width:20 },
      { header:"예산", key:"budget", width:15 },
      { header:"공간", key:"space", width:20 },
      { header:"내용", key:"message", width:30 },
      { header:"상태", key:"status", width:15 },
      { header:"메모", key:"memo", width:30 },
      { header:"등록일", key:"created_at", width:20 }

    ];

    data.forEach(item=>{

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

  }catch(err){

    console.error(err);

    res.status(500).json({ ok:false });

  }

});

/* 🔽🔥 여기 추가 (정확한 위치) */
app.post("/track/blog-click", async (req, res) => {
  try {
    const { error } = await supabase
      .from("click_logs")
      .insert([
        {
          type: "blog"
        }
      ]);

    if (error) {
      console.error("❌ insert error:", error);
      return res.status(500).json({ error });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ server error:", err);
    res.status(500).json({ error: "fail" });
  }
});
/* 🔼🔥 여기까지 */

/* ==============================
   서버 핑 (DB 깨우기)
============================== */

app.get("/ping", async (req,res)=>{

  try{

    const { error } = await supabase
      .from("estimates")
      .select("id")
      .limit(1);

    if(error){

      return res.status(500).send("db error");

    }

    res.send("ok");

  }catch{

    res.status(500).send("server error");

  }

});

/* ==============================
   서버 시작
============================== */

app.listen(PORT, ()=>{

  console.log(`Server running on port ${PORT}`);

});
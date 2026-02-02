require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===================== BASIC CONFIG ===================== */

// 관리자 비밀번호 (env 없으면 1234)
const ADMIN_PW = process.env.ADMIN_PW || '1234';

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===================== MIDDLEWARE ===================== */

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://naebu-frontend-p9tn.vercel.app'
  ],
  credentials: true
}));

app.use(express.json());

app.use(session({
  name: 'naebu-admin',
  secret: process.env.SESSION_SECRET || 'naebu-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // Render HTTPS
    sameSite: 'none'
  }
}));

/* ===================== AUTH ===================== */

function checkAdmin(req, res, next) {
  if (req.session.admin === true) return next();
  return res.status(401).json({ ok: false, message: 'unauthorized' });
}

app.post('/admin/login', (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PW) {
    req.session.admin = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ ok: false });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/admin/check', (req, res) => {
  res.json({ ok: req.session.admin === true });
});

/* ===================== ESTIMATE (문의폼) ===================== */

/**
 * [홈페이지]
 * 문의 등록
 * name
 * phone
 * budget (예상금액)
 * space (주거 / 상가 / 사무실)
 * message
 */
app.post('/estimate', async (req, res) => {
  const { name, phone, budget, space, message } = req.body;

  const { error } = await supabase
    .from('estimates')
    .insert({
      name,
      phone,
      budget,
      space,
      message,
      status: '대기',
      memo: '',
      read: false
    });

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

/**
 * [관리자]
 * 문의 목록
 */
app.get('/estimates', checkAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false });
  }

  res.json(data);
});

/**
 * 상태 변경
 */
app.post('/estimate/status', checkAdmin, async (req, res) => {
  const { id, status } = req.body;

  await supabase
    .from('estimates')
    .update({ status })
    .eq('id', id);

  res.json({ ok: true });
});

/**
 * 메모 저장
 */
app.post('/estimate/memo', checkAdmin, async (req, res) => {
  const { id, memo } = req.body;

  await supabase
    .from('estimates')
    .update({ memo })
    .eq('id', id);

  res.json({ ok: true });
});

/**
 * 읽음 처리
 */
app.post('/estimate/read', checkAdmin, async (req, res) => {
  const { id } = req.body;

  await supabase
    .from('estimates')
    .update({ read: true })
    .eq('id', id);

  res.json({ ok: true });
});

/* ===================== START ===================== */

app.listen(PORT, () => {
  console.log('🚀 Server running on', PORT);
  console.log('🔐 ADMIN_PW:', ADMIN_PW);
});

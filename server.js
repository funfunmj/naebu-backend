require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const cors = require('cors');

// Cloudinary
const cloudinary = require('cloudinary').v2;
// Supabase
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = process.env.PORT || 3000;

// 관리자 비밀번호
const ADMIN_PW = process.env.ADMIN_PW || '1234';

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET','POST'],
}));

// 세션
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(express.json());

// 정적 파일
app.use(express.static(path.join(__dirname, 'public')));

// Multer (메모리 저장)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// 인증 미들웨어
function checkAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).send({ ok: false, message: 'No auth' });
}

// ----------------- 관리자 로그인 -----------------
app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PW) {
    req.session.admin = true;
    return res.send({ ok: true });
  }
  res.status(401).send({ ok: false });
});

app.get('/admin/check', (req, res) => {
  res.send({ ok: !!req.session.admin });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send({ ok: false });
    res.send({ ok: true });
  });
});

// ----------------- 관리자 페이지 열기 -----------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ----------------- 업로드 -----------------
app.post('/upload', checkAdmin, upload.array('image'), async (req, res) => {
  try {
    const urls = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        { folder: 'naebu' }
      );
      urls.push(result.secure_url);
    }
    res.send({ filenames: urls });
  } catch (err) {
    console.error(err);
    res.status(500).send({ ok: false, message: 'Cloudinary upload failed' });
  }
});

// ----------------- 문의 관리 -----------------
app.get('/estimates', checkAdmin, async (req, res) => {
  const { data } = await supabase
    .from('estimates')
    .select('*')
    .order('created_at', { ascending: false });

  res.send(data);
});

app.post('/estimate', async (req, res) => {
  const { error } = await supabase.from('estimates').insert({
    name: req.body.name,
    phone: req.body.phone,
    space: req.body.space,
    message: req.body.message || '',
    status: '대기',
    read: 0,
    memo: ''
  });

  if (error) {
    console.error(error);
    return res.status(500).send({ ok: false });
  }

  res.send({ ok: true });
});

app.post('/estimate/read', checkAdmin, async (req, res) => {
  await supabase
    .from('estimates')
    .update({ read: 1 })
    .eq('id', req.body.id);
  res.send({ ok: true });
});

app.post('/estimate/memo', checkAdmin, async (req, res) => {
  await supabase
    .from('estimates')
    .update({ memo: req.body.memo })
    .eq('id', req.body.id);
  res.send({ ok: true });
});

app.post('/estimate/status', checkAdmin, async (req, res) => {
  await supabase
    .from('estimates')
    .update({ status: req.body.status })
    .eq('id', req.body.id);
  res.send({ ok: true });
});

app.delete('/estimate/:id', checkAdmin, async (req, res) => {
  await supabase
    .from('estimates')
    .delete()
    .eq('id', req.params.id);
  res.send({ ok: true });
});

// ----------------- 콘텐츠 (회사소개/슬라이드/포트폴리오) -----------------
let CONTENT = {
  intro: '',
  slides: [],
  portfolioImages: []
};

app.get('/content', checkAdmin, (req, res) => {
  res.send(CONTENT);
});

app.post('/content', checkAdmin, (req, res) => {
  const { intro, slides, portfolioImages } = req.body;
  CONTENT = { intro, slides, portfolioImages };
  res.send({ ok: true });
});

// ----------------- 서버 실행 -----------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

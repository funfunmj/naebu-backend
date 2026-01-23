require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const cors = require('cors');

const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= ENV ================= */
const ADMIN_PW = process.env.ADMIN_PW || '1234';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    'https://naebu-backend.onrender.com',
    'https://naebu-frontend.vercel.app'
  ],
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // Render는 HTTPS
    sameSite: 'none'   // cross-site 필수
  }
}));

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ================= MULTER (MEMORY) ================= */
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif/.test(file.mimetype);
    cb(ok ? null : new Error('Only images'), ok);
  }
});

/* ================= AUTH ================= */
function checkAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).send({ ok: false });
}

/* ================= ADMIN ================= */
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
  req.session.destroy(() => res.send({ ok: true }));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ================= CONTENT ================= */
app.get('/content', async (req, res) => {
  const { data } = await supabase
    .from('content')
    .select('*')
    .eq('id', 1)
    .single();

  res.send({
    intro: data?.intro || '',
    slides: data?.slides || [],
    portfolioImages: data?.portfolio || []
  });
});

app.post('/content', checkAdmin, async (req, res) => {
  const { intro, slides, portfolioImages } = req.body;

  await supabase
    .from('content')
    .update({
      intro,
      slides,
      portfolio: portfolioImages
    })
    .eq('id', 1);

  res.send({ ok: true });
});

/* ================= UPLOAD (CLOUDINARY) ================= */
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

    res.send({ ok: true, urls });
  } catch (e) {
    console.error(e);
    res.status(500).send({ ok: false });
  }
});

/* ================= ESTIMATE ================= */
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

  if (error) return res.status(500).send({ ok: false });
  res.send({ ok: true });
});

app.get('/estimates', checkAdmin, async (req, res) => {
  const { data } = await supabase
    .from('estimates')
    .select('*')
    .order('created_at', { ascending: false });

  res.send(data);
});

app.post('/estimate/read', checkAdmin, async (req, res) => {
  await supabase.from('estimates').update({ read: 1 }).eq('id', req.body.id);
  res.send({ ok: true });
});

app.post('/estimate/memo', checkAdmin, async (req, res) => {
  await supabase.from('estimates').update({ memo: req.body.memo }).eq('id', req.body.id);
  res.send({ ok: true });
});

app.post('/estimate/status', checkAdmin, async (req, res) => {
  await supabase.from('estimates').update({ status: req.body.status }).eq('id', req.body.id);
  res.send({ ok: true });
});

app.delete('/estimate/:id', checkAdmin, async (req, res) => {
  await supabase.from('estimates').delete().eq('id', req.params.id);
  res.send({ ok: true });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

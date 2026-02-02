require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
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
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log(
  'SERVICE_ROLE_KEY:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING'
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: true,       
  credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
  secure: true,
  sameSite: 'none',
  httpOnly: true
}
}));

/* ================= STATIC ================= */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
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


/* ================= CONTENT ================= */
app.get('/content', async (req, res) => {
  const { data, error } = await supabase
    .from('content')
    .select('value')
    .eq('id', 1)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({
    intro: data.value.intro || '',
    slides: data.value.slides || [],
    portfolioImages: data.value.portfolio || []
  });
});

app.post('/content', checkAdmin, async (req, res) => {
  const { intro, slides, portfolioImages } = req.body;

  const { error } = await supabase
    .from('content')
    .update({
      value: {
        intro,
        slides,
        portfolio: portfolioImages
      }
    })
    .eq('id', 1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
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
  try {
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
      console.error('Supabase insert error:', error);
      return res.status(500).send({
        ok: false,
        error: error.message
      });
    }

    res.send({ ok: true });
  } catch (err) {
    console.error('Server crash:', err);
    res.status(500).send({
      ok: false,
      error: err.message
    });
  }
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
  console.log('ADMIN_PW:', process.env.ADMIN_PW);
  console.log('SESSION_SECRET:', !!process.env.SESSION_SECRET);
  console.log(`Server running on ${PORT}`);
});


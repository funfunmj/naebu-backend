require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const cors = require('cors');

// ✅ Cloudinary 추가
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------- 환경 변수 -----------------
const ADMIN_PW = process.env.ADMIN_PW || '1234';

app.use(cors({
  origin: '*',
  methods: ['GET','POST'],
}));

// ----------------- 세션 설정 -----------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(express.json());

// ----------------- 업로드 폴더 -----------------


// ----------------- 정적 파일 -----------------
app.use(express.static(path.join(__dirname, 'public')));

// ----------------- multer 설정 -----------------
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ----------------- 인증 미들웨어 -----------------
function checkAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).send({ ok: false, message: 'No auth' });
}

// ----------------- 콘텐츠 데이터 -----------------


// ----------------- 관리자 -----------------
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

// ----------------- 콘텐츠 -----------------


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

    res.send({ urls });
  } catch (err) {
    console.error(err);
    res.status(500).send({ ok: false, message: 'Cloudinary upload failed' });
  }
});

// ----------------- 문의 관리 -----------------

let ESTIMATES = [];

app.get('/estimates', (req, res) => res.send(ESTIMATES));

app.post('/estimate', async (req, res) => {
  const id = Date.now().toString();
  ESTIMATES.push({ id, ...req.body, date: new Date().toISOString(), status: '대기', read: 0, memo: '' });
  res.send({ ok: true });
});

app.post('/estimate/read', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.read = 1;
  res.send({ ok: true });
});

app.post('/estimate/memo', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.memo = req.body.memo;
  res.send({ ok: true });
});

app.post('/estimate/status', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.status = req.body.status;
  res.send({ ok: true });
});

app.delete('/estimate/:id', checkAdmin, async (req, res) => {
  ESTIMATES = ESTIMATES.filter(x => x.id !== req.params.id);
  res.send({ ok: true });
});

// ----------------- 통계 -----------------
app.get('/estimates/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;
  let stat = { today: 0, month: 0, status: { '대기': 0, '진행중': 0, '처리완료': 0 }, monthly: [] };

  ESTIMATES.forEach(e => {
    if (e.date.slice(0, 10) === today) stat.today++;
    if (new Date(e.date).getMonth() + 1 === month) stat.month++;
    stat.status[e.status]++;
  });

  for (let m = 1; m <= 12; m++) {
    stat.monthly.push({ month: m, count: ESTIMATES.filter(e => new Date(e.date).getMonth() + 1 === m).length });
  }
  res.send(stat);
});

// ----------------- CSV -----------------
app.get('/estimates/export', (req, res) => {
  const header = '이름,연락처,공간,내용,상태,날짜,메모\n';
  const rows = ESTIMATES.map(e =>
    `"${e.name}","${e.phone}","${e.space}","${e.message || ''}","${e.status}","${e.date}","${e.memo || ''}"`).join('\n');

  res.setHeader('Content-Disposition', 'attachment; filename=estimates.csv');
  res.send(header + rows);
});

// ----------------- 서버 실행 -----------------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

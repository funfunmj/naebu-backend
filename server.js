require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------- 환경 변수 -----------------
const ADMIN_PW = process.env.ADMIN_PW || '1234';

// ----------------- 세션 설정 -----------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(express.json());

// ----------------- 업로드 폴더 -----------------
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(console.error);

// ----------------- 정적 파일 -----------------
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ----------------- multer 설정 -----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({
  storage,
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
const contentFile = path.join(__dirname,'data','content.json');
let CONTENT = { intro: '', slides: [], slideInterval: 4500, portfolioImages: [] };

async function loadContent() {
  try {
    const data = await fs.readFile(contentFile, 'utf-8');
    CONTENT = JSON.parse(data);
  } catch { }
}
loadContent();

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
app.get('/content', (req, res) => res.send(CONTENT));

app.post('/content', checkAdmin, async (req, res) => {
  CONTENT.intro = req.body.intro;
  CONTENT.slides = req.body.slides;
  CONTENT.slideInterval = req.body.slideInterval || 4500;
  CONTENT.portfolioImages = req.body.portfolioImages;

  try {
    await fs.writeFile(contentFile, JSON.stringify(CONTENT, null, 2));
    res.send({ ok: true });
  } catch (err) {
    res.status(500).send({ ok: false, message: err.message });
  }
});

// ----------------- 업로드 -----------------
app.post('/upload', checkAdmin, upload.array('image'), (req, res) => {
  const filenames = req.files.map(f => f.filename);
  res.send({ filenames });
});

app.post('/upload/delete', checkAdmin, async (req, res) => {
  try {
    const filename = path.basename(req.body.filename);
    const filepath = path.join(UPLOAD_DIR, filename);
    await fs.unlink(filepath).catch(() => {});
    res.send({ ok: true });
  } catch (err) {
    res.status(500).send({ ok: false, message: err.message });
  }
});

// ----------------- 문의 관리 -----------------
const estimateFile = path.join(__dirname,'data', 'estimates.json');
let ESTIMATES = [];

async function loadEstimates() {
  try {
    const data = await fs.readFile(estimateFile, 'utf-8');
    ESTIMATES = JSON.parse(data);
  } catch { }
}
loadEstimates();

async function saveEstimates() {
  await fs.writeFile(estimateFile, JSON.stringify(ESTIMATES, null, 2));
}

app.get('/estimates', (req, res) => res.send(ESTIMATES));

app.post('/estimate', async (req, res) => {
  const id = Date.now().toString();
  ESTIMATES.push({ id, ...req.body, date: new Date().toISOString(), status: '대기', read: 0, memo: '' });
  await saveEstimates();
  res.send({ ok: true });
});

app.post('/estimate/read', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.read = 1;
  await saveEstimates();
  res.send({ ok: true });
});

app.post('/estimate/memo', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.memo = req.body.memo;
  await saveEstimates();
  res.send({ ok: true });
});

app.post('/estimate/status', checkAdmin, async (req, res) => {
  const e = ESTIMATES.find(x => x.id === req.body.id);
  if (e) e.status = req.body.status;
  await saveEstimates();
  res.send({ ok: true });
});

app.delete('/estimate/:id', checkAdmin, async (req, res) => {
  ESTIMATES = ESTIMATES.filter(x => x.id !== req.params.id);
  await saveEstimates();
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

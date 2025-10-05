const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const dayjs = require('dayjs');

const db = new Database(path.join(__dirname, 'data', 'upsc.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  timeframe TEXT NOT NULL CHECK(timeframe IN ('daily','weekly','monthly','yearly')),
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subject TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

function now() { return dayjs().toISOString(); }

// Home dashboard
app.get('/', (req, res) => {
  const counts = db.prepare(`
    SELECT timeframe, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) as done,
           COUNT(*) as total
    FROM targets GROUP BY timeframe
  `).all();
  const daily = db.prepare('SELECT * FROM targets WHERE timeframe=? ORDER BY completed, due_date IS NULL, due_date ASC').all('daily');
  const weekly = db.prepare('SELECT * FROM targets WHERE timeframe=? ORDER BY completed, due_date IS NULL, due_date ASC').all('weekly');
  const monthly = db.prepare('SELECT * FROM targets WHERE timeframe=? ORDER BY completed, due_date IS NULL, due_date ASC').all('monthly');
  const yearly = db.prepare('SELECT * FROM targets WHERE timeframe=? ORDER BY completed, due_date IS NULL, due_date ASC').all('yearly');
  const timetable = db.prepare('SELECT * FROM timetable_entries ORDER BY day_of_week, start_time').all();
  res.render('index', { counts, daily, weekly, monthly, yearly, timetable });
});

// Targets CRUD
app.get('/targets/new', (req, res) => {
  res.render('targets_form', { target: null });
});

app.post('/targets', (req, res) => {
  const { title, description, timeframe, due_date } = req.body;
  db.prepare(`INSERT INTO targets (title, description, timeframe, due_date, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)`)
    .run(title, description || null, timeframe, due_date || null, now(), now());
  res.redirect('/');
});

app.get('/targets/:id/edit', (req, res) => {
  const target = db.prepare('SELECT * FROM targets WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).send('Not found');
  res.render('targets_form', { target });
});

app.post('/targets/:id', (req, res) => {
  const { title, description, timeframe, due_date } = req.body;
  db.prepare(`UPDATE targets SET title=?, description=?, timeframe=?, due_date=?, updated_at=? WHERE id=?`)
    .run(title, description || null, timeframe, due_date || null, now(), req.params.id);
  res.redirect('/');
});

app.post('/targets/:id/complete', (req, res) => {
  db.prepare('UPDATE targets SET completed=1, updated_at=? WHERE id=?').run(now(), req.params.id);
  res.redirect('/');
});

app.post('/targets/:id/delete', (req, res) => {
  db.prepare('DELETE FROM targets WHERE id=?').run(req.params.id);
  res.redirect('/');
});

// Timetable CRUD
app.get('/timetable/new', (req, res) => {
  res.render('timetable_form', { entry: null });
});

app.post('/timetable', (req, res) => {
  const { day_of_week, start_time, end_time, subject, notes } = req.body;
  db.prepare(`INSERT INTO timetable_entries (day_of_week, start_time, end_time, subject, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(Number(day_of_week), start_time, end_time, subject, notes || null, now(), now());
  res.redirect('/');
});

app.get('/timetable/:id/edit', (req, res) => {
  const entry = db.prepare('SELECT * FROM timetable_entries WHERE id=?').get(req.params.id);
  if (!entry) return res.status(404).send('Not found');
  res.render('timetable_form', { entry });
});

app.post('/timetable/:id', (req, res) => {
  const { day_of_week, start_time, end_time, subject, notes } = req.body;
  db.prepare(`UPDATE timetable_entries SET day_of_week=?, start_time=?, end_time=?, subject=?, notes=?, updated_at=? WHERE id=?`)
    .run(Number(day_of_week), start_time, end_time, subject, notes || null, now(), req.params.id);
  res.redirect('/');
});

app.post('/timetable/:id/delete', (req, res) => {
  db.prepare('DELETE FROM timetable_entries WHERE id=?').run(req.params.id);
  res.redirect('/');
});

// Simple DuckDuckGo search for creating targets
const fetch = require('node-fetch');
app.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.render('search', { q, results: [] });
  try {
    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const html = await response.text();
    // naive parsing
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const results = [];
    let match;
    while ((match = linkRegex.exec(html)) && results.length < 10) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '');
      results.push({ title, url });
    }
    res.render('search', { q, results });
  } catch (e) {
    res.render('search', { q, results: [] });
  }
});

app.post('/targets/from-search', (req, res) => {
  const { title, url, timeframe } = req.body;
  const description = `Research: ${url}`;
  db.prepare(`INSERT INTO targets (title, description, timeframe, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(title, description, timeframe || 'weekly', now(), now());
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

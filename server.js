const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'library.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

function saveDB() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) { db.run(sql, params); }

async function initDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();

  run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    active INTEGER DEFAULT 1
  )`);

  run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    membership_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    membership_type TEXT DEFAULT '6months',
    start_date TEXT,
    expiry_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'book',
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT,
    isbn TEXT,
    publisher TEXT,
    year INTEGER,
    copies INTEGER DEFAULT 1,
    available INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_no TEXT UNIQUE NOT NULL,
    book_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    fine_amount REAL DEFAULT 0,
    fine_paid INTEGER DEFAULT 0,
    remarks TEXT,
    return_remarks TEXT,
    status TEXT DEFAULT 'issued',
    FOREIGN KEY(book_id) REFERENCES books(id),
    FOREIGN KEY(member_id) REFERENCES members(id)
  )`);

  // Seed admin
  if (!query("SELECT id FROM users WHERE username='admin'").length) {
    run("INSERT INTO users (username,password,role,name,active) VALUES (?,?,?,?,1)",
      ['admin', bcrypt.hashSync('admin123',10), 'admin', 'Administrator']);
    run("INSERT INTO users (username,password,role,name,active) VALUES (?,?,?,?,1)",
      ['user', bcrypt.hashSync('user123',10), 'user', 'Library User']);

    // Sample members
    run(`INSERT INTO members (membership_no,name,email,phone,address,membership_type,start_date,expiry_date,status) VALUES
      ('MEM001','Amit Sharma','amit@example.com','9876543210','Delhi','1year','2025-01-01','2026-01-01','active')`);
    run(`INSERT INTO members (membership_no,name,email,phone,address,membership_type,start_date,expiry_date,status) VALUES
      ('MEM002','Priya Patel','priya@example.com','8765432109','Mumbai','6months','2025-06-01','2025-12-01','active')`);

    // Sample books
    run(`INSERT INTO books (type,title,author,category,isbn,publisher,year,copies,available) VALUES
      ('book','The Alchemist','Paulo Coelho','Fiction','978-0-06-112008-4','HarperCollins',1988,2,1)`);
    run(`INSERT INTO books (type,title,author,category,isbn,publisher,year,copies,available) VALUES
      ('book','Clean Code','Robert C. Martin','Technology','978-0-13-235088-4','Prentice Hall',2008,1,1)`);
    run(`INSERT INTO books (type,title,author,category,isbn,publisher,year,copies,available) VALUES
      ('movie','Lagaan','Ashutosh Gowariker','Drama','','Aamir Khan Productions',2001,1,1)`);
    run(`INSERT INTO books (type,title,author,category,isbn,publisher,year,copies,available) VALUES
      ('book','Wings of Fire','A.P.J. Abdul Kalam','Biography','978-81-7371-146-6','Universities Press',1999,1,1)`);

    saveDB();
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const rows = query('SELECT * FROM users WHERE username=? AND active=1', [username]);
  if (!rows.length || !bcrypt.compareSync(password, rows[0].password))
    return res.json({ success: false, message: 'Invalid username or password.' });
  res.json({ success: true, role: rows[0].role, username: rows[0].username, name: rows[0].name });
});

// ── MEMBERS ──────────────────────────────────────────────────────────────────
app.get('/api/members', (req, res) => res.json(query('SELECT * FROM members ORDER BY id DESC')));
app.get('/api/members/:id', (req, res) => {
  const rows = query('SELECT * FROM members WHERE id=?', [req.params.id]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
});
app.get('/api/members/by-no/:no', (req, res) => {
  const rows = query('SELECT * FROM members WHERE membership_no=?', [req.params.no]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
});

function calcExpiry(start, type) {
  const d = new Date(start);
  if (type === '6months') d.setMonth(d.getMonth() + 6);
  else if (type === '1year') d.setFullYear(d.getFullYear() + 1);
  else if (type === '2years') d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().split('T')[0];
}

app.post('/api/members', (req, res) => {
  const { name, email, phone, address, membership_type } = req.body;
  if (!name || !email || !phone || !address || !membership_type)
    return res.json({ success: false, message: 'All fields are mandatory.' });
  const last = query("SELECT membership_no FROM members ORDER BY id DESC LIMIT 1");
  const num = last.length ? parseInt(last[0].membership_no.replace('MEM','')) + 1 : 1;
  const membership_no = 'MEM' + String(num).padStart(3,'0');
  const start = new Date().toISOString().split('T')[0];
  const expiry = calcExpiry(start, membership_type);
  try {
    run('INSERT INTO members (membership_no,name,email,phone,address,membership_type,start_date,expiry_date,status) VALUES (?,?,?,?,?,?,?,?,?)',
      [membership_no, name, email, phone, address, membership_type, start, expiry, 'active']);
    saveDB();
    res.json({ success: true, membership_no });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

app.put('/api/members/:id', (req, res) => {
  const { name, email, phone, address, membership_type, action, extend_type } = req.body;
  const member = query('SELECT * FROM members WHERE id=?', [req.params.id]);
  if (!member.length) return res.json({ success: false, message: 'Member not found.' });

  if (action === 'cancel') {
    run('UPDATE members SET status=? WHERE id=?', ['cancelled', req.params.id]);
    saveDB();
    return res.json({ success: true, message: 'Membership cancelled.' });
  }
  if (action === 'extend') {
    const base = member[0].expiry_date > new Date().toISOString().split('T')[0]
      ? member[0].expiry_date : new Date().toISOString().split('T')[0];
    const newExpiry = calcExpiry(base, extend_type || '6months');
    run('UPDATE members SET expiry_date=?, membership_type=?, status=? WHERE id=?',
      [newExpiry, extend_type || '6months', 'active', req.params.id]);
    saveDB();
    return res.json({ success: true, expiry_date: newExpiry });
  }
  run('UPDATE members SET name=?,email=?,phone=?,address=? WHERE id=?',
    [name, email, phone, address, req.params.id]);
  saveDB();
  res.json({ success: true });
});

// ── BOOKS ─────────────────────────────────────────────────────────────────────
app.get('/api/books', (req, res) => {
  const { type, available, search } = req.query;
  let sql = 'SELECT * FROM books WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type=?'; params.push(type); }
  if (available !== undefined) { sql += ' AND available=?'; params.push(parseInt(available)); }
  if (search) { sql += ' AND (title LIKE ? OR author LIKE ? OR category LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
  sql += ' ORDER BY id DESC';
  res.json(query(sql, params));
});

app.get('/api/books/:id', (req, res) => {
  const rows = query('SELECT * FROM books WHERE id=?', [req.params.id]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/books', (req, res) => {
  const { type, title, author, category, isbn, publisher, year, copies } = req.body;
  if (!type || !title || !author || !category || !publisher || !year)
    return res.json({ success: false, message: 'All fields are mandatory.' });
  try {
    run('INSERT INTO books (type,title,author,category,isbn,publisher,year,copies,available) VALUES (?,?,?,?,?,?,?,?,?)',
      [type, title, author, category, isbn||'', publisher, year, copies||1, 1]);
    saveDB();
    res.json({ success: true });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

app.put('/api/books/:id', (req, res) => {
  const { type, title, author, category, isbn, publisher, year, copies } = req.body;
  if (!type || !title || !author || !category || !publisher || !year)
    return res.json({ success: false, message: 'All fields are mandatory.' });
  run('UPDATE books SET type=?,title=?,author=?,category=?,isbn=?,publisher=?,year=?,copies=? WHERE id=?',
    [type, title, author, category, isbn||'', publisher, year, copies||1, req.params.id]);
  saveDB();
  res.json({ success: true });
});

app.delete('/api/books/:id', (req, res) => {
  run('DELETE FROM books WHERE id=?', [req.params.id]);
  saveDB(); res.json({ success: true });
});

// ── ISSUES ────────────────────────────────────────────────────────────────────
app.get('/api/issues', (req, res) => {
  res.json(query(`
    SELECT i.*, b.title book_title, b.author book_author, b.type book_type,
           m.name member_name, m.membership_no
    FROM issues i
    JOIN books b ON i.book_id=b.id
    JOIN members m ON i.member_id=m.id
    ORDER BY i.id DESC
  `));
});

app.get('/api/issues/:id', (req, res) => {
  const rows = query(`
    SELECT i.*, b.title book_title, b.author book_author,
           m.name member_name, m.membership_no
    FROM issues i JOIN books b ON i.book_id=b.id JOIN members m ON i.member_id=m.id
    WHERE i.id=?`, [req.params.id]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
});

app.get('/api/issues/by-serial/:no', (req, res) => {
  const rows = query(`
    SELECT i.*, b.title book_title, b.author book_author,
           m.name member_name, m.membership_no
    FROM issues i JOIN books b ON i.book_id=b.id JOIN members m ON i.member_id=m.id
    WHERE i.serial_no=?`, [req.params.no]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/issues', (req, res) => {
  const { book_id, member_id, issue_date, due_date, remarks } = req.body;
  if (!book_id || !member_id || !issue_date || !due_date)
    return res.json({ success: false, message: 'All required fields must be filled.' });
  const avail = query('SELECT available FROM books WHERE id=?', [book_id]);
  if (!avail.length || !avail[0].available)
    return res.json({ success: false, message: 'Book is not available for issue.' });
  const serial = 'ISS' + Date.now();
  run('INSERT INTO issues (serial_no,book_id,member_id,issue_date,due_date,remarks,status) VALUES (?,?,?,?,?,?,?)',
    [serial, book_id, member_id, issue_date, due_date, remarks||'', 'issued']);
  run('UPDATE books SET available=0 WHERE id=?', [book_id]);
  saveDB();
  const newIssue = query('SELECT * FROM issues WHERE serial_no=?', [serial]);
  res.json({ success: true, issue: newIssue[0] });
});

app.post('/api/issues/:id/return', (req, res) => {
  const { return_date, return_remarks } = req.body;
  const rows = query('SELECT * FROM issues WHERE id=?', [req.params.id]);
  if (!rows.length) return res.json({ success: false, message: 'Issue not found.' });
  const issue = rows[0];
  if (issue.status === 'returned') return res.json({ success: false, message: 'Already returned.' });
  const due = new Date(issue.due_date);
  const ret = new Date(return_date);
  const days = Math.max(0, Math.ceil((ret - due) / 86400000));
  const fine = days * 5;
  run('UPDATE issues SET return_date=?,fine_amount=?,return_remarks=?,status=? WHERE id=?',
    [return_date, fine, return_remarks||'', 'pending_fine', req.params.id]);
  saveDB();
  res.json({ success: true, fine_amount: fine, issue_id: issue.id, serial_no: issue.serial_no });
});

app.post('/api/issues/:id/pay-fine', (req, res) => {
  const { fine_paid, remarks } = req.body;
  const rows = query('SELECT * FROM issues WHERE id=?', [req.params.id]);
  if (!rows.length) return res.json({ success: false, message: 'Issue not found.' });
  const issue = rows[0];
  if (issue.fine_amount > 0 && !fine_paid)
    return res.json({ success: false, message: 'Fine must be paid before completing return.' });
  run('UPDATE issues SET fine_paid=?,return_remarks=?,status=? WHERE id=?',
    [fine_paid ? 1 : 0, remarks||issue.return_remarks||'', 'returned', req.params.id]);
  run('UPDATE books SET available=1 WHERE id=?', [issue.book_id]);
  saveDB();
  res.json({ success: true });
});

// ── USERS (admin) ─────────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => res.json(query('SELECT id,username,name,role,active FROM users ORDER BY id')));

app.post('/api/users', (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name)
    return res.json({ success: false, message: 'Name, username and password are mandatory.' });
  try {
    run('INSERT INTO users (username,password,name,role,active) VALUES (?,?,?,?,1)',
      [username, bcrypt.hashSync(password,10), name, role||'user']);
    saveDB(); res.json({ success: true });
  } catch(e) { res.json({ success: false, message: 'Username already exists.' }); }
});

app.put('/api/users/:id', (req, res) => {
  const { name, role, active, password } = req.body;
  if (password) {
    run('UPDATE users SET name=?,role=?,active=?,password=? WHERE id=?',
      [name, role, active, bcrypt.hashSync(password,10), req.params.id]);
  } else {
    run('UPDATE users SET name=?,role=?,active=? WHERE id=?', [name, role, active, req.params.id]);
  }
  saveDB(); res.json({ success: true });
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
app.get('/api/reports/active-issues', (req, res) => res.json(query(`
  SELECT i.*, b.title book_title, b.author book_author, m.name member_name, m.membership_no
  FROM issues i JOIN books b ON i.book_id=b.id JOIN members m ON i.member_id=m.id
  WHERE i.status IN ('issued','pending_fine') ORDER BY i.due_date
`)));

app.get('/api/reports/overdue', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json(query(`
    SELECT i.*, b.title book_title, b.author book_author, m.name member_name, m.membership_no
    FROM issues i JOIN books b ON i.book_id=b.id JOIN members m ON i.member_id=m.id
    WHERE i.status='issued' AND i.due_date < ? ORDER BY i.due_date
  `, [today]));
});

app.get('/api/reports/memberships', (req, res) => res.json(query('SELECT * FROM members ORDER BY id DESC')));
app.get('/api/reports/books', (req, res) => res.json(query("SELECT * FROM books WHERE type='book' ORDER BY id DESC")));
app.get('/api/reports/movies', (req, res) => res.json(query("SELECT * FROM books WHERE type='movie' ORDER BY id DESC")));
app.get('/api/reports/pending', (req, res) => res.json(query(`
  SELECT i.*, b.title book_title, b.author book_author, m.name member_name, m.membership_no
  FROM issues i JOIN books b ON i.book_id=b.id JOIN members m ON i.member_id=m.id
  WHERE i.status='issued' ORDER BY i.issue_date DESC
`)));

initDB().then(() => {
  app.listen(PORT, () => console.log(`\nLibrary Management System running at:\nhttp://localhost:${PORT}\n`));
});

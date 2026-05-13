// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
let SESSION = { user: null, role: null, name: null };
let allBooks = [], allMembers = [];

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

function $(id) { return document.getElementById(id); }

function showEl(id) { $(id).classList.remove('hidden'); }
function hideEl(id) { $(id).classList.add('hidden'); }

function setError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearMsg(id) { const el=$(id); if(el){el.textContent='';el.classList.add('hidden');} }

function fmtDate(s) {
  if (!s) return '';
  return s.includes('T') ? s.split('T')[0] : s;
}

function today() { return new Date().toISOString().split('T')[0]; }

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysDiff(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════
async function doLogin() {
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  clearMsg('login-error');
  if (!username || !password) { setError('login-error','Please enter username and password.'); return; }
  const res = await api('POST', '/api/login', { username, password });
  if (res.success) {
    SESSION = { user: res.username, role: res.role, name: res.name };
    $('login-page').classList.add('hidden');
    $('app-page').classList.remove('hidden');
    $('nav-username').textContent = res.name + ' (' + res.role + ')';
    buildNav();
    showScreen('home');
  } else {
    setError('login-error', res.message);
  }
}

function doLogout() {
  SESSION = {};
  $('app-page').classList.add('hidden');
  $('login-page').classList.remove('hidden');
  $('login-password').value = '';
  clearMsg('login-error');
}

$('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ══════════════════════════════════════════════════════
//  NAV
// ══════════════════════════════════════════════════════
function buildNav() {
  const links = $('nav-links');
  links.innerHTML = '';
  const items = [
    { id: 'home', label: 'Home' },
    ...(SESSION.role === 'admin' ? [{ id: 'maintenance', label: 'Maintenance' }] : []),
    { id: 'transactions', label: 'Transactions' },
    { id: 'reports', label: 'Reports' },
  ];
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.id = 'navbtn-' + item.id;
    btn.textContent = item.label;
    btn.onclick = () => showScreen(item.id);
    links.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════════
//  SCREEN ROUTER
// ══════════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('screen-' + name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const SCREEN_TO_NAV = {
    'home': 'home',
    'maintenance': 'maintenance',
    'add-membership': 'maintenance',
    'update-membership': 'maintenance',
    'add-book': 'maintenance',
    'update-book': 'maintenance',
    'user-management': 'maintenance',
    'transactions': 'transactions',
    'check-availability': 'transactions',
    'issue-book': 'transactions',
    'return-book': 'transactions',
    'pay-fine': 'transactions',
    'reports': 'reports',
    'report-view': 'reports',
  };
  const navKey = SCREEN_TO_NAV[name];
  if (navKey) { const nb = $('navbtn-' + navKey); if (nb) nb.classList.add('active'); }

  // Screen init hooks
  if (name === 'home') loadHome();
  if (name === 'issue-book') initIssueBook();
  if (name === 'return-book') initReturnBook();
  if (name === 'update-membership') { hideEl('um-form'); clearMsg('um-search-error'); $('um-no').value=''; }
  if (name === 'update-book') { hideEl('ub-results'); hideEl('ub-form'); }
  if (name === 'user-management') { toggleUserForm(); }
  if (name === 'check-availability') { hideEl('ca-results'); hideEl('ca-error'); }
}

// ══════════════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════════════
async function loadHome() {
  const [books, members, issues] = await Promise.all([
    api('GET', '/api/books'),
    api('GET', '/api/members'),
    api('GET', '/api/issues'),
  ]);
  allBooks = books; allMembers = members;
  const t = today();
  const active = issues.filter(i => i.status === 'issued' || i.status === 'pending_fine');
  const overdue = issues.filter(i => i.status === 'issued' && i.due_date < t);

  $('home-stats').innerHTML = `
    <div class="stat-card"><div class="num">${books.length}</div><div class="lbl">Total Books</div></div>
    <div class="stat-card"><div class="num">${books.filter(b=>b.available).length}</div><div class="lbl">Available</div></div>
    <div class="stat-card"><div class="num">${members.length}</div><div class="lbl">Members</div></div>
    <div class="stat-card"><div class="num">${active.length}</div><div class="lbl">Active Issues</div></div>
    <div class="stat-card" style="border-color:${overdue.length?'#c81e1e':''}"><div class="num" style="color:${overdue.length?'var(--danger)':'var(--primary)'}">${overdue.length}</div><div class="lbl">Overdue</div></div>
  `;

  const menuItems = [
    ...(SESSION.role === 'admin' ? [
      { icon:'👤', title:'Add Membership', desc:'Register new member', screen:'add-membership' },
      { icon:'📖', title:'Add Book / Movie', desc:'Add to collection', screen:'add-book' },
    ] : []),
    { icon:'🔍', title:'Check Availability', desc:'Search books', screen:'check-availability' },
    { icon:'📤', title:'Issue a Book', desc:'Issue to member', screen:'issue-book' },
    { icon:'📥', title:'Return a Book', desc:'Process return', screen:'return-book' },
    { icon:'📋', title:'Reports', desc:'View reports', screen:'reports' },
  ];
  $('home-menu').innerHTML = menuItems.map(m =>
    `<div class="menu-card" onclick="showScreen('${m.screen}')"><div class="icon">${m.icon}</div><div class="title">${m.title}</div><div class="desc">${m.desc}</div></div>`
  ).join('');
}

// ══════════════════════════════════════════════════════
//  CLEAR FORMS
// ══════════════════════════════════════════════════════
function clearForm(screen) {
  if (screen === 'add-membership') {
    ['am-name','am-email','am-phone','am-address'].forEach(id => $(id).value='');
    document.querySelector('input[name="am-duration"][value="6months"]').checked = true;
    clearMsg('add-member-error'); clearMsg('add-member-success');
  }
  if (screen === 'add-book') {
    ['ab-title','ab-author','ab-category','ab-isbn','ab-publisher','ab-year'].forEach(id => $(id).value='');
    $('ab-copies').value = 1;
    document.querySelector('input[name="ab-type"][value="book"]').checked = true;
    clearMsg('ab-error'); clearMsg('ab-success');
  }
  if (screen === 'user-management') {
    ['nu-name','nu-username','nu-password'].forEach(id => $(id).value='');
    $('nu-role').value='user';
    clearMsg('nu-error'); clearMsg('nu-success');
  }
}

// ══════════════════════════════════════════════════════
//  ADD MEMBERSHIP
// ══════════════════════════════════════════════════════
async function submitAddMember() {
  clearMsg('add-member-error'); clearMsg('add-member-success');
  const name = $('am-name').value.trim();
  const email = $('am-email').value.trim();
  const phone = $('am-phone').value.trim();
  const address = $('am-address').value.trim();
  const membership_type = document.querySelector('input[name="am-duration"]:checked').value;
  if (!name || !email || !phone || !address) {
    setError('add-member-error', 'All fields are mandatory. Please fill in all details.'); return;
  }
  const res = await api('POST', '/api/members', { name, email, phone, address, membership_type });
  if (res.success) {
    showEl('add-member-success');
    $('add-member-success').textContent = `Membership created successfully! Membership No: ${res.membership_no}`;
    clearForm('add-membership');
  } else {
    setError('add-member-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  UPDATE MEMBERSHIP
// ══════════════════════════════════════════════════════
async function lookupMember() {
  clearMsg('um-search-error');
  const no = $('um-no').value.trim();
  if (!no) { setError('um-search-error','Please enter a membership number.'); return; }
  const res = await api('GET', '/api/members/by-no/' + encodeURIComponent(no));
  if (res.error) { setError('um-search-error','Membership not found. Please check the number.'); hideEl('um-form'); return; }
  $('um-id').value = res.id;
  $('um-name').value = res.name;
  $('um-email').value = res.email;
  $('um-phone').value = res.phone || '';
  $('um-expiry').value = res.expiry_date || '';
  $('um-status').value = res.status;
  document.querySelector('input[name="um-action"][value="extend"]').checked = true;
  showEl('um-extend-section');
  clearMsg('um-error'); clearMsg('um-success');
  showEl('um-form');
}

function toggleUmAction() {
  const action = document.querySelector('input[name="um-action"]:checked')?.value;
  action === 'extend' ? showEl('um-extend-section') : hideEl('um-extend-section');
}

async function submitUpdateMember() {
  clearMsg('um-error'); clearMsg('um-success');
  const id = $('um-id').value;
  const action = document.querySelector('input[name="um-action"]:checked').value;
  let body = { action };
  if (action === 'extend') {
    body.extend_type = document.querySelector('input[name="um-extend"]:checked').value;
  }
  const res = await api('PUT', '/api/members/' + id, body);
  if (res.success) {
    $('um-success').textContent = action === 'cancel'
      ? 'Membership cancelled successfully.'
      : `Membership extended. New expiry: ${res.expiry_date || ''}`;
    showEl('um-success');
    if (action !== 'cancel') $('um-expiry').value = res.expiry_date || '';
    $('um-status').value = action === 'cancel' ? 'cancelled' : 'active';
  } else {
    setError('um-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  ADD BOOK
// ══════════════════════════════════════════════════════
async function submitAddBook() {
  clearMsg('ab-error'); clearMsg('ab-success');
  const type = document.querySelector('input[name="ab-type"]:checked').value;
  const title = $('ab-title').value.trim();
  const author = $('ab-author').value.trim();
  const category = $('ab-category').value.trim();
  const isbn = $('ab-isbn').value.trim();
  const publisher = $('ab-publisher').value.trim();
  const year = $('ab-year').value.trim();
  const copies = $('ab-copies').value;
  if (!title || !author || !category || !publisher || !year) {
    setError('ab-error','All mandatory fields must be filled. Please complete the form.'); return;
  }
  const res = await api('POST', '/api/books', { type, title, author, category, isbn, publisher, year: parseInt(year), copies: parseInt(copies) });
  if (res.success) {
    $('ab-success').textContent = `${type === 'book' ? 'Book' : 'Movie'} added successfully!`;
    showEl('ab-success');
    clearForm('add-book');
  } else {
    setError('ab-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  UPDATE BOOK
// ══════════════════════════════════════════════════════
async function searchBooksForUpdate() {
  clearMsg('ub-search-error');
  const q = $('ub-search').value.trim();
  const type = document.querySelector('input[name="ub-type-filter"]:checked').value;
  if (!q) { setError('ub-search-error','Please enter a search term.'); return; }
  const books = await api('GET', `/api/books?type=${type}&search=${encodeURIComponent(q)}`);
  const tbody = $('ub-results-body');
  if (!books.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data">No results found.</td></tr>`;
  } else {
    tbody.innerHTML = books.map(b => `
      <tr>
        <td>${b.title}</td><td>${b.author}</td><td>${b.category}</td><td>${b.year}</td>
        <td><input type="radio" name="ub-select" value="${b.id}" data-book='${JSON.stringify(b).replace(/'/g,"&#39;")}'></td>
      </tr>`).join('');
    tbody.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', function() {
      const b = JSON.parse(this.getAttribute('data-book').replace(/&#39;/g,"'"));
      populateUpdateBookForm(b);
    }));
  }
  showEl('ub-results');
  hideEl('ub-form');
}

function populateUpdateBookForm(b) {
  $('ub-id').value = b.id;
  document.querySelector(`input[name="ub-type"][value="${b.type}"]`).checked = true;
  $('ub-title').value = b.title;
  $('ub-author').value = b.author;
  $('ub-category').value = b.category || '';
  $('ub-isbn').value = b.isbn || '';
  $('ub-publisher').value = b.publisher || '';
  $('ub-year').value = b.year || '';
  $('ub-copies').value = b.copies || 1;
  clearMsg('ub-error'); clearMsg('ub-success');
  showEl('ub-form');
}

async function submitUpdateBook() {
  clearMsg('ub-error'); clearMsg('ub-success');
  const id = $('ub-id').value;
  const type = document.querySelector('input[name="ub-type"]:checked').value;
  const title = $('ub-title').value.trim();
  const author = $('ub-author').value.trim();
  const category = $('ub-category').value.trim();
  const publisher = $('ub-publisher').value.trim();
  const year = $('ub-year').value.trim();
  if (!title || !author || !category || !publisher || !year) {
    setError('ub-error','All mandatory fields must be filled. Please complete the form.'); return;
  }
  const res = await api('PUT', '/api/books/' + id, { type, title, author, category, isbn: $('ub-isbn').value.trim(), publisher, year: parseInt(year), copies: parseInt($('ub-copies').value) });
  if (res.success) {
    $('ub-success').textContent = 'Updated successfully!';
    showEl('ub-success');
  } else {
    setError('ub-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  USER MANAGEMENT
// ══════════════════════════════════════════════════════
function toggleUserForm() {
  const action = document.querySelector('input[name="um-user-action"]:checked')?.value;
  if (action === 'new') {
    showEl('new-user-form'); hideEl('existing-user-form');
  } else {
    hideEl('new-user-form'); showEl('existing-user-form');
    loadUsers();
  }
}

async function loadUsers() {
  const users = await api('GET', '/api/users');
  $('users-tbody').innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td><td>${u.username}</td>
      <td><span class="badge badge-blue">${u.role}</span></td>
      <td><span class="badge ${u.active?'badge-green':'badge-gray'}">${u.active?'Active':'Inactive'}</span></td>
      <td><button class="btn-xs btn-outline" onclick="editUser(${u.id},'${u.name}','${u.role}',${u.active})">Edit</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="no-data">No users found.</td></tr>';
}

function editUser(id, name, role, active) {
  $('eu-id').value = id;
  $('eu-name').value = name;
  $('eu-role').value = role;
  $('eu-password').value = '';
  document.querySelector(`input[name="eu-active"][value="${active}"]`).checked = true;
  clearMsg('eu-error'); clearMsg('eu-success');
  showEl('eu-edit-form');
}

async function submitNewUser() {
  clearMsg('nu-error'); clearMsg('nu-success');
  const name = $('nu-name').value.trim();
  const username = $('nu-username').value.trim();
  const password = $('nu-password').value;
  const role = $('nu-role').value;
  if (!name || !username || !password) { setError('nu-error','Name, username and password are mandatory.'); return; }
  const res = await api('POST', '/api/users', { name, username, password, role });
  if (res.success) {
    $('nu-success').textContent = 'User created successfully!';
    showEl('nu-success');
    clearForm('user-management');
  } else {
    setError('nu-error', res.message);
  }
}

async function submitEditUser() {
  clearMsg('eu-error'); clearMsg('eu-success');
  const id = $('eu-id').value;
  const name = $('eu-name').value.trim();
  const role = $('eu-role').value;
  const active = parseInt(document.querySelector('input[name="eu-active"]:checked').value);
  const password = $('eu-password').value;
  if (!name) { setError('eu-error','Name is mandatory.'); return; }
  const body = { name, role, active };
  if (password) body.password = password;
  const res = await api('PUT', '/api/users/' + id, body);
  if (res.success) {
    $('eu-success').textContent = 'User updated successfully!';
    showEl('eu-success');
    loadUsers();
    hideEl('eu-edit-form');
  } else {
    setError('eu-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  CHECK AVAILABILITY
// ══════════════════════════════════════════════════════
async function searchAvailability() {
  clearMsg('ca-error');
  const title = $('ca-title').value.trim();
  const author = $('ca-author').value.trim();
  const category = $('ca-category').value.trim();
  if (!title && !author && !category) {
    setError('ca-error','Please enter at least one search criteria (title, author, or category) before searching.'); return;
  }
  const search = [title, author, category].filter(Boolean).join(' ');
  const books = await api('GET', `/api/books?available=1&search=${encodeURIComponent(search)}`);
  $('ca-count').textContent = books.length ? `${books.length} result(s) found` : '';
  hideEl('ca-no-results');
  if (!books.length) {
    showEl('ca-no-results');
    $('ca-table-body').innerHTML = '';
  } else {
    $('ca-table-body').innerHTML = books.map(b => `
      <tr>
        <td>${b.title}</td><td>${b.author}</td><td>${b.category||'-'}</td>
        <td><span class="badge badge-blue">${b.type}</span></td>
        <td>${b.year||'-'}</td>
        <td><span class="badge badge-green">Available</span></td>
        <td><input type="radio" name="ca-select" value="${b.id}" data-title="${b.title.replace(/"/g,'&quot;')}" data-author="${b.author.replace(/"/g,'&quot;')}"></td>
      </tr>`).join('');
  }
  showEl('ca-results');
}

function clearAvailSearch() {
  ['ca-title','ca-author','ca-category'].forEach(id => $(id).value='');
  hideEl('ca-results'); clearMsg('ca-error');
}

function issueSelected() {
  const sel = document.querySelector('input[name="ca-select"]:checked');
  if (!sel) { alert('Please select a book using the radio button in the last column.'); return; }
  const bookId = sel.value;
  const title = sel.getAttribute('data-title');
  const author = sel.getAttribute('data-author');
  showScreen('issue-book');
  // Pre-populate
  setTimeout(() => {
    $('ib-title').value = title;
    $('ib-author').value = author;
    $('ib-book-id').value = bookId;
  }, 50);
}

// ══════════════════════════════════════════════════════
//  ISSUE BOOK
// ══════════════════════════════════════════════════════
let bookSearchTimeout;
function searchBookTitle() {
  clearTimeout(bookSearchTimeout);
  bookSearchTimeout = setTimeout(async () => {
    const q = $('ib-title').value.trim();
    $('ib-book-id').value = '';
    $('ib-author').value = '';
    const sug = $('ib-book-suggestions');
    if (q.length < 2) { sug.innerHTML=''; return; }
    const books = await api('GET', `/api/books?available=1&search=${encodeURIComponent(q)}`);
    sug.innerHTML = books.length ? `<div style="position:absolute;top:0;left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:var(--radius);z-index:20;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
      ${books.map(b=>`<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0" 
        onmousedown="selectBook(${b.id},'${b.title.replace(/'/g,"\\'")}',' ${b.author.replace(/'/g,"\\'")}')">
        <strong>${b.title}</strong> <span style="color:var(--muted)">by ${b.author}</span></div>`).join('')}
    </div>` : '';
  }, 250);
}

function selectBook(id, title, author) {
  $('ib-book-id').value = id;
  $('ib-title').value = title.trim();
  $('ib-author').value = author.trim();
  $('ib-book-suggestions').innerHTML = '';
}

let memberSearchTimeout;
function searchMemberInput() {
  clearTimeout(memberSearchTimeout);
  memberSearchTimeout = setTimeout(async () => {
    const q = $('ib-member-search').value.trim();
    $('ib-member-id').value = '';
    $('ib-member-name').value = '';
    const sug = $('ib-member-suggestions');
    if (q.length < 1) { sug.innerHTML=''; return; }
    const members = await api('GET', '/api/members');
    const filtered = members.filter(m => m.membership_no.includes(q) || m.name.toLowerCase().includes(q.toLowerCase()));
    sug.innerHTML = filtered.length ? `<div style="position:absolute;top:0;left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:var(--radius);z-index:20;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
      ${filtered.map(m=>`<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0"
        onmousedown="selectMember(${m.id},'${m.name.replace(/'/g,"\\'")}','${m.membership_no}')">
        <strong>${m.membership_no}</strong> — ${m.name}</div>`).join('')}
    </div>` : '';
  }, 200);
}

function selectMember(id, name, no) {
  $('ib-member-id').value = id;
  $('ib-member-search').value = no;
  $('ib-member-name').value = name;
  $('ib-member-suggestions').innerHTML = '';
}

function initIssueBook() {
  clearMsg('ib-error'); clearMsg('ib-success');
  if (!$('ib-book-id').value) {
    $('ib-title').value=''; $('ib-author').value='';
  }
  $('ib-member-search').value=''; $('ib-member-name').value=''; $('ib-member-id').value='';
  $('ib-remarks').value='';
  const t = today();
  $('ib-issue-date').value = t;
  $('ib-issue-date').min = t;
  $('ib-due-date').value = addDays(t, 15);
  $('ib-due-date').min = t;
  $('ib-due-date').max = addDays(t, 15);
}

function clearIssueForm() {
  $('ib-title').value=''; $('ib-author').value=''; $('ib-book-id').value='';
  $('ib-member-search').value=''; $('ib-member-name').value=''; $('ib-member-id').value='';
  $('ib-remarks').value='';
  $('ib-book-suggestions').innerHTML=''; $('ib-member-suggestions').innerHTML='';
  clearMsg('ib-error'); clearMsg('ib-success');
  initIssueBook();
}

function setDueDate() {
  const issue = $('ib-issue-date').value;
  if (issue) {
    $('ib-due-date').value = addDays(issue, 15);
    $('ib-due-date').min = issue;
    $('ib-due-date').max = addDays(issue, 15);
  }
}

function validateDueDate() {
  const issue = $('ib-issue-date').value;
  const due = $('ib-due-date').value;
  if (!issue || !due) return;
  const diff = daysDiff(issue, due);
  if (diff > 15) {
    $('ib-due-date').value = addDays(issue, 15);
    setError('ib-error','Return date cannot be more than 15 days from issue date. Set to maximum allowed.');
  } else if (due < issue) {
    $('ib-due-date').value = issue;
    setError('ib-error','Return date cannot be before issue date.');
  } else {
    clearMsg('ib-error');
  }
}

async function submitIssueBook() {
  clearMsg('ib-error'); clearMsg('ib-success');
  const book_id = $('ib-book-id').value;
  const member_id = $('ib-member-id').value;
  const issue_date = $('ib-issue-date').value;
  const due_date = $('ib-due-date').value;
  const remarks = $('ib-remarks').value.trim();

  if (!book_id) { setError('ib-error','Please select a valid book from the suggestions.'); return; }
  if (!member_id) { setError('ib-error','Please select a valid member.'); return; }
  if (!issue_date) { setError('ib-error','Issue date is required.'); return; }
  if (!due_date) { setError('ib-error','Return date is required.'); return; }
  if (issue_date < today()) { setError('ib-error','Issue date cannot be in the past.'); return; }

  const res = await api('POST', '/api/issues', { book_id: parseInt(book_id), member_id: parseInt(member_id), issue_date, due_date, remarks });
  if (res.success) {
    $('ib-success').textContent = `Book issued successfully! Serial No: ${res.issue.serial_no}`;
    showEl('ib-success');
    clearIssueForm();
  } else {
    setError('ib-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  RETURN BOOK
// ══════════════════════════════════════════════════════
function initReturnBook() {
  $('rb-serial').value='';
  hideEl('rb-form'); hideEl('rb-active-list');
  clearMsg('rb-search-error'); clearMsg('rb-error');
}

async function showActiveIssues() {
  const issues = await api('GET', '/api/reports/active-issues');
  const tbody = $('rb-active-tbody');
  if (!issues.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No active issues found.</td></tr>';
  } else {
    tbody.innerHTML = issues.map(i => `
      <tr>
        <td>${i.serial_no}</td><td>${i.book_title}</td><td>${i.member_name}</td>
        <td>${fmtDate(i.due_date)}</td>
        <td><input type="radio" name="rb-active-select" value="${i.id}" data-serial="${i.serial_no}"></td>
      </tr>`).join('');
    tbody.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', function() {
      $('rb-serial').value = this.getAttribute('data-serial');
      lookupIssue();
    }));
  }
  const list = $('rb-active-list');
  list.classList.toggle('hidden');
}

async function lookupIssue() {
  clearMsg('rb-search-error');
  const serial = $('rb-serial').value.trim();
  if (!serial) { setError('rb-search-error','Please enter a serial number.'); return; }
  const res = await api('GET', '/api/issues/by-serial/' + encodeURIComponent(serial));
  if (res.error) { setError('rb-search-error','Issue not found. Please check the serial number.'); hideEl('rb-form'); return; }
  if (res.status === 'returned') { setError('rb-search-error','This book has already been returned.'); hideEl('rb-form'); return; }

  $('rb-issue-id').value = res.id;
  $('rb-book').value = res.book_title;
  $('rb-author').value = res.book_author;
  $('rb-serial-disp').value = res.serial_no;
  $('rb-member').value = res.member_name;
  $('rb-issue-date').value = fmtDate(res.issue_date);
  $('rb-return-date').value = fmtDate(res.due_date);
  $('rb-remarks').value = '';
  clearMsg('rb-error');
  showEl('rb-form');
}

async function submitReturn() {
  clearMsg('rb-error');
  const id = $('rb-issue-id').value;
  const return_date = $('rb-return-date').value;
  const return_remarks = $('rb-remarks').value.trim();
  if (!return_date) { setError('rb-error','Return date is required.'); return; }
  const res = await api('POST', '/api/issues/' + id + '/return', { return_date, return_remarks });
  if (res.success) {
    populatePayFine(res);
    showScreen('pay-fine');
  } else {
    setError('rb-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  PAY FINE
// ══════════════════════════════════════════════════════
async function populatePayFine(returnRes) {
  const issue = await api('GET', '/api/issues/' + returnRes.issue_id);
  $('pf-issue-id').value = issue.id;
  $('pf-book').value = issue.book_title;
  $('pf-author').value = issue.book_author;
  $('pf-serial').value = issue.serial_no;
  $('pf-member').value = issue.member_name;
  $('pf-issue-date').value = fmtDate(issue.issue_date);
  $('pf-return-date').value = fmtDate(issue.return_date);
  const due = new Date(issue.due_date);
  const ret = new Date(issue.return_date);
  const days = Math.max(0, Math.ceil((ret - due) / 86400000));
  $('pf-days').value = days > 0 ? days + ' day(s)' : 'On time';
  $('pf-fine').value = issue.fine_amount > 0 ? '₹' + issue.fine_amount : '₹0 (No fine)';
  $('pf-paid').checked = false;
  $('pf-remarks').value = issue.return_remarks || '';
  clearMsg('pf-error');
  if (issue.fine_amount <= 0) {
    $('pf-info').textContent = 'No fine applicable. You can confirm the return directly.';
    showEl('pf-info');
  } else {
    hideEl('pf-info');
  }
}

async function submitPayFine() {
  clearMsg('pf-error');
  const id = $('pf-issue-id').value;
  const fine_paid = $('pf-paid').checked;
  const remarks = $('pf-remarks').value.trim();
  const res = await api('POST', '/api/issues/' + id + '/pay-fine', { fine_paid, remarks });
  if (res.success) {
    alert('Book return completed successfully!');
    showScreen('transactions');
  } else {
    setError('pf-error', res.message);
  }
}

// ══════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════
const REPORT_CONFIG = {
  'active-issues': { title: 'Active Issues', cols: ['Serial No','Book','Author','Member','Issue Date','Due Date','Status'] },
  'overdue': { title: 'Overdue Returns', cols: ['Serial No','Book','Author','Member','Due Date','Days Overdue'] },
  'memberships': { title: 'Master List: Memberships', cols: ['Membership No','Name','Email','Phone','Type','Expiry','Status'] },
  'books': { title: 'Master List: Books', cols: ['Title','Author','Category','Publisher','Year','Available'] },
  'movies': { title: 'Master List: Movies', cols: ['Title','Director','Category','Studio','Year','Available'] },
  'pending': { title: 'Pending Issues Request', cols: ['Serial No','Book','Member','Issue Date','Due Date'] },
};

async function loadReport(type) {
  const cfg = REPORT_CONFIG[type];
  $('report-view-title').textContent = cfg.title;
  $('report-view-heading').textContent = cfg.title;
  showScreen('report-view');

  const data = await api('GET', '/api/reports/' + type);
  const t = today();

  let rows = '';
  if (!data.length) {
    rows = `<tr><td colspan="${cfg.cols.length}" class="no-data">No records found.</td></tr>`;
  } else if (type === 'active-issues') {
    rows = data.map(i => {
      const od = i.due_date < t;
      return `<tr>
        <td>${i.serial_no}</td><td>${i.book_title}</td><td>${i.book_author}</td><td>${i.member_name}</td>
        <td>${fmtDate(i.issue_date)}</td><td>${fmtDate(i.due_date)}</td>
        <td><span class="badge ${od?'badge-red':'badge-blue'}">${od?'Overdue':'Issued'}</span></td>
      </tr>`;
    }).join('');
  } else if (type === 'overdue') {
    rows = data.map(i => {
      const days = Math.ceil((new Date(t)-new Date(i.due_date))/86400000);
      return `<tr>
        <td>${i.serial_no}</td><td>${i.book_title}</td><td>${i.book_author}</td><td>${i.member_name}</td>
        <td>${fmtDate(i.due_date)}</td><td><span class="badge badge-red">${days} day(s)</span></td>
      </tr>`;
    }).join('');
  } else if (type === 'memberships') {
    rows = data.map(m => `<tr>
      <td>${m.membership_no}</td><td>${m.name}</td><td>${m.email}</td><td>${m.phone||'-'}</td>
      <td>${m.membership_type}</td><td>${m.expiry_date||'-'}</td>
      <td><span class="badge ${m.status==='active'?'badge-green':'badge-gray'}">${m.status}</span></td>
    </tr>`).join('');
  } else if (type === 'books' || type === 'movies') {
    rows = data.map(b => `<tr>
      <td>${b.title}</td><td>${b.author}</td><td>${b.category||'-'}</td>
      <td>${b.publisher||'-'}</td><td>${b.year||'-'}</td>
      <td><span class="badge ${b.available?'badge-green':'badge-red'}">${b.available?'Yes':'No'}</span></td>
    </tr>`).join('');
  } else if (type === 'pending') {
    rows = data.map(i => `<tr>
      <td>${i.serial_no}</td><td>${i.book_title}</td><td>${i.member_name}</td>
      <td>${fmtDate(i.issue_date)}</td><td>${fmtDate(i.due_date)}</td>
    </tr>`).join('');
  }

  $('report-table-wrap').innerHTML = `
    <table>
      <thead><tr>${cfg.cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

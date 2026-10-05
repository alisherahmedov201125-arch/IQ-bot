/* global Telegram, Tesseract */
const TG = window.Telegram && window.Telegram.WebApp;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const state = {
  user: null,
  tests: [],
  history: [],
  adminTests: [],
  test: null,
  selected: null,
  revealed: null,
  variantRows: [],
};

let imageDataUrl = null;

/* ================= Yordamchilar ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, method = 'GET', body = null) {
  const headers = {};
  if (TG && TG.initData) headers['x-telegram-init-data'] = TG.initData;
  let payload;
  if (body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

let toastTimer;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function formatDate(ts) {
  try {
    return new Date(Number(ts) * 1000).toLocaleString('uz-UZ',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function emptyHtml(ico, title, sub) {
  return `<div class="empty"><div class="e-ico">${ico}</div><div class="e-title">${title}</div><div class="e-sub">${sub || ''}</div></div>`;
}

function confetti() {
  const colors = ['#6a11cb', '#2575fc', '#ff6ec4', '#ffd166', '#06d6a0'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.4) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3400);
  }
}

/* ================= Router ================= */
function go(name, param) {
  location.hash = '#/' + name + (param ? '/' + param : '');
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, param] = hash.split('/');
  switch (name) {
    case 'test': if (param) openTest(param); else showScreen('home'); break;
    case 'history': showScreen('history'); break;
    case 'admin': showScreen('admin'); break;
    case 'add': showScreen('add'); break;
    default: showScreen('home');
  }
}

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $('#screen-' + name);
  if (el) el.classList.add('active');
  $('#tabbar').style.display = (name === 'test' || name === 'add') ? 'none' : 'flex';
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === name));
  if (name === 'home') loadTests();
  if (name === 'history') loadHistory();
  if (name === 'admin') loadAdminTests();
  if (name === 'add') resetAddForm();
  window.scrollTo(0, 0);
}

/* ================= Bosh sahifa ================= */
async function loadTests() {
  try { state.tests = await api('/api/tests'); renderTests(); }
  catch (e) { toast(e.message); }
}

function renderTests() {
  const wrap = $('#tests-list');
  if (!state.tests.length) {
    wrap.innerHTML = emptyHtml('📭', "Hali testlar yo'q", 'Admin yangi test qo\'shgandan keyin ko\'rinadi');
    return;
  }
  wrap.innerHTML = state.tests.map((t, i) => `
    <div class="card test-card" style="animation-delay:${i * 40}ms" onclick="openTest(${t.id})">
      ${t.image
        ? `<div class="test-thumb"><img src="${t.image}" alt=""/></div>`
        : `<div class="test-thumb">📝</div>`}
      <div class="test-body">
        <div class="test-q">${esc(t.question) || '(rasmli savol)'}</div>
        <div class="test-meta">${t.variants_count} ta variant · ${formatDate(t.created_at)}</div>
      </div>
      <button class="btn-play">▶</button>
    </div>`).join('');
}

/* ================= Test yechish ================= */
async function openTest(id) {
  try {
    state.test = await api('/api/tests/' + id);
    state.selected = null;
    state.revealed = null;
    renderTest();
    showScreen('test');
  } catch (e) { toast(e.message); go('home'); }
}

function renderTest() {
  const t = state.test;
  const wrap = $('#test-image-wrap');
  wrap.innerHTML = t.image ? `<img src="${t.image}" class="test-img" alt="Rasm"/>` : '';
  wrap.style.display = t.image ? '' : 'none';
  $('#test-question').textContent = t.question;

  $('#variants-list').innerHTML = t.variants.map((v, i) => {
    let cls = 'variant';
    if (state.revealed) {
      if (i === state.revealed.correctIndex) cls += ' correct-reveal';
      else if (i === state.revealed.selected) cls += ' wrong-reveal';
    } else if (state.selected === i) cls += ' selected';
    return `<button class="${cls}" ${state.revealed ? 'disabled' : ''} onclick="selectVariant(${i})">
      <span class="v-letter">${LETTERS[i] || '?'}</span>
      <span class="v-text">${esc(v)}</span>
    </button>`;
  }).join('');

  $('#submit-answer-btn').disabled = state.selected == null || !!state.revealed;
}

function selectVariant(i) {
  if (state.revealed) return;
  state.selected = i;
  renderTest();
}

async function submitAnswer() {
  if (state.selected == null) return;
  const btn = $('#submit-answer-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Yuborilmoqda...';
  try {
    const r = await api(`/api/tests/${state.test.id}/submit`, 'POST', { answer: state.selected });
    state.revealed = { correctIndex: r.correctIndex, selected: state.selected };
    renderTest();
    showResult(r);
  } catch (e) { toast(e.message); }
  finally { btn.textContent = 'Javobni yuborish'; }
}

function showResult(r) {
  $('#modal-emoji').textContent = r.correct ? '🎉' : '💫';
  $('#modal-title').textContent = r.correct ? "To'g'ri javob!" : "Noto'g'ri...";
  $('#modal-sub').textContent = r.correct
    ? "Ajoyib! To'g'ri javob topdingiz."
    : `To'g'ri javob: ${LETTERS[r.correctIndex]}`;
  $('#modal-answer').innerHTML = `<b>To'g'ri javob:</b><br/>${esc(r.correctVariant)}`;
  $('#modal').classList.remove('hidden');
  if (r.correct) confetti();
}

function closeModal() { $('#modal').classList.add('hidden'); }

function nextRandomTest() {
  closeModal();
  const pool = state.tests.filter(t => state.test && t.id !== state.test.id);
  const list = pool.length ? pool : state.tests;
  if (!list.length) return go('home');
  openTest(list[Math.floor(Math.random() * list.length)].id);
}

/* ================= Tarix ================= */
async function loadHistory() {
  try { state.history = await api('/api/results'); renderHistory(); }
  catch (e) { toast(e.message); }
}

function renderHistory() {
  const wrap = $('#history-list');
  if (!state.history.length) {
    wrap.innerHTML = emptyHtml('📭', "Hali hech narsa yechilmagan", "Testlarni yeching — natijalar shu yerda saqlanadi");
    return;
  }
  wrap.innerHTML = state.history.map((r, i) => {
    const your = r.variants?.[r.answers?.answer] ?? '—';
    const correct = r.variants?.[r.correct_index] ?? '—';
    return `<div class="card result-card" style="animation-delay:${i * 30}ms">
      <div class="result-emoji">${r.correct ? '✅' : '❌'}</div>
      <div class="result-body">
        <div class="result-q">${esc(r.question) || '(rasmli savol)'}</div>
        <div class="result-meta">${formatDate(r.finished_at)}</div>
        <div class="result-ans">Siz: <span class="${r.correct ? 'ok' : 'bad'}">${esc(your)}</span> · To'g'ri: <span class="ok">${esc(correct)}</span></div>
      </div>
    </div>`;
  }).join('');
}

/* ================= Admin ================= */
async function loadAdminTests() {
  if (!state.user?.is_admin) return;
  try { state.adminTests = await api('/api/admin/tests'); renderAdminTests(); }
  catch (e) { toast(e.message); }
}

function renderAdminTests() {
  const wrap = $('#admin-tests-list');
  if (!state.adminTests.length) {
    wrap.innerHTML = emptyHtml('📭', "Testlar yo'q", '“Yangi test qo\'shish” orqali qo\'shing');
    return;
  }
  wrap.innerHTML = state.adminTests.map((t, i) => `
    <div class="card result-card" style="animation-delay:${i * 30}ms">
      <div class="result-body">
        <div class="result-q">${esc(t.question)}</div>
        <div class="result-meta">${t.variants.length} variant · To'g'ri: ${LETTERS[t.correct_index] || '?'} · ${formatDate(t.created_at)}</div>
      </div>
      <button class="icon-btn" onclick="deleteTest(${t.id})" title="O'chirish">🗑</button>
    </div>`).join('');
}

async function deleteTest(id) {
  if (!confirm("Test o'chirilsinmi?")) return;
  try {
    await api('/api/admin/tests/' + id, 'DELETE');
    toast("O'chirildi ✅");
    loadAdminTests();
    loadTests();
  } catch (e) { toast(e.message); }
}

/* ================= Test qo'shish (admin) ================= */
function bindAddScreen() {
  const dz = $('#dropzone');
  dz.addEventListener('click', () => $('#file-input').click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    handleFile(e.dataTransfer && e.dataTransfer.files[0]);
  });
  $('#file-input').addEventListener('change', e => handleFile(e.target.files && e.target.files[0]));
}

function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Iltimos, rasm tanlang');
  const reader = new FileReader();
  reader.onload = e => {
    imageDataUrl = e.target.result;
    $('#preview-img').src = imageDataUrl;
    $('#preview-wrap').style.display = '';
    runOcr(); // rasm yuklangach — avtomatik OCR
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  imageDataUrl = null;
  $('#file-input').value = '';
  $('#preview-wrap').style.display = 'none';
}

/* ===== OCR: rasmdan matn o'qib, variantlarni avtomatik to'g'irlash ===== */
function parseVariants(text) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const variants = [];
  const rest = [];
  const re = /^([A-DА-Да-д]|\d{1,2})\s*[).:–—-]\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m && variants.length < 8 && m[2].length > 0 && m[2].length < 200) {
      variants.push(m[2].replace(/\s+/g, ' ').trim());
    } else {
      rest.push(line);
    }
  }
  return { variants, question: rest.join(' ').slice(0, 500) };
}

async function runOcr() {
  if (!imageDataUrl) return toast("Avval rasm yuklang");
  if (!window.Tesseract) return toast("OCR kutubxonasi yuklanmadi");
  const status = $('#ocr-status'), bar = $('#ocr-bar'), prog = $('#ocr-progress'), btn = $('#ocr-btn');
  btn.disabled = true;
  prog.classList.add('on');
  status.textContent = "⏳ Rasm o'qilmoqda...";
  try {
    let data;
    try {
      ({ data } = await Tesseract.recognize(imageDataUrl, 'uz+eng', {
        logger: m => { if (m.status === 'recognizing text') bar.style.width = Math.round(m.progress * 100) + '%'; }
      }));
    } catch (_) {
      ({ data } = await Tesseract.recognize(imageDataUrl, 'eng'));
    }
    const text = (data.text || '').trim();
    if (!text) { status.textContent = "Matn topilmadi ❌ — qo'lda kiriting"; return; }
    const parsed = parseVariants(text);
    if (parsed.variants.length) buildVariantRows(parsed.variants);
    if (parsed.question && !$('#question-input').value.trim()) $('#question-input').value = parsed.question;
    status.textContent = `✅ Matn o'qildi: ${parsed.variants.length} ta variant topildi`;
    toast('OCR yakunlandi ✅');
  } catch (e) {
    console.error(e);
    status.textContent = "OCR xatosi — qo'lda kiriting";
  } finally {
    btn.disabled = false;
    setTimeout(() => prog.classList.remove('on'), 800);
  }
}

/* ===== Variant qatorlari ===== */
function buildVariantRows(list) {
  state.variantRows = list.map((text, i) => ({ text, correct: i === 0 }));
  renderVariantRows();
}
function addVariantRow() {
  if (state.variantRows.length >= 8) return toast('Maksimal 8 ta variant');
  state.variantRows.push({ text: '', correct: false });
  renderVariantRows();
}
function removeVariant(i) {
  state.variantRows.splice(i, 1);
  if (!state.variantRows.some(r => r.correct) && state.variantRows.length) state.variantRows[0].correct = true;
  renderVariantRows();
}
function setCorrect(i) {
  state.variantRows.forEach((r, j) => r.correct = (j === i));
  renderVariantRows();
}
function setVariantText(i, val) { state.variantRows[i].text = val; }

function renderVariantRows() {
  $('#variants-wrap').innerHTML = state.variantRows.map((row, i) => `
    <div class="variant-row">
      <label class="correct-check" title="To'g'ri javobni belgilash">
        <input type="radio" name="correct-answer" ${row.correct ? 'checked' : ''} onchange="setCorrect(${i})"/>
        <span class="v-letter">${LETTERS[i]}</span>
      </label>
      <input class="variant-input" value="${esc(row.text)}" placeholder="Variant ${LETTERS[i]}" oninput="setVariantText(${i}, this.value)"/>
      <button class="icon-btn" onclick="removeVariant(${i})" title="O'chirish">✕</button>
    </div>`).join('');
}

async function saveTest() {
  const question = $('#question-input').value.trim();
  const variants = state.variantRows.map(r => r.text.trim()).filter(Boolean);
  const ci = state.variantRows.findIndex(r => r.correct);
  if (!question) return toast('Savolni yozing');
  if (variants.length < 2) return toast("Kamida 2 ta to'ldirilgan variant kerak");
  if (ci < 0) return toast("To'g'ri javobni tanlang (radio)");

  const btn = $('#save-test-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Saqlanmoqda...';
  try {
    await api('/api/admin/tests', 'POST', { imageDataUrl, question, variants, correctIndex: ci });
    toast('Test saqlandi ✅');
    go('admin');
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = '💾 Testni saqlash'; }
}

function resetAddForm() {
  imageDataUrl = null;
  $('#file-input').value = '';
  $('#preview-wrap').style.display = 'none';
  $('#question-input').value = '';
  $('#ocr-status').textContent = '';
  $('#ocr-bar').style.width = '0%';
  state.variantRows = [0, 1, 2, 3].map(() => ({ text: '', correct: false }));
  state.variantRows[0].correct = true;
  renderVariantRows();
}

/* ================= User ================= */
function renderUser() {
  const name = state.user.first_name || state.user.username || 'User';
  $('#user-chip').innerHTML =
    `<span class="avatar">${esc((name[0] || 'U').toUpperCase())}</span><span>${esc(name)}</span>` +
    (state.user.is_admin ? '<span title="Admin">👑</span>' : '');
  $('#hero-title').textContent = `Salom, ${name}! 👋`;
  $$('.admin-only').forEach(el => el.style.display = state.user.is_admin ? '' : 'none');
}

/* ================= Init ================= */
async function init() {
  TG?.ready();
  TG?.expand();

  try {
    const data = await api('/api/auth', 'POST', { initData: TG?.initData || '' });
    state.user = data.user;
  } catch (e) {
    $('#app').innerHTML = `
      <div class="auth-error">
        <div class="e-ico">🔒</div>
        <h2>Bot orqali oching</h2>
        <p>Bu mini ilovani faqat Telegram bot orqali ocha olasiz.</p>
        <a class="btn-primary" style="max-width:240px" href="https://t.me/${(window.__CONFIG__ || {}).botUsername || ''}">Botni ochish</a>
      </div>`;
    return;
  }

  renderUser();
  bindAddScreen();
  route();
  window.addEventListener('hashchange', route);
}

init();

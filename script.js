// ============================================
// CURIOUS AI — script.js
// Firebase Auth + Firestore + Groq AI
// ============================================

// ════════════════════════════════════════════
// 🔧 FIREBASE CONFIG — PASTE YOUR VALUES HERE
// ════════════════════════════════════════════
// Go to: Firebase Console → Project Settings → Your Apps → SDK Setup
// Copy the firebaseConfig object and replace the values below.

import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
                                      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp }
                                      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─────────────────────────────────────────────
// 🔑 STEP 1: Replace with your Firebase config
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC0WqLJc1SevNsKcys52kBWk0iAmP14YSA",
  authDomain: "curiousanalyzer-37d86.firebaseapp.com",
  projectId: "curiousanalyzer-37d86",
  storageBucket: "curiousanalyzer-37d86.firebasestorage.app",
  messagingSenderId: "338840812428",
  appId: "1:338840812428:web:f62166ed39dbb17facb4a9"
};

// ── CONFIG ────────────────────────────────
// Groq API key is stored securely in Vercel Environment Variables.
// The frontend calls /api/analyze (our serverless proxy) — never Groq directly.

// ════════════════════════════════════════════
// FIREBASE INIT
// ════════════════════════════════════════════
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Firestore collection name
const HISTORY_COLLECTION = 'analyses';

// ════════════════════════════════════════════
// PDF.js
// ════════════════════════════════════════════
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let uploadedFile    = null;
let chartInstance   = null;
let currentUser     = null;
let cachedHistory   = []; // in-memory cache from Firestore

// ════════════════════════════════════════════
// DOM REFS
// ════════════════════════════════════════════
const html              = document.documentElement;
const mainNavbar        = document.getElementById('main-navbar');
const navUserEmail      = document.getElementById('nav-user-email');
const themeToggle       = document.getElementById('theme-toggle');
const logoutBtn         = document.getElementById('logout-btn');

const loginBtn          = document.getElementById('login-btn');
const loginBtnText      = document.getElementById('login-btn-text');
const loginSpinner      = document.getElementById('login-spinner');
const loginEmail        = document.getElementById('login-email');
const loginPassword     = document.getElementById('login-password');
const loginError        = document.getElementById('login-error');
const togglePw          = document.getElementById('toggle-pw');

const dropZone          = document.getElementById('drop-zone');
const pdfInput          = document.getElementById('pdf-input');
const fileNameDisp      = document.getElementById('file-name-display');
const analyzeBtn        = document.getElementById('analyze-btn');
const historyBtn        = document.getElementById('history-btn');
const historyCount      = document.getElementById('history-count');
const historyBackBtn    = document.getElementById('history-back-btn');
const clearHistoryBtn   = document.getElementById('clear-history-btn');
const historyGrid       = document.getElementById('history-grid');
const historyEmpty      = document.getElementById('history-empty');
const restartBtn        = document.getElementById('restart-btn');
const backToHistoryBtn  = document.getElementById('back-to-history-btn');

// ════════════════════════════════════════════
// SCREEN SWITCHING
// ════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════
const savedTheme = localStorage.getItem('curiousai-theme') || 'light';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('curiousai-theme', next);
  if (chartInstance) chartInstance.update();
});

// ════════════════════════════════════════════
// AUTH — Firebase onAuthStateChanged
// ════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ── Logged in ──
    currentUser = user;
    mainNavbar.style.display = 'flex';
    navUserEmail.textContent = user.email;
    await loadHistoryFromFirestore();
    updateHistoryCount();
    showScreen('upload-screen');
  } else {
    // ── Not logged in ──
    currentUser = null;
    mainNavbar.style.display = 'none';
    showScreen('login-screen');
  }
});

// ════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════
loginBtn.addEventListener('click', handleLogin);

loginEmail.addEventListener('keydown', e => { if (e.key === 'Enter') loginPassword.focus(); });
loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

// Show/hide password
togglePw.addEventListener('click', () => {
  const isText = loginPassword.type === 'text';
  loginPassword.type = isText ? 'password' : 'text';
  togglePw.innerHTML = isText
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
         <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="1.8"/>
         <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
       </svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
         <path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0121.49 14.54M6.53 6.53C5.57 7.46 4.77 8.67 4.13 10M3 3L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
       </svg>`;
});

async function handleLogin() {
  const email    = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showLoginError('Please enter both email and password.');
    return;
  }

  setLoginLoading(true);
  hideLoginError();

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle the rest
  } catch (err) {
    setLoginLoading(false);
    const msg = firebaseErrorMessage(err.code);
    showLoginError(msg);
  }
}

function setLoginLoading(loading) {
  loginBtn.disabled = loading;
  loginBtn.classList.toggle('loading', loading);
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.add('visible');
}

function hideLoginError() {
  loginError.classList.remove('visible');
}

function firebaseErrorMessage(code) {
  const map = {
    'auth/user-not-found':      'No admin account found with this email.',
    'auth/wrong-password':      'Incorrect password. Please try again.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/too-many-requests':   'Too many failed attempts. Please wait a moment.',
    'auth/invalid-credential':  'Invalid email or password.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return map[code] || 'Sign in failed. Please check your credentials.';
}

// ════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════
logoutBtn.addEventListener('click', async () => {
  if (confirm('Sign out of Curious AI?')) {
    await signOut(auth);
    cachedHistory = [];
    // onAuthStateChanged → shows login screen
  }
});

// ════════════════════════════════════════════
// FIRESTORE — History
// ════════════════════════════════════════════

// Load all analyses for current user from Firestore
async function loadHistoryFromFirestore() {
  if (!currentUser) return;
  try {
    const col = collection(db, 'admins', currentUser.uid, HISTORY_COLLECTION);
    const q   = query(col, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    cachedHistory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Firestore load error:', err);
    cachedHistory = [];
  }
}

// Save one analysis to Firestore
async function saveToFirestore(pdfData, ai) {
  if (!currentUser) return;
  try {
    // Use name+email as doc ID so duplicates overwrite
    const docId = btoa(`${pdfData.name}__${pdfData.email}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 40);
    const ref   = doc(db, 'admins', currentUser.uid, HISTORY_COLLECTION, docId);

    const entry = {
      id:        docId,
      date:      new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time:      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      createdAt: serverTimestamp(),
      pdfData,
      ai
    };

    await setDoc(ref, entry);

    // Update cache
    const idx = cachedHistory.findIndex(h => h.id === docId);
    if (idx >= 0) cachedHistory[idx] = entry;
    else cachedHistory.unshift(entry);

    return entry;
  } catch (err) {
    console.error('Firestore save error:', err);
    // Fallback to localStorage so analysis isn't lost
    saveToLocalStorage(pdfData, ai);
  }
}

// Clear all Firestore docs for current user
async function clearFirestoreHistory() {
  if (!currentUser) return;
  try {
    const col  = collection(db, 'admins', currentUser.uid, HISTORY_COLLECTION);
    const snap = await getDocs(col);
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
    cachedHistory = [];
  } catch (err) {
    console.error('Firestore clear error:', err);
  }
}

// ── localStorage fallback ─────────────────
function saveToLocalStorage(pdfData, ai) {
  try {
    const history = JSON.parse(localStorage.getItem('curiousai-history') || '[]');
    const entry = {
      id:   Date.now().toString(),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      pdfData, ai
    };
    const idx = history.findIndex(h => h.pdfData?.name === pdfData.name && h.pdfData?.email === pdfData.email);
    if (idx >= 0) history[idx] = entry; else history.unshift(entry);
    if (history.length > 50) history.pop();
    localStorage.setItem('curiousai-history', JSON.stringify(history));
  } catch (_) {}
}

function updateHistoryCount() {
  historyCount.textContent = cachedHistory.length;
}

// ════════════════════════════════════════════
// UPLOAD INTERACTIONS
// ════════════════════════════════════════════
dropZone.addEventListener('click', () => pdfInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') handleFile(file);
});
pdfInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  uploadedFile = file;
  fileNameDisp.textContent = `📄 ${file.name}`;
  analyzeBtn.disabled = false;
}

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════
historyBtn.addEventListener('click', () => {
  renderHistoryScreen();
  showScreen('history-screen');
});

historyBackBtn.addEventListener('click', () => showScreen('upload-screen'));

backToHistoryBtn.addEventListener('click', () => {
  renderHistoryScreen();
  showScreen('history-screen');
});

restartBtn.addEventListener('click', () => {
  uploadedFile = null;
  pdfInput.value = '';
  fileNameDisp.textContent = 'No file selected';
  analyzeBtn.disabled = true;
  showScreen('upload-screen');
});

clearHistoryBtn.addEventListener('click', async () => {
  if (!confirm('Delete all saved analyses from Firestore? This cannot be undone.')) return;
  clearHistoryBtn.textContent = '🗑 Deleting...';
  clearHistoryBtn.disabled = true;
  await clearFirestoreHistory();
  localStorage.removeItem('curiousai-history');
  updateHistoryCount();
  renderHistoryScreen();
  clearHistoryBtn.textContent = '🗑 Clear All';
  clearHistoryBtn.disabled = false;
});

// ════════════════════════════════════════════
// ANALYZE
// ════════════════════════════════════════════
analyzeBtn.addEventListener('click', async () => {
  if (!uploadedFile || !currentUser) return;
  showScreen('loading-screen');
  runLoadingAnimation();

  try {
    const pdfData = await parsePDF(uploadedFile);
    advanceStep(2);
    const result  = await callGroq(pdfData);
    advanceStep(3);
    await saveToFirestore(pdfData, result);
    updateHistoryCount();
    await delay(500);
    advanceStep(4);
    await delay(700);
    renderDashboard(pdfData, result);
    showScreen('results-screen');
  } catch (err) {
    alert('Error: ' + err.message);
    showScreen('upload-screen');
  }
});

// ════════════════════════════════════════════
// PDF PARSING
// ════════════════════════════════════════════
async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }
  return extractStructuredData(fullText);
}

function extractStructuredData(text) {
  const nameMatch  = text.match(/Student:\s*([^|]+)\|/);
  const ageMatch   = text.match(/Age:\s*(\d+)/);
  const phoneMatch = text.match(/Phone:\s*([\d]+)/);
  const emailMatch = text.match(/Email:\s*([\w.@]+)/);

  const name  = nameMatch  ? nameMatch[1].trim()  : 'Unknown Student';
  const age   = ageMatch   ? ageMatch[1].trim()   : '—';
  const phone = phoneMatch ? phoneMatch[1].trim()  : '—';
  const email = emailMatch ? emailMatch[1].trim()  : '—';

  const answers = {};
  const questionMatches = text.matchAll(/Selected Answer:\s*([A-D—–-])\s*[—–-]?/g);
  let qNum = 1;
  for (const match of questionMatches) {
    const raw = match[1].trim();
    answers[`Q${qNum}`] = ['A','B','C','D'].includes(raw) ? raw : null;
    qNum++;
  }
  if (Object.keys(answers).length < 5) {
    let n = 1;
    for (const m of text.matchAll(/Selected Answer:\s*([A-D])\s*[—–]/g)) {
      answers[`Q${n}`] = m[1]; n++;
    }
  }
  return { name, age, phone, email, answers, rawText: text.substring(0, 3000) };
}

// ════════════════════════════════════════════
// GROQ API — via Vercel serverless proxy
// Key never touches the browser
// ════════════════════════════════════════════
async function callGroq(data) {
  const response = await fetch('/api/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ pdfData: data })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Analysis failed');
  }

  return response.json();
}

// ════════════════════════════════════════════
// LOADING ANIMATION
// ════════════════════════════════════════════
function runLoadingAnimation() {
  for (let i = 1; i <= 4; i++) document.getElementById(`step${i}`).classList.remove('active','done');
  document.getElementById('step1').classList.add('active');
  setBar(15);
}

function advanceStep(n) {
  for (let i = 1; i < n; i++) {
    document.getElementById(`step${i}`).classList.remove('active');
    document.getElementById(`step${i}`).classList.add('done');
  }
  document.getElementById(`step${n}`).classList.add('active');
  setBar(n * 25);
}

function setBar(pct) { document.getElementById('loading-bar').style.width = `${pct}%`; }

// ════════════════════════════════════════════
// HISTORY SCREEN
// ════════════════════════════════════════════
const STREAM_COLORS = { Arts: '#EC4899', Commerce: '#F59E0B', PCM: '#3B82F6', PCB: '#10B981' };
const STREAM_ICONS  = { Arts: '🎨', Commerce: '📈', PCM: '⚙️', PCB: '🔬' };

function getStreamKey(name) {
  if (!name) return 'Arts';
  if (name.includes('PCM')) return 'PCM';
  if (name.includes('PCB')) return 'PCB';
  if (name.toLowerCase().includes('commerce')) return 'Commerce';
  return 'Arts';
}

function renderHistoryScreen() {
  historyGrid.innerHTML = '';
  if (cachedHistory.length === 0) {
    historyEmpty.classList.add('visible');
    historyGrid.style.display = 'none';
  } else {
    historyEmpty.classList.remove('visible');
    historyGrid.style.display = 'grid';
    cachedHistory.forEach((entry, i) => historyGrid.appendChild(buildHistoryCard(entry, i)));
  }
}

function buildHistoryCard(entry, idx) {
  const { pdfData, ai, date, time, id } = entry;
  const streamKey  = getStreamKey(ai.recommended_stream);
  const breakdown  = ai.interest_breakdown || {};
  const confPct    = Math.round((ai.confidence_score || 0) * 100);
  const careers    = (ai.recommended_careers || []).slice(0, 3);
  const avatar     = pdfData.name?.charAt(0)?.toUpperCase() || 'S';

  const barsHTML = Object.entries(breakdown).map(([label, val]) => `
    <div class="hbar-row">
      <span class="hbar-label">${label}</span>
      <div class="hbar-track">
        <div class="hbar-fill" style="width:${val}%;background:${STREAM_COLORS[label]||'#aaa'}"></div>
      </div>
      <span class="hbar-val">${val}%</span>
    </div>`).join('');

  const careersHTML = careers.map(c => `<span class="hcard-career">${c}</span>`).join('');

  const card = document.createElement('div');
  card.className = 'hcard';
  card.style.animationDelay = `${idx * 0.06}s`;
  card.dataset.id = id;

  card.innerHTML = `
    <!-- Delete button -->
    <button class="hcard-delete" title="Delete this analysis">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M3 6H21M8 6V4H16V6M19 6L18.1 19.1C18 20.2 17.1 21 16 21H8C6.9 21 6 20.2 5.9 19.1L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 11V17M14 11V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>

    <div class="hcard-top">
      <div class="hcard-avatar">${avatar}</div>
      <div class="hcard-info">
        <div class="hcard-name">${pdfData.name}</div>
        <div class="hcard-meta">Age ${pdfData.age} · ${pdfData.email}</div>
      </div>
      <div class="hcard-stream-badge">${STREAM_ICONS[streamKey]} ${ai.recommended_stream || 'Arts'}</div>
    </div>
    <div class="hcard-divider"></div>
    <div class="hcard-bars">${barsHTML}</div>
    <div class="hcard-personality">${ai.personality || 'Creative Thinker'}</div>
    <div class="hcard-careers">${careersHTML}</div>
    <div class="hcard-footer">
      <span class="hcard-date">📅 ${date} · ${time} · ${confPct}% confidence <span class="sync-dot" title="Synced to Firestore"></span></span>
      <span class="hcard-arrow">→</span>
    </div>`;

  // ── Open dashboard on card click (but not on delete btn)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.hcard-delete')) return;
    renderDashboard(pdfData, ai);
    showScreen('results-screen');
  });

  // ── Delete single card
  card.querySelector('.hcard-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    card.classList.add('deleting');
    await delay(350); // wait for CSS animation
    await deleteSingleAnalysis(id, card);
  });

  return card;
}

// ── Delete one analysis from Firestore + cache ─
async function deleteSingleAnalysis(id, cardEl) {
  // Remove from Firestore
  if (currentUser) {
    try {
      const ref = doc(db, 'admins', currentUser.uid, HISTORY_COLLECTION, id);
      await deleteDoc(ref);
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  // Remove from localStorage fallback too
  try {
    const ls = JSON.parse(localStorage.getItem('curiousai-history') || '[]');
    const updated = ls.filter(h => h.id !== id);
    localStorage.setItem('curiousai-history', JSON.stringify(updated));
  } catch (_) {}

  // Remove from cache
  cachedHistory = cachedHistory.filter(h => h.id !== id);
  updateHistoryCount();

  // Remove the card from DOM
  cardEl?.remove();

  // Show empty state if no cards left
  if (cachedHistory.length === 0) {
    historyEmpty.classList.add('visible');
    historyGrid.style.display = 'none';
  }
}

// ════════════════════════════════════════════
// RESULTS DASHBOARD
// ════════════════════════════════════════════
function renderDashboard(pdfData, ai) {
  document.getElementById('profile-name').textContent   = pdfData.name;
  document.getElementById('profile-age').textContent    = `Age: ${pdfData.age}`;
  document.getElementById('profile-email').textContent  = `✉ ${pdfData.email}`;
  document.getElementById('profile-phone').textContent  = `📞 ${pdfData.phone}`;
  document.getElementById('profile-avatar').textContent = pdfData.name?.charAt(0)?.toUpperCase() || 'S';

  backToHistoryBtn.style.display = cachedHistory.length > 0 ? 'inline-flex' : 'none';

  const streamKey = getStreamKey(ai.recommended_stream);
  document.getElementById('stream-icon').textContent       = STREAM_ICONS[streamKey] || '🎓';
  document.getElementById('stream-name').textContent       = ai.recommended_stream?.toUpperCase() || 'ARTS';
  document.getElementById('personality-badge').textContent = ai.personality || 'Creative Thinker';

  const confPct = Math.round((ai.confidence_score || 0.88) * 100);
  document.getElementById('conf-value').textContent = `${confPct}%`;
  document.getElementById('conf-bar').style.width   = '0%';
  setTimeout(() => { document.getElementById('conf-bar').style.width = `${confPct}%`; }, 300);

  renderChart(ai.interest_breakdown || { Arts: 70, Commerce: 10, PCM: 10, PCB: 10 });

  const careersGrid  = document.getElementById('careers-grid');
  careersGrid.innerHTML = '';
  const careerEmojis = ['🎬','🎨','🧠','⚖️','✍️','🏗️','💊','📊','🎵','📸','🌍','💡'];
  (ai.recommended_careers || []).forEach((career, i) => {
    const chip = document.createElement('div');
    chip.className = 'career-chip';
    chip.style.animationDelay = `${0.1 + i * 0.08}s`;
    chip.innerHTML = `<span>${careerEmojis[i % careerEmojis.length]}</span> ${career}`;
    careersGrid.appendChild(chip);
  });

  const strengthsList = document.getElementById('strengths-list');
  strengthsList.innerHTML = '';
  const strengthEmojis = ['⚡','🎯','💬','🌟','🔥','💎','🚀','✨'];
  (ai.strengths || []).forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'strength-item';
    item.style.animationDelay = `${0.1 + i * 0.1}s`;
    item.innerHTML = `<div class="strength-icon">${strengthEmojis[i % strengthEmojis.length]}</div>${s}`;
    strengthsList.appendChild(item);
  });

  document.getElementById('reasoning-text').textContent = ai.reasoning || '';

  const counts    = ai.answer_counts || countAnswers(pdfData.answers);
  const summaryEl = document.getElementById('answer-summary');
  summaryEl.innerHTML = '';
  [
    { val: counts.D || 0, label: 'Arts (D)' },
    { val: counts.C || 0, label: 'Commerce (C)' },
    { val: counts.A || 0, label: 'PCM (A)' },
    { val: counts.B || 0, label: 'PCB (B)' }
  ].forEach(s => {
    const stat = document.createElement('div');
    stat.className = 'answer-stat';
    stat.innerHTML = `<div class="answer-stat-val">${s.val}</div><div class="answer-stat-label">${s.label}</div>`;
    summaryEl.appendChild(stat);
  });
}

function countAnswers(answers) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(answers || {}).forEach(v => { if (v && counts[v] !== undefined) counts[v]++; });
  return counts;
}

function renderChart(breakdown) {
  if (chartInstance) chartInstance.destroy();
  const labels   = Object.keys(breakdown);
  const data     = Object.values(breakdown);
  const bgColors = labels.map(l => STREAM_COLORS[l] || '#999');
  const ctx      = document.getElementById('interestChart').getContext('2d');
  chartInstance  = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderWidth: 3,
        borderColor: html.getAttribute('data-theme') === 'dark' ? '#161618' : '#fff',
        hoverBorderWidth: 4, hoverOffset: 8
      }]
    },
    options: {
      responsive: true, cutout: '65%',
      animation: { animateRotate: true, duration: 1200, easing: 'easeInOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } } }
    }
  });
  const legend = document.getElementById('chart-legend');
  legend.innerHTML = '';
  labels.forEach((label, i) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${bgColors[i]}"></div>${label}: ${data[i]}%`;
    legend.appendChild(item);
  });
}

// ════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
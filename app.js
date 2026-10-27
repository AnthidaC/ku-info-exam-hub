/* ==========================================================================
   KU Information Literacy Exam Hub - Core Application Logic
   Apple Design System Restraint & High-Impact Interactivity
   ========================================================================== */

// --- Global State ---
let allQuestions = [];
let activeQuestions = [];
let currentQIndex = 0;
let userAnswers = {}; // { qId: selectedOptionIndex }
let flaggedQuestions = new Set();
let instantFeedback = false;
let examSubmitted = false;

// Timer State (Default 2 Hours = 120 Minutes per university standard)
let timerTotalSeconds = 120 * 60; // 120 minutes default (7,200 seconds)
let timerRemainingSeconds = timerTotalSeconds;
let timerInterval = null;
let isTimerPaused = false;

// Mistake History (localStorage)
let mistakeIds = new Set();

// Bib Lab State
let currentOrderIndex = 0;
let currentOrderSelected = []; // array of piece ids

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Load data
  if (window.EXAM_QUESTIONS && window.EXAM_QUESTIONS.length > 0) {
    allQuestions = window.EXAM_QUESTIONS;
  } else {
    console.error('Questions data not loaded');
  }

  // Load mistakes from localStorage
  loadMistakesFromStorage();

  // Start with full mock exam
  initFullExam();

  // Render initial components
  renderCategoryCards();
  renderStudyNotes();
  renderBibLabOrdering();
  renderBibLabSpotMistakes();
  renderBibLabCheatsheet();
  updateStatsDashboard();

  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Start exam timer
  startTimer();
});

// --- Tab Switching ---
let currentActiveTab = 'exam';

function updateMobileHeaderNav(tabName) {
  const badge = document.getElementById('mobile-current-view-badge');
  const quickTxt = document.getElementById('mobile-quick-switch-txt');
  const quickIcon = document.getElementById('mobile-quick-switch-icon');

  const badgeMap = {
    exam: '🎯 จำลองสอบจริง',
    notes: '📚 สรุปสาระความรู้',
    biblab: '✨ แล็บบรรณานุกรม',
    category: '📑 ฝึกแยกหมวด',
    stats: '📊 สถิติ & ทบทวน'
  };

  if (badge && badgeMap[tabName]) {
    badge.textContent = badgeMap[tabName];
  }

  if (quickTxt && quickIcon) {
    if (tabName === 'exam') {
      quickTxt.textContent = 'อ่านสรุป';
      quickIcon.setAttribute('data-lucide', 'book-open');
    } else {
      quickTxt.textContent = 'ไปทำข้อสอบ';
      quickIcon.setAttribute('data-lucide', 'target');
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

function toggleExamAndNotes() {
  if (currentActiveTab === 'exam') {
    switchTab('notes');
  } else {
    switchTab('exam');
  }
}

function openMobileNavModal() {
  const modal = document.getElementById('mobile-nav-modal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
  }
}

function closeMobileNavModal() {
  const modal = document.getElementById('mobile-nav-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function switchTabAndCloseNav(tabName) {
  closeMobileNavModal();
  switchTab(tabName);
}

function switchTab(tabName) {
  currentActiveTab = tabName;
  const tabs = ['exam', 'category', 'biblab', 'notes', 'stats'];
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    const mobBtn = document.getElementById(`mob-nav-${t}`);
    
    if (view && btn) {
      if (t === tabName) {
        view.classList.remove('hidden');
        btn.classList.add('active');
        if (mobBtn) mobBtn.classList.add('active');
      } else {
        view.classList.add('hidden');
        btn.classList.remove('active');
        if (mobBtn) mobBtn.classList.remove('active');
      }
    }
  });

  // Update mobile header switch button & badge
  updateMobileHeaderNav(tabName);

  // Toggle mobile bottom dock vs mobile bottom navigation (prevents double bottom bars!)
  const mobBar = document.getElementById('mobile-exam-sticky-bar');
  const mobBottomNav = document.querySelector('.mobile-bottom-nav');
  if (tabName === 'exam') {
    if (mobBar) mobBar.classList.remove('hidden');
    if (mobBottomNav) mobBottomNav.style.display = 'none';
  } else {
    if (mobBar) mobBar.classList.add('hidden');
    if (mobBottomNav) mobBottomNav.style.display = 'flex';
  }

  if (tabName === 'stats') {
    updateStatsDashboard();
  }

  if (window.lucide) {
    lucide.createIcons();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Quiz Engine & Exam Simulator ---

function initFullExam() {
  activeQuestions = [...allQuestions];
  currentQIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();
  examSubmitted = false;
  timerRemainingSeconds = timerTotalSeconds;
  isTimerPaused = false;

  document.getElementById('palette-category-filter').value = 'all';
  updateGlobalCounters();
  renderCurrentQuestion();
  renderPalette();
}

function startQuickMock() {
  initFullExam();
  switchTab('exam');
}

function startCategoryPractice(catKey) {
  activeQuestions = allQuestions.filter(q => q.category === catKey);
  currentQIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();
  examSubmitted = false;
  instantFeedback = true; // Auto-enable instant feedback for category practice

  updateFeedbackToggleButton();
  updateGlobalCounters();
  renderCurrentQuestion();
  renderPalette();
  switchTab('exam');
}

function updateGlobalCounters() {
  document.getElementById('stat-total').textContent = activeQuestions.length;
  document.getElementById('stat-answered').textContent = Object.keys(userAnswers).length;
}

function renderCurrentQuestion() {
  if (activeQuestions.length === 0) return;
  const q = activeQuestions[currentQIndex];

  // Header badges
  document.getElementById('q-category-badge').textContent = q.categoryName;
  document.getElementById('q-source-tag').textContent = q.tag || 'แนวข้อสอบ';
  document.getElementById('q-progress-indicator').textContent = `ข้อ ${currentQIndex + 1} / ${activeQuestions.length}`;
  document.getElementById('mob-q-num').textContent = `${currentQIndex + 1}`;

  // Flag button state
  const isFlagged = flaggedQuestions.has(q.id);
  const flagText = document.getElementById('flag-text');
  const btnFlag = document.getElementById('btn-flag-q');
  if (isFlagged) {
    flagText.textContent = 'ปักหมุดแล้ว';
    btnFlag.classList.add('border-amber-400', 'bg-amber-50', 'text-amber-700');
  } else {
    flagText.textContent = 'ทำเครื่องหมายไว้ทบทวน';
    btnFlag.classList.remove('border-amber-400', 'bg-amber-50', 'text-amber-700');
  }

  // Question Text
  document.getElementById('q-text').innerHTML = formatAcademicText(q.question);

  // Question Image Handling
  const imgContainer = document.getElementById('q-image-container');
  const imgElem = document.getElementById('q-image');
  if (imgContainer && imgElem) {
    if (q.image) {
      imgElem.src = q.image;
      imgContainer.classList.remove('hidden');
    } else {
      imgContainer.classList.add('hidden');
      imgElem.src = '';
    }
  }

  // Options
  const container = document.getElementById('options-container');
  container.innerHTML = '';

  const letters = ['ก', 'ข', 'ค', 'ง'];
  const isAnswered = userAnswers.hasOwnProperty(q.id);
  const selectedIdx = userAnswers[q.id];

  q.options.forEach((optText, optIdx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.onclick = () => selectOption(optIdx);

    const letterLabel = letters[optIdx] || `${optIdx + 1}`;
    btn.innerHTML = `
      <span class="option-badge">${letterLabel}</span>
      <span class="flex-grow">${formatAcademicText(optText)}</span>
    `;

    // Apply selection / result states
    if (isAnswered && selectedIdx === optIdx) {
      btn.classList.add('selected');
    }

    if (examSubmitted || (instantFeedback && isAnswered)) {
      if (optIdx === q.answer) {
        btn.classList.add('correct');
      } else if (selectedIdx === optIdx) {
        btn.classList.add('wrong');
      }
    }

    container.appendChild(btn);
  });

  // Explanation Container
  const expBox = document.getElementById('explanation-container');
  const expText = document.getElementById('q-explanation-text');

  if (examSubmitted || (instantFeedback && isAnswered)) {
    expText.innerHTML = formatAcademicText(q.explanation || 'ไม่มีคำอธิบายเพิ่มเติมสำหรับข้อนี้');
    expBox.classList.remove('hidden');
  } else {
    expBox.classList.add('hidden');
  }

  // Prev / Next button states
  document.getElementById('btn-prev-q').disabled = currentQIndex === 0;
  document.getElementById('btn-prev-q').style.opacity = currentQIndex === 0 ? '0.5' : '1';
  document.getElementById('btn-next-q').disabled = currentQIndex === activeQuestions.length - 1;
  document.getElementById('btn-next-q').style.opacity = currentQIndex === activeQuestions.length - 1 ? '0.5' : '1';

  // Update palette focus
  renderPalette();
  if (window.lucide) {
    lucide.createIcons();
  }
}

function selectOption(optIdx) {
  const q = activeQuestions[currentQIndex];
  userAnswers[q.id] = optIdx;

  // Record mistake if wrong
  if (optIdx !== q.answer) {
    recordMistake(q.id);
  } else {
    // If answered correctly now, could keep or remove from mistakes
  }

  updateGlobalCounters();
  renderCurrentQuestion();
  renderPalette();
}

function clearCurrentAnswer() {
  const q = activeQuestions[currentQIndex];
  delete userAnswers[q.id];
  updateGlobalCounters();
  renderCurrentQuestion();
  renderPalette();
}

function scrollToQuestionCard() {
  const qCard = document.getElementById('question-card');
  if (qCard) {
    const yOffset = -70; // Header offset
    const y = qCard.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function navigateQuestion(delta) {
  const nextIdx = currentQIndex + delta;
  if (nextIdx >= 0 && nextIdx < activeQuestions.length) {
    currentQIndex = nextIdx;
    renderCurrentQuestion();
    scrollToQuestionCard();
  }
}

function jumpToQuestion(idx) {
  if (idx >= 0 && idx < activeQuestions.length) {
    currentQIndex = idx;
    renderCurrentQuestion();
    scrollToQuestionCard();
  }
}

function openLightbox(src) {
  const box = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  if (box && img) {
    img.src = src;
    box.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeLightbox() {
  const box = document.getElementById('image-lightbox');
  if (box) {
    box.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function toggleFlagCurrentQuestion() {
  const q = activeQuestions[currentQIndex];
  if (flaggedQuestions.has(q.id)) {
    flaggedQuestions.delete(q.id);
  } else {
    flaggedQuestions.add(q.id);
  }
  renderCurrentQuestion();
  renderPalette();
}

function renderPalette() {
  const grid = document.getElementById('palette-buttons-grid');
  grid.innerHTML = '';

  const filterVal = document.getElementById('palette-category-filter').value;

  activeQuestions.forEach((q, idx) => {
    // Check filter
    if (filterVal === 'flagged' && !flaggedQuestions.has(q.id)) return;
    if (filterVal !== 'all' && filterVal !== 'flagged' && q.category !== filterVal) return;

    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.textContent = idx + 1;
    btn.onclick = () => jumpToQuestion(idx);

    if (idx === currentQIndex) {
      btn.classList.add('current');
    }

    if (flaggedQuestions.has(q.id)) {
      btn.classList.add('flagged');
    }

    if (userAnswers.hasOwnProperty(q.id)) {
      if (examSubmitted || instantFeedback) {
        if (userAnswers[q.id] === q.answer) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
        }
      } else {
        btn.classList.add('answered');
      }
    }

    grid.appendChild(btn);
  });
}

function filterPalette(val) {
  renderPalette();
}

// Mobile Palette Drawer Functions
function openMobilePalette() {
  const modal = document.getElementById('mobile-palette-modal');
  if (modal) {
    modal.classList.remove('hidden');
    renderMobilePalette();
    if (window.lucide) lucide.createIcons();
  }
}

function closeMobilePalette() {
  const modal = document.getElementById('mobile-palette-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function renderMobilePalette() {
  const grid = document.getElementById('mobile-palette-buttons-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const filterVal = document.getElementById('palette-category-filter')?.value || 'all';

  activeQuestions.forEach((q, idx) => {
    if (filterVal === 'flagged' && !flaggedQuestions.has(q.id)) return;
    if (filterVal !== 'all' && filterVal !== 'flagged' && q.category !== filterVal) return;

    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.textContent = idx + 1;
    btn.onclick = () => {
      jumpToQuestion(idx);
      closeMobilePalette();
    };

    if (idx === currentQIndex) btn.classList.add('current');
    if (flaggedQuestions.has(q.id)) btn.classList.add('flagged');

    if (userAnswers.hasOwnProperty(q.id)) {
      if (examSubmitted || instantFeedback) {
        if (userAnswers[q.id] === q.answer) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
        }
      } else {
        btn.classList.add('answered');
      }
    }
    grid.appendChild(btn);
  });
}

// Timer Functions (Flexible: 2 Hours default, or 90m, 60m, Untimed)
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!isTimerPaused && !examSubmitted && timerTotalSeconds > 0) {
      if (timerRemainingSeconds > 0) {
        timerRemainingSeconds--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        alert('หมดเวลาทำข้อสอบแล้ว! ระบบจะทำการประเมินคะแนนของคุณ');
        finishExam();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('exam-timer');
  const mobTimerEl = document.getElementById('mob-timer');
  if (!timerEl) return;

  if (timerTotalSeconds === 0) {
    timerEl.textContent = 'ไม่จำกัดเวลา';
    if (mobTimerEl) mobTimerEl.textContent = 'ไม่จำกัด';
    return;
  }

  const h = Math.floor(timerRemainingSeconds / 3600);
  const m = Math.floor((timerRemainingSeconds % 3600) / 60);
  const s = timerRemainingSeconds % 60;
  
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  timerEl.textContent = timeStr;
  if (mobTimerEl) mobTimerEl.textContent = timeStr;
}

function changeExamDuration(minutesVal) {
  const mins = parseInt(minutesVal);
  if (mins === 0) {
    timerTotalSeconds = 0;
    timerRemainingSeconds = 0;
  } else {
    timerTotalSeconds = mins * 60;
    timerRemainingSeconds = timerTotalSeconds;
  }
  isTimerPaused = false;
  const txt = document.getElementById('timer-toggle-text');
  if (txt) txt.textContent = 'หยุดเวลา';
  updateTimerDisplay();
}

function toggleExamTimer() {
  if (timerTotalSeconds === 0) return; // Untimed mode
  isTimerPaused = !isTimerPaused;
  const btn = document.getElementById('btn-timer-toggle');
  const txt = document.getElementById('timer-toggle-text');
  if (isTimerPaused) {
    txt.textContent = 'เริ่มต่อ';
    btn.classList.add('text-amber-600', 'bg-amber-50');
  } else {
    txt.textContent = 'หยุดเวลา';
    btn.classList.remove('text-amber-600', 'bg-amber-50');
  }
}

function toggleInstantFeedback() {
  instantFeedback = !instantFeedback;
  updateFeedbackToggleButton();
  renderCurrentQuestion();
  renderPalette();
}

function updateFeedbackToggleButton() {
  const txt = document.getElementById('feedback-toggle-text');
  const btn = document.getElementById('btn-feedback-toggle');
  if (instantFeedback) {
    txt.textContent = 'ตรวจทันที: เปิด';
    btn.classList.add('text-[#0066cc]', 'bg-blue-50', 'border-[#0066cc]');
  } else {
    txt.textContent = 'ตรวจทันที: ปิด';
    btn.classList.remove('text-[#0066cc]', 'bg-blue-50', 'border-[#0066cc]');
  }
}

function resetCurrentQuiz() {
  if (confirm('คุณต้องการรีเซ็ตคำตอบทั้งหมดในชุดข้อสอบนี้ใช่หรือไม่?')) {
    userAnswers = {};
    flaggedQuestions.clear();
    examSubmitted = false;
    timerRemainingSeconds = timerTotalSeconds;
    updateGlobalCounters();
    renderCurrentQuestion();
    renderPalette();
  }
}

// Exam Evaluation & Modal
function finishExam() {
  const total = activeQuestions.length;
  const answeredCount = Object.keys(userAnswers).length;

  if (!examSubmitted && answeredCount < total) {
    const unans = total - answeredCount;
    if (!confirm(`คุณยังทำข้อสอบไม่ครบ (ยังไม่ได้ทำ ${unans} ข้อ)\nคุณแน่ใจหรือไม่ว่าต้องการส่งข้อสอบตอนนี้?`)) {
      return;
    }
  }

  examSubmitted = true;

  // Calculate score & breakdown
  let correctCount = 0;
  let categoryScores = {}; // { catKey: { correct: 0, total: 0, name: '' } }

  activeQuestions.forEach(q => {
    if (!categoryScores[q.category]) {
      categoryScores[q.category] = { correct: 0, total: 0, name: q.categoryName };
    }
    categoryScores[q.category].total++;

    if (userAnswers.hasOwnProperty(q.id)) {
      if (userAnswers[q.id] === q.answer) {
        correctCount++;
        categoryScores[q.category].correct++;
      } else {
        recordMistake(q.id);
      }
    } else {
      // Unanswered treated as wrong
      recordMistake(q.id);
    }
  });

  const percent = Math.round((correctCount / total) * 100);

  // Update Result Modal
  document.getElementById('result-score').textContent = correctCount;
  document.getElementById('result-max').textContent = total;

  const badge = document.getElementById('result-percentage-badge');
  const icon = document.getElementById('result-badge-icon');
  if (percent >= 60) {
    badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800';
    badge.textContent = `ผ่านเกณฑ์ (${percent}%) - ยอดเยี่ยม! 🎉`;
    icon.className = 'w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-3';
  } else {
    badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800';
    badge.textContent = `ยังไม่ผ่านเกณฑ์ (${percent}%) - ทบทวนเพิ่มเติมนะ สู้ๆ! 💪`;
    icon.className = 'w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-3';
  }

  // Category breakdown list
  const breakdownContainer = document.getElementById('result-category-breakdown');
  breakdownContainer.innerHTML = '';

  for (const catKey in categoryScores) {
    const data = categoryScores[catKey];
    const catPercent = Math.round((data.correct / data.total) * 100);
    const row = document.createElement('div');
    row.className = 'text-xs';
    row.innerHTML = `
      <div class="flex justify-between mb-1 text-neutral-700 font-medium">
        <span>${escapeHtml(data.name)}</span>
        <span>${data.correct} / ${data.total} (${catPercent}%)</span>
      </div>
      <div class="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
        <div class="bg-[#0066cc] h-2 rounded-full" style="width: ${catPercent}%"></div>
      </div>
    `;
    breakdownContainer.appendChild(row);
  }

  // Open Modal
  document.getElementById('modal-results').classList.remove('hidden');

  // Re-render question view in evaluated state
  renderCurrentQuestion();
  renderPalette();
  updateStatsDashboard();
}

function closeResultModalAndReview() {
  document.getElementById('modal-results').classList.add('hidden');
  renderCurrentQuestion();
}

function restartExamMock() {
  document.getElementById('modal-results').classList.add('hidden');
  initFullExam();
}

// --- Category View Component ---
function renderCategoryCards() {
  const container = document.getElementById('category-cards-grid');
  if (!container) return;

  const cats = [
    {
      id: 'bib',
      title: 'บรรณานุกรมและการเขียนอ้างอิง',
      sub: 'APA Style 7th Edition (เน้นพิเศษ)',
      icon: 'sparkles',
      desc: 'หลักเกณฑ์การอ้างอิงในเนื้อหาและท้ายเรื่อง ภาษาไทยและสากล การใส่เลขหน้า การอ้างอิงตาราง/ภาพ และข้อยกเว้นสำคัญ',
      color: 'blue'
    },
    {
      id: 'search',
      title: 'การสืบค้น การประเมิน และการวิเคราะห์',
      sub: 'ตรรกบูลีน & Google Search Operators',
      icon: 'search',
      desc: 'การใช้ AND, OR, NOT, Truncation (*), Wildcard (?), คำสั่ง allintitle, filetype, site และการวิเคราะห์สังเคราะห์สารสนเทศ',
      color: 'emerald'
    },
    {
      id: 'ethics',
      title: 'จริยธรรม กฎหมายลิขสิทธิ์ & พ.ร.บ.คอมฯ',
      sub: 'Plagiarism, GenAI, กฎหมาย 2537 & 2560',
      icon: 'shield-check',
      desc: 'การโจรกรรมทางวรรณกรรม 6 แบบ, แนวปฏิบัติ GenAI ของ วช., ข้อยกเว้นลิขสิทธิ์ และบทลงโทษตามมาตรา 5-16 พ.ร.บ.คอมฯ',
      color: 'amber'
    },
    {
      id: 'database',
      title: 'ฐานข้อมูลออนไลน์เพื่อการวิจัย',
      sub: 'Online Academic Databases',
      icon: 'database',
      desc: 'THAIJO, TDC, IEEE, ERIC, CEIC, Stash, WGSN, Hibrary, Osmosis, PubMed และระบบการยืนยันตัวตน All Login มก.',
      color: 'purple'
    },
    {
      id: 'sources',
      title: 'แหล่งสารสนเทศและอินเทอร์เน็ต',
      sub: 'Primary, Secondary, Tertiary & Domain',
      icon: 'layers',
      desc: 'สารสนเทศปฐมภูมิ ทุติยภูมิ ตติยภูมิ, สื่อตีพิมพ์และไม่ตีพิมพ์, ส่วนประกอบของหนังสือ (หน้าลิขสิทธิ์, สารบัญ) และโดเมนเนม',
      color: 'cyan'
    },
    {
      id: 'library',
      title: 'บริการสำนักหอสมุด มก. กำแพงแสน',
      sub: 'กิจกรรมนอกชั้นเรียนครั้งที่ 2',
      icon: 'home',
      desc: 'การสแกนบัตรใน App Nisit KU, ยืมการ์ตูน 14 วัน, สถานะ CHECK SHELF, บอร์ดเกมยุทธพิชัยสามก๊ก, การจองห้องคาราโอเกะ',
      color: 'rose'
    }
  ];

  container.innerHTML = '';
  cats.forEach(c => {
    const qCount = allQuestions.filter(q => q.category === c.id).length;
    const card = document.createElement('div');
    card.className = 'apple-card flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-[#0066cc] flex items-center justify-center font-bold">
            <i data-lucide="${c.icon}" class="w-5 h-5"></i>
          </div>
          <span class="badge-tag">${qCount} ข้อ</span>
        </div>
        <h3 class="text-lg font-bold text-[#1d1d1f] mb-0.5">${escapeHtml(c.title)}</h3>
        <div class="text-xs font-semibold text-[#0066cc] mb-2">${escapeHtml(c.sub)}</div>
        <p class="text-xs text-neutral-500 leading-relaxed mb-6">${escapeHtml(c.desc)}</p>
      </div>
      <div>
        <button onclick="startCategoryPractice('${c.id}')" class="btn-apple-primary w-full text-xs py-2 px-3">
          <i data-lucide="play" class="w-3.5 h-3.5"></i>
          <span>ฝึกทำหมวดนี้</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

// --- Bibliography Master Lab Logic ---

function switchBibLabTab(subtab) {
  const tabs = ['ordering', 'spot', 'cheatsheet'];
  tabs.forEach(t => {
    const sec = document.getElementById(`bib-section-${t}`);
    const btn = document.getElementById(`bib-subtab-${t}`);
    if (sec && btn) {
      if (t === subtab) {
        sec.classList.remove('hidden');
        btn.className = 'btn-apple-primary text-xs py-1.5 px-4';
      } else {
        sec.classList.add('hidden');
        btn.className = 'btn-apple-ghost text-xs py-1.5 px-4';
      }
    }
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

// 1. Interactive Ordering
function renderBibLabOrdering() {
  if (!window.BIB_LAB_DATA || !window.BIB_LAB_DATA.ordering_challenges) return;
  const list = window.BIB_LAB_DATA.ordering_challenges;
  if (currentOrderIndex >= list.length) currentOrderIndex = 0;
  if (currentOrderIndex < 0) currentOrderIndex = list.length - 1;

  const item = list[currentOrderIndex];
  document.getElementById('order-step-badge').textContent = `แบบฝึกหัดที่ ${currentOrderIndex + 1} / ${list.length}`;
  document.getElementById('order-title').textContent = item.title;
  document.getElementById('order-desc').textContent = item.description;

  const container = document.getElementById('order-pieces-container');
  container.innerHTML = '';
  document.getElementById('order-feedback-box').className = 'hidden';

  // Shuffle pieces for display
  const shuffled = [...item.pieces].sort(() => Math.random() - 0.5);
  currentOrderSelected = [];

  shuffled.forEach(p => {
    const el = document.createElement('div');
    el.className = 'drag-item';
    el.id = `piece-${p.id}`;
    el.innerHTML = `
      <span class="font-medium text-sm text-[#1d1d1f]">${formatAcademicText(p.text)}</span>
      <span class="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono select-none" id="order-seq-${p.id}">คลิกเพื่อเลือก</span>
    `;
    el.onclick = () => togglePieceSelection(p.id);
    container.appendChild(el);
  });
}

function togglePieceSelection(pieceId) {
  const idx = currentOrderSelected.indexOf(pieceId);
  const el = document.getElementById(`piece-${pieceId}`);
  const seqLabel = document.getElementById(`order-seq-${pieceId}`);

  if (idx > -1) {
    // Remove
    currentOrderSelected.splice(idx, 1);
    el.classList.remove('in-place');
    seqLabel.textContent = 'คลิกเพื่อเลือก';
    seqLabel.className = 'text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-500 font-mono select-none';
  } else {
    // Add
    currentOrderSelected.push(pieceId);
    el.classList.add('in-place');
  }

  // Update all badges with 1, 2, 3...
  currentOrderSelected.forEach((pid, orderIdx) => {
    const lbl = document.getElementById(`order-seq-${pid}`);
    if (lbl) {
      lbl.textContent = `ลำดับที่ ${orderIdx + 1}`;
      lbl.className = 'text-xs px-2.5 py-0.5 rounded-full bg-[#0066cc] text-white font-bold select-none';
    }
  });
}

function resetOrderingCurrent() {
  currentOrderSelected = [];
  renderBibLabOrdering();
}

function nextOrderingChallenge(delta) {
  currentOrderIndex += delta;
  renderBibLabOrdering();
}

function checkOrderingAnswer() {
  const item = window.BIB_LAB_DATA.ordering_challenges[currentOrderIndex];
  const box = document.getElementById('order-feedback-box');

  if (currentOrderSelected.length !== item.correct_order.length) {
    box.className = 'block p-4 rounded-xl mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm';
    box.innerHTML = `⚠️ กรุณาคลิกเลือกชิ้นส่วนให้ครบทุกชิ้นก่อนตรวจคำตอบ (เลือกแล้ว ${currentOrderSelected.length} จาก ${item.correct_order.length} ชิ้น)`;
    return;
  }

  let isCorrect = true;
  for (let i = 0; i < item.correct_order.length; i++) {
    if (currentOrderSelected[i] !== item.correct_order[i]) {
      isCorrect = false;
      break;
    }
  }

  if (isCorrect) {
    box.className = 'block p-4 rounded-xl mb-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm';
    box.innerHTML = `
      <div class="font-bold flex items-center gap-1.5 mb-1">
        <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
        <span>ยอดเยี่ยม! เรียงลำดับส่วนประกอบได้ถูกต้องสมบูรณ์</span>
      </div>
      <p class="text-xs text-emerald-700">${formatAcademicText(item.explanation)}</p>
    `;
  } else {
    box.className = 'block p-4 rounded-xl mb-4 bg-red-50 border border-red-200 text-red-900 text-sm';
    box.innerHTML = `
      <div class="font-bold flex items-center gap-1.5 mb-1">
        <i data-lucide="x-circle" class="w-4 h-4 text-red-600"></i>
        <span>ลำดับยังไม่ถูกต้อง ลองตรวจสอบและเรียงใหม่อีกครั้ง</span>
      </div>
      <p class="text-xs text-red-700">${formatAcademicText(item.explanation)}</p>
    `;
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// 2. Spot-the-Mistake
function renderBibLabSpotMistakes() {
  if (!window.BIB_LAB_DATA || !window.BIB_LAB_DATA.spot_mistakes) return;
  const list = window.BIB_LAB_DATA.spot_mistakes;
  const container = document.getElementById('spot-mistakes-list');
  container.innerHTML = '';

  list.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'apple-card space-y-4';
    card.id = `spot-card-${item.id}`;

    let optsHtml = '';
    item.options.forEach((opt, oIdx) => {
      optsHtml += `
        <button onclick="checkSpotAnswer('${item.id}', ${oIdx})" id="spot-opt-${item.id}-${oIdx}" class="option-btn text-xs py-2.5 px-3">
          <span class="option-badge text-xs w-6 h-6">${oIdx + 1}</span>
          <span>${formatAcademicText(opt)}</span>
        </button>
      `;
    });

    card.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-neutral-100">
        <span class="badge-tag">ข้อที่ ${idx + 1}</span>
        <span class="text-xs text-neutral-400">ค้นหาจุดผิด</span>
      </div>
      <div>
        <div class="text-xs text-neutral-500 font-semibold mb-1">ตัวอย่างรายการอ้างอิงที่มีจุดผิด:</div>
        <div class="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs text-neutral-800 leading-relaxed select-all">
          ${formatAcademicText(item.bad_citation)}
        </div>
      </div>
      <div>
        <h4 class="font-bold text-sm text-[#1d1d1f] mb-3">${formatAcademicText(item.question)}</h4>
        <div class="space-y-2">
          ${optsHtml}
        </div>
      </div>
      <div id="spot-feedback-${item.id}" class="hidden explanation-box text-xs">
        ${formatAcademicText(item.explanation)}
      </div>
    `;

    container.appendChild(card);
  });
}

function checkSpotAnswer(itemId, selectedIdx) {
  const item = window.BIB_LAB_DATA.spot_mistakes.find(x => x.id === itemId);
  if (!item) return;

  item.options.forEach((_, oIdx) => {
    const btn = document.getElementById(`spot-opt-${itemId}-${oIdx}`);
    if (btn) {
      if (oIdx === item.answer) {
        btn.classList.add('correct');
      } else if (oIdx === selectedIdx) {
        btn.classList.add('wrong');
      }
    }
  });

  const fb = document.getElementById(`spot-feedback-${itemId}`);
  if (fb) fb.classList.remove('hidden');
}

// 3. Cheatsheet Cards
function renderBibLabCheatsheet() {
  const container = document.getElementById('bib-cheatsheet-cards');
  if (!container) return;

  const sheets = [
    {
      title: '1. หนังสือทั่วไป (Book)',
      formula: 'ผู้แต่ง. (ปีพิมพ์). ชื่อหนังสือ (ตัวเอียง). สำนักพิมพ์.',
      example_th: 'อนุพันธ์ นิตินัย. (2555). <em>ตำนาน 77 จังหวัด</em>. ไทยควอลิตี้บุ๊คส์.',
      example_en: 'Jackson, L. M. (2019). <em>The psychology of prejudice</em> (2nd ed.). American Psychological Association.',
      tips: 'ตัดคำนำหน้านาม (นาย, นาง) และตำแหน่งทางวิชาการ (ดร., รศ.) ออกทั้งหมด ชื่อหนังสือต้องทำตัวเอียง'
    },
    {
      title: '2. บทความในวารสาร (Journal Article)',
      formula: 'ผู้แต่ง. (ปีพิมพ์). ชื่อบทความ. ชื่อวารสาร (ตัวเอียง), ปีที่ (ตัวเอียง)(ฉบับที่), เลขหน้า. DOI/URL',
      example_th: 'ธัญนาฏ ญาณพิบูลย์ และคณะ. (2563). การใช้นวัตกรรม... <em>จุฬาลงกรณ์ธุรกิจปริทัศน์</em>, <em>42</em>(2), 54-72.',
      example_en: 'Singh, M. K., & Anjali, K. (2022). Seqiahr Model. <em>Applications and Applied Mathematics</em>, <em>17</em>(1), 146–171.',
      tips: 'ชื่อวารสารและเลขปีที่ (Volume) ทำตัวเอียง ส่วนเลขฉบับที่ในวงเล็บและเลขหน้าเป็นตัวตรง'
    },
    {
      title: '3. หนังสือรวมบทความ (Book Chapter)',
      formula: 'ผู้เขียนบทความ. (ปี). ชื่อบทความ. ใน บรรณาธิการ (บ.ก.), ชื่อหนังสือ (ตัวเอียง) (น. เลขหน้า). สำนักพิมพ์.',
      example_th: 'วนิดา เหมะกุล. (2555). การให้เหตุผล. ใน ยุทธนา ลิลา (บ.ก.), <em>คณิตศาสตร์...</em> (น. 50-55). มสธ.',
      example_en: 'Bornstein, M. H. (2003). Socioeconomic status. In M. H. Bornstein (Ed.), <em>Monographs</em> (pp. 29–82). Erlbaum.',
      tips: 'ชื่อบรรณาธิการภาษาอังกฤษในส่วน In ... (Eds.) จะไม่กลับนามสกุล'
    },
    {
      title: '4. วิทยานิพนธ์ (Theses / Dissertations)',
      formula: 'ผู้แต่ง. (ปี). ชื่อเรื่อง [วิทยานิพนธ์ปริญญามหาบัณฑิต/ดุษฎีบัณฑิตไม่ได้ตีพิมพ์]. มหาวิทยาลัย.',
      example_th: 'ธันทิวา ภักดีภัทรากร. (2563). <em>การพัฒนาเกมอาหารล้านนา</em> [วิทยานิพนธ์ปริญญามหาบัณฑิตไม่ได้ตีพิมพ์]. มหาวิทยาลัยเชียงใหม่.',
      example_en: 'Jung, M. S. (2014). <em>A structural equation model</em> [Unpublished doctoral dissertation]. Choong-Ang University.',
      tips: 'ระบุระดับปริญญาในเครื่องหมายวงเล็บเหลี่ยม [...]'
    },
    {
      title: '5. เว็บไซต์ (Websites)',
      formula: 'ผู้เขียน. (ปี, วันที่ เดือน). ชื่อเรื่อง (ตัวเอียง). ชื่อเว็บไซต์. URL',
      example_th: 'เอมอัชฌา วัฒนบุรานนท์. (2554, 27 เมษายน). <em>การจัดการเรียนรู้สุขศึกษา</em>. จุฬาวิทยานุกรม. http://...',
      example_en: 'Bologna, C. (2019, October 31). <em>Why people love horror movies</em>. HuffPost. https://...',
      tips: 'หากมีวันเดือนปี ให้ระบุปีขึ้นก่อนตามด้วย วันที่ เดือน'
    },
    {
      title: '6. การอ้างอิงในเนื้อหา (In-text Summary)',
      formula: '1 คน: ธานินทร์ (2560) / 2 คน: เอกราช และชัยยศ (2561) / 3 คนขึ้นไป: ชมแข และคณะ (2551)',
      example_th: 'ภาษาอังกฤษในวงเล็บเชื่อมด้วย & เช่น (Wegener & Petty, 1994) นอกวงเล็บใช้ and',
      example_en: '3 คนขึ้นไปภาษาอังกฤษใช้ et al. ตั้งแต่ครั้งแรก เช่น Schmidt et al. (2018)',
      tips: 'หน่วยงานมีชื่อย่อ ครั้งแรกใช้ [ชื่อย่อ] ในวงเล็บเหลี่ยม ครั้งต่อไปใช้ชื่อย่อได้เลย'
    }
  ];

  container.innerHTML = '';
  sheets.forEach(s => {
    const card = document.createElement('div');
    card.className = 'apple-card space-y-3';
    card.innerHTML = `
      <div class="flex items-center justify-between pb-2 border-b border-neutral-100">
        <h3 class="font-bold text-base text-[#0066cc]">${escapeHtml(s.title)}</h3>
        <span class="badge-outline text-[11px]">APA 7th</span>
      </div>
      <div>
        <div class="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">โครงสร้างสูตร:</div>
        <div class="p-2.5 bg-neutral-50 rounded-lg text-xs font-mono text-neutral-800 border border-neutral-200 mt-1">
          ${escapeHtml(s.formula)}
        </div>
      </div>
      <div class="text-xs space-y-1">
        <div class="text-neutral-500 font-medium">ตัวอย่างภาษาไทย:</div>
        <div class="p-2 bg-blue-50/50 rounded text-neutral-800 border border-blue-100 text-xs">${s.example_th}</div>
        <div class="text-neutral-500 font-medium pt-1">ตัวอย่างภาษาอังกฤษ:</div>
        <div class="p-2 bg-neutral-50 rounded text-neutral-800 border border-neutral-200 text-xs">${s.example_en}</div>
      </div>
      <div class="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
        💡 <strong>จุดสังเกตสำคัญ:</strong> ${escapeHtml(s.tips)}
      </div>
    `;
    container.appendChild(card);
  });
}

// --- Study Notes View Component ---
function renderStudyNotes() {
  const container = document.getElementById('study-notes-container');
  if (!container || !window.STUDY_MODULES) return;

  container.innerHTML = '';
  window.STUDY_MODULES.forEach((mod, idx) => {
    const card = document.createElement('div');
    card.className = 'apple-card p-0 overflow-hidden';
    card.id = `note-card-${mod.id}`;

    // Render markdown content using marked.js
    let htmlContent = mod.content;
    if (window.marked) {
      htmlContent = marked.parse(mod.content);
    }

    card.innerHTML = `
      <button onclick="toggleNoteAccordion('${mod.id}')" class="w-full text-left p-5 sm:p-6 flex items-center justify-between hover:bg-neutral-50 transition-colors">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-[#0066cc] flex items-center justify-center font-bold flex-shrink-0">
            <i data-lucide="${mod.icon || 'book-open'}" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-bold text-base sm:text-lg text-[#1d1d1f]">${escapeHtml(mod.title)}</h3>
            <span class="text-xs text-neutral-500">${mod.badge || 'สรุปเนื้อหาสำคัญ'}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-[#0066cc] font-semibold hidden sm:inline" id="note-toggle-txt-${mod.id}">คลิกเพื่ออ่าน</span>
          <i data-lucide="chevron-down" class="w-5 h-5 text-neutral-400 transition-transform duration-200" id="note-chevron-${mod.id}"></i>
        </div>
      </button>
      <div id="note-body-${mod.id}" class="hidden p-6 pt-0 border-t border-neutral-100 markdown-body">
        ${htmlContent}
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function toggleNoteAccordion(modId) {
  const body = document.getElementById(`note-body-${modId}`);
  const chevron = document.getElementById(`note-chevron-${modId}`);
  const txt = document.getElementById(`note-toggle-txt-${modId}`);

  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    chevron.style.transform = 'rotate(180deg)';
    if (txt) txt.textContent = 'ย่อเนื้อหา';
  } else {
    body.classList.add('hidden');
    chevron.style.transform = 'rotate(0deg)';
    if (txt) txt.textContent = 'คลิกเพื่ออ่าน';
  }
}

function expandAllNotes() {
  if (!window.STUDY_MODULES) return;
  window.STUDY_MODULES.forEach(m => {
    const body = document.getElementById(`note-body-${m.id}`);
    const chevron = document.getElementById(`note-chevron-${m.id}`);
    if (body) body.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  });
}

function collapseAllNotes() {
  if (!window.STUDY_MODULES) return;
  window.STUDY_MODULES.forEach(m => {
    const body = document.getElementById(`note-body-${m.id}`);
    const chevron = document.getElementById(`note-chevron-${m.id}`);
    if (body) body.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  });
}

// --- Mistake Tracking & LocalStorage ---

function loadMistakesFromStorage() {
  try {
    const stored = localStorage.getItem('ku_exam_mistakes');
    if (stored) {
      mistakeIds = new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to load mistakes', e);
  }
  updateMistakeBadge();
}

function recordMistake(qId) {
  mistakeIds.add(qId);
  try {
    localStorage.setItem('ku_exam_mistakes', JSON.stringify([...mistakeIds]));
  } catch (e) {}
  updateMistakeBadge();
}

function updateMistakeBadge() {
  const badge = document.getElementById('wrong-count-badge');
  if (badge) {
    if (mistakeIds.size > 0) {
      badge.textContent = mistakeIds.size;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

function clearMistakeHistory() {
  if (confirm('คุณต้องการล้างประวัติข้อที่เคยตอบผิดทั้งหมดใช่หรือไม่?')) {
    mistakeIds.clear();
    localStorage.removeItem('ku_exam_mistakes');
    updateMistakeBadge();
    updateStatsDashboard();
  }
}

function updateStatsDashboard() {
  const answeredTotal = Object.keys(userAnswers).length;
  let correctCount = 0;
  for (const qId in userAnswers) {
    const q = allQuestions.find(x => x.id === parseInt(qId));
    if (q && q.answer === userAnswers[qId]) {
      correctCount++;
    }
  }

  const accuracy = answeredTotal > 0 ? Math.round((correctCount / answeredTotal) * 100) : 0;

  document.getElementById('stats-total-answered').textContent = answeredTotal;
  document.getElementById('stats-accuracy-rate').textContent = `${accuracy}%`;
  document.getElementById('stats-wrong-total').textContent = mistakeIds.size;

  // Render wrong questions list
  const container = document.getElementById('wrong-questions-list');
  const btnPractice = document.getElementById('btn-practice-wrong');

  if (mistakeIds.size === 0) {
    btnPractice.disabled = true;
    container.innerHTML = `
      <div class="text-center py-12 text-neutral-400">
        <i data-lucide="check-circle" class="w-12 h-12 text-emerald-400 mx-auto mb-2 opacity-60"></i>
        <div class="font-medium text-neutral-600">ยังไม่มีข้อที่ตอบผิด</div>
        <p class="text-xs mt-1">ยอดเยี่ยมมาก! เมื่อคุณทำข้อสอบผิด ระบบจะรวบรวมข้อนั้นมาไว้ที่นี่โดยอัตโนมัติ</p>
      </div>
    `;
  } else {
    btnPractice.disabled = false;
    container.innerHTML = '';

    mistakeIds.forEach(id => {
      const q = allQuestions.find(x => x.id === id);
      if (!q) return;

      const item = document.createElement('div');
      item.className = 'p-4 rounded-xl border border-red-100 bg-red-50/30 space-y-2';
      item.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="badge-tag">${escapeHtml(q.categoryName)}</span>
          <span class="text-xs text-red-600 font-semibold">ข้อที่ ${q.id}</span>
        </div>
        <h4 class="font-bold text-sm text-[#1d1d1f]">${formatAcademicText(q.question)}</h4>
        <div class="text-xs text-emerald-800 font-semibold bg-emerald-50 p-2 rounded border border-emerald-200">
          ✓ คำตอบที่ถูกต้อง: ${formatAcademicText(q.options[q.answer])}
        </div>
        <p class="text-xs text-neutral-600 pt-1 border-t border-red-100">${formatAcademicText(q.explanation)}</p>
      `;
      container.appendChild(item);
    });
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

function practiceWrongQuestions() {
  if (mistakeIds.size === 0) return;
  activeQuestions = allQuestions.filter(q => mistakeIds.has(q.id));
  currentQIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();
  examSubmitted = false;
  instantFeedback = true;

  updateFeedbackToggleButton();
  updateGlobalCounters();
  renderCurrentQuestion();
  renderPalette();
  switchTab('exam');
}

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAcademicText(str) {
  if (!str) return '';
  let html = String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/&lt;em&gt;/gi, '<em class="academic-italic">')
    .replace(/&lt;\/em&gt;/gi, '</em>')
    .replace(/&lt;i&gt;/gi, '<i class="academic-italic">')
    .replace(/&lt;\/i&gt;/gi, '</i>')
    .replace(/&lt;b&gt;/gi, '<b>')
    .replace(/&lt;\/b&gt;/gi, '</b>')
    .replace(/\*\*([^\*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^\*\n]+)\*/g, '<em class="academic-italic">$1</em>')
    .replace(/\n/g, '<br>');
  return html;
}

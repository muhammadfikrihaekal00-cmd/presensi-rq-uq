/**
 * RQ UMMUL QASIM - SISTEM PRESENSI & INSENTIF PENGAJAR
 * JavaScript Core Logic, Multi-Theme, Windows & HP Mobile View,
 * Perekapan Insentif & Pengiriman Otomatis Slip Gaji ke WhatsApp
 */

// Storage Keys
const STORAGE_KEYS = {
  TEACHERS: 'rq_teachers_data',
  LOGS: 'rq_attendance_logs',
  SETTINGS: 'rq_app_settings',
  THEME: 'rq_selected_theme',
  VIEW_MODE: 'rq_view_mode',
  ADMIN_PIN: 'rq_admin_pin',
  SLIP_SETTINGS: 'rq_slip_settings',
  SALARY_OVERRIDES: 'rq_salary_overrides'
};

// Default Initial Data
const DEFAULT_SETTINGS = {
  institutionName: "RQ Ummul Qasim",
  tagline: "Sistem Presensi & Insentif Pengajar",
  lokasi: "Gedung Utama RQ Ummul Qasim",
  pembinaName: "Ust. Pembina RQ",
  pembinaTitle: "Mudir Rumah Qur'an"
};

const DEFAULT_SLIP_SETTINGS = {
  templateTheme: "emerald", // emerald, ocean, gold, slate
  customLogoUrl: "", // Custom base64 image if uploaded
  slipTitle: "SLIP MUKAFA'AH & INSENTIF PENGAJAR",
  orgName: "RUMAH QUR'AN UMMUL QASIM",
  orgTagline: "Lembaga Pendidikan Al-Qur'an & Tahfidz",
  orgContact: "Kompleks RQ Ummul Qasim • WA: 0812-3456-7890",
  footerQuote: "Jazakumullahu khairan katsiran atas dedikasi dan keikhlasannya dalam membina santri penghafal Al-Qur'an. Semoga Allah senantiasa memberkahi rezeki dan meridhoi amal jariyah kita.",
  signerCity: "Balikpapan",
  signerName: "Ust. Pembina RQ",
  signerTitle: "Mudir Rumah Qur'an",
  basePokok: 500000,
  ratePerHadir: 35000,
  bonusFullAttendance: 100000,
  labelPokok: "Mukafa'ah / Honor Pokok",
  labelHadir: "Insentif Mengajar Harian",
  labelBonus: "Tunjangan / Bonus Hadir Penuh",
  labelPotongan: "Potongan Kas / Infaq"
};

const DEFAULT_TEACHERS = [
  { 
    id: 'tch-1', 
    name: 'Ustadz Muhammad Fikri Haekal, C.LQ', 
    halaqah: 'Kelas Tahfizh Menengah Ikhwan', 
    phone: '082189480869', 
    status: 'Aktif' 
  },
  { 
    id: 'tch-2', 
    name: 'Ustadzah Ummu Khadijah', 
    halaqah: 'Kelas Tahfizh Dasar Ikhwan & Akhowat', 
    phone: '082339495396', 
    status: 'Aktif' 
  },
  { 
    id: 'tch-3', 
    name: 'Ustadzah A. Lulu Aprilia Latifa', 
    halaqah: 'Kelas Tahfizh Menengah Akhowat', 
    phone: '087722442651', 
    status: 'Aktif' 
  },
  { 
    id: 'tch-4', 
    name: 'Ustadzah Khirfatul jannah', 
    halaqah: 'Kelas Tahfizh Dasar Ikhwan', 
    phone: '089654707922', 
    status: 'Aktif' 
  }
];

// In-Memory Application State
let appSettings = {};
let slipSettings = {};
let salaryOverrides = {};
let adminPin = "1234";
let isAdminUnlocked = false;
let currentEnteredPin = "";
let adminPinTargetTab = "insentif";

let teachersList = [];
let attendanceLogs = [];
let selectedTeacherId = "";
let currentTheme = "emerald";
let activePreviewTeacherId = null;
let deferredPwaPrompt = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadDataFromStorage();
  initTheme();
  initViewMode();
  initClockAndDate();
  applyInstitutionSettings();
  renderTeacherSelectOptions();
  renderTeacherQuickChips();
  renderTodayMonitor();
  setupRecapMonthFilter();
  loadRecapData();
  renderTeachersManageTable();
  updateAdminUIState();
  initPwaAndServiceWorker();
  initKeyboardShortcuts();
});

/* ============================================================
   DATA PERSISTENCE HELPERS
   ============================================================ */
function safeJsonParse(jsonString, fallback) {
  if (!jsonString) return fallback;
  try {
    const val = JSON.parse(jsonString);
    return val !== null && val !== undefined ? val : fallback;
  } catch (err) {
    console.warn('Gagal parse data dari storage, menggunakan fallback default:', err);
    return fallback;
  }
}

/**
 * Membaca input nominal angka secara fleksibel:
 * Menerima format angka biasa (43750), titik ribuan Indonesia (43.750),
 * format ribuan koma internasional (43,750), maupun desimal.
 */
function parseNominalInput(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/^Rp\s*/i, '').replace(/\s+/g, '');
  if (!str) return 0;

  // Format ribuan Indonesia dengan titik: e.g. "43.750" atau "1.500.000"
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    return parseInt(str.replace(/\./g, ''), 10) || 0;
  }
  // Jika format ribuan titik dengan desimal koma: e.g. "43.750,50"
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Format ribuan koma internasional: e.g. "43,750" atau "1,500,000"
  if (/^\d{1,3}(,\d{3})+$/.test(str)) {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
  }
  // Format satu titik diikuti tepat 3 digit di akhir (contoh: 43.750):
  if (/^\d+\.\d{3}$/.test(str)) {
    return parseInt(str.replace('.', ''), 10) || 0;
  }
  // Format desimal biasa: ganti koma dengan titik
  str = str.replace(/,/g, '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function loadDataFromStorage() {
  try {
    // Settings Lembaga
    const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    appSettings = { ...DEFAULT_SETTINGS, ...safeJsonParse(storedSettings, {}) };

    // Slip Designer Settings
    const storedSlip = localStorage.getItem(STORAGE_KEYS.SLIP_SETTINGS);
    slipSettings = { ...DEFAULT_SLIP_SETTINGS, ...safeJsonParse(storedSlip, {}) };

    // Salary Overrides
    const storedOverrides = localStorage.getItem(STORAGE_KEYS.SALARY_OVERRIDES);
    salaryOverrides = safeJsonParse(storedOverrides, {});

    // Admin PIN
    const storedPin = localStorage.getItem(STORAGE_KEYS.ADMIN_PIN);
    adminPin = (storedPin && storedPin.trim()) ? storedPin.trim() : "1234";

    // Teachers List (Migrasi otomatis ke Daftar Pengajar Asli RQ Ummul Qasim)
    const SEED_VERSION_KEY = 'rq_teachers_version_v3_real';
    const isSeedUpdated = localStorage.getItem(SEED_VERSION_KEY) === 'true';
    const storedTeachers = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    const parsedTeachers = safeJsonParse(storedTeachers, null);
    const hasOldMockTeachers = Array.isArray(parsedTeachers) && parsedTeachers.some(t => t.name.includes('Abdul Rahman') || t.name.includes('Farhan'));

    if (!isSeedUpdated || hasOldMockTeachers || !Array.isArray(parsedTeachers) || parsedTeachers.length === 0) {
      teachersList = [ ...DEFAULT_TEACHERS ];
      saveTeachersToStorage();
      localStorage.setItem(SEED_VERSION_KEY, 'true');
      attendanceLogs = generateSeedLogs(teachersList);
      saveLogsToStorage();
    } else {
      teachersList = parsedTeachers;
      // Attendance Logs
      const storedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      const parsedLogs = safeJsonParse(storedLogs, null);
      if (Array.isArray(parsedLogs) && parsedLogs.length > 0) {
        attendanceLogs = parsedLogs;
      } else {
        attendanceLogs = generateSeedLogs(teachersList);
        saveLogsToStorage();
      }
    }
  } catch (err) {
    console.error('Error saat membaca data storage:', err);
    appSettings = { ...DEFAULT_SETTINGS };
    slipSettings = { ...DEFAULT_SLIP_SETTINGS };
    salaryOverrides = {};
    adminPin = "1234";
    teachersList = [ ...DEFAULT_TEACHERS ];
    attendanceLogs = generateSeedLogs(teachersList);
  }
}

function saveTeachersToStorage() {
  localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachersList));
}

function saveLogsToStorage() {
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(attendanceLogs));
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appSettings));
}

function saveSlipSettingsToStorage() {
  localStorage.setItem(STORAGE_KEYS.SLIP_SETTINGS, JSON.stringify(slipSettings));
}

function saveSalaryOverridesToStorage() {
  localStorage.setItem(STORAGE_KEYS.SALARY_OVERRIDES, JSON.stringify(salaryOverrides));
}

function generateSeedLogs(teachers) {
  const seed = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  teachers.forEach(t => {
    for (let day = 1; day < todayDate; day++) {
      const d = new Date(year, month, day);
      if (d.getDay() === 0) continue; // Skip Sunday

      const dateStr = formatDateString(year, month + 1, day);
      const isAbsent = Math.random() < 0.08;
      const isSick = Math.random() < 0.04;

      if (isSick) {
        seed.push({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          teacherId: t.id,
          teacherName: t.name,
          date: dateStr,
          time: '08:00',
          type: 'Sakit',
          note: 'Izin istirahat'
        });
      } else if (isAbsent) {
        seed.push({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          teacherId: t.id,
          teacherName: t.name,
          date: dateStr,
          time: '08:00',
          type: 'Izin',
          note: 'Ada keperluan keluarga'
        });
      } else {
        const hour = 15 + Math.floor(Math.random() * 2);
        const minute = String(Math.floor(Math.random() * 59)).padStart(2, '0');
        seed.push({
          id: 'log-' + Math.random().toString(36).substring(2, 9),
          teacherId: t.id,
          teacherName: t.name,
          date: dateStr,
          time: `${hour}:${minute}`,
          type: 'Hadir',
          note: 'Tepat Waktu'
        });
      }
    }
  });

  return seed;
}

/* ============================================================
   MULTI-THEME MANAGEMENT
   ============================================================ */
const THEME_META_COLORS = {
  emerald: '#065f46',
  dark: '#0b1120',
  ocean: '#1d4ed8',
  gold: '#b45309',
  purple: '#6d28d9'
};

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'emerald';
  changeTheme(savedTheme, false);
}

function changeTheme(themeName, showNotification = true) {
  if (!THEME_META_COLORS[themeName]) themeName = 'emerald';
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem(STORAGE_KEYS.THEME, themeName);

  const dropdown = document.getElementById('themeSelectDropdown');
  if (dropdown) dropdown.value = themeName;

  const meta = document.getElementById('themeColorMeta');
  if (meta) meta.setAttribute('content', THEME_META_COLORS[themeName] || '#065f46');

  document.querySelectorAll('.theme-card-option').forEach(el => el.classList.remove('active'));
  const activeOpt = document.getElementById(`themeOpt${capitalizeFirstLetter(themeName)}`);
  if (activeOpt) activeOpt.classList.add('active');

  if (showNotification) {
    const themeLabels = {
      emerald: 'Zamrud Islami',
      dark: 'Mode Gelap',
      ocean: 'Samudra Biru',
      gold: 'Kasturi Emas',
      purple: 'Amethyst Ungu'
    };
    showToast(`Tema diubah ke: ${themeLabels[themeName] || themeName}`, 'info');
  }
}

function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ============================================================
   DUAL EXPERIENCE: WINDOWS DESKTOP & SIMULASI HP
   ============================================================ */
function initViewMode() {
  if (window.innerWidth <= 768) {
    // Layar HP asli: selalu gunakan tampilan mobile native penuh tanpa bingkai simulasi PC
    document.body.classList.remove('phone-simulation-mode');
    return;
  }
  const savedMode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
  setViewMode(savedMode === 'hp' ? 'hp' : 'windows', false);
}

function setViewMode(mode, showNotification = true) {
  if (window.innerWidth <= 768) {
    document.body.classList.remove('phone-simulation-mode');
    return;
  }
  const isHp = mode === 'hp';
  localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);

  document.body.classList.toggle('phone-simulation-mode', isHp);

  const btnDesktop = document.getElementById('btnViewDesktop');
  const btnMobile = document.getElementById('btnViewMobile');
  if (btnDesktop) btnDesktop.classList.toggle('active', !isHp);
  if (btnMobile) btnMobile.classList.toggle('active', isHp);

  if (showNotification) {
    if (isHp) {
      showToast('Beralih ke Simulasi Tampilan HP', 'info');
    } else {
      showToast('Beralih ke Tampilan Komputer / PC', 'info');
    }
  }
}

/* ============================================================
   CLOCK & DATE UTILITIES
   ============================================================ */
function initClockAndDate() {
  const clockEl = document.getElementById('liveClock');
  const dateBadgeEl = document.getElementById('currentDateBadge');

  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;

    const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const dayName = days[now.getDay()];
    const dateNum = now.getDate();
    const monthName = months[now.getMonth()];
    const yearNum = now.getFullYear();

    if (dateBadgeEl) {
      dateBadgeEl.textContent = `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
    }
  }

  update();
  setInterval(update, 1000);
}

function getTodayDateString() {
  const now = new Date();
  return formatDateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatDateString(year, month, day) {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatIndonesianDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${parts[2]} ${months[monthIdx] || parts[1]} ${parts[0]}`;
}

function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

/* ============================================================
   TAB SWITCHING & KEAMANAN AKSES PENGELOLA (ADMIN PIN)
   ============================================================ */
function openInsentifTab() {
  if (isAdminUnlocked) {
    switchTab('insentif');
  } else {
    openAdminPinModal('insentif');
  }
}

function openPengaturanTab() {
  if (isAdminUnlocked) {
    switchTab('pengaturan');
  } else {
    openAdminPinModal('pengaturan');
  }
}

function updateAdminUIState() {
  // 1. Header Auth Button
  const authBtn = document.getElementById('btnAdminAuthHeader');
  const authIcon = document.getElementById('adminAuthIcon');
  const authText = document.getElementById('adminAuthText');
  if (authBtn) {
    authBtn.classList.toggle('unlocked', isAdminUnlocked);
  }
  if (authIcon) {
    authIcon.textContent = isAdminUnlocked ? '🔓' : '🔒';
  }
  if (authText) {
    authText.textContent = isAdminUnlocked ? 'Pengelola (Kunci)' : 'Pengelola';
  }

  // 2. Desktop Tab Badges
  const badgeLockInsentif = document.getElementById('badgeLockDesktop');
  if (badgeLockInsentif) badgeLockInsentif.textContent = isAdminUnlocked ? '🔓' : '🔒';
  const badgeLockPengaturan = document.getElementById('badgeLockPengaturanDesktop');
  if (badgeLockPengaturan) badgeLockPengaturan.textContent = isAdminUnlocked ? '🔓' : '🔒';

  // 3. Mobile Nav Labels
  const mobNavInsentif = document.getElementById('mobNavInsentif');
  if (mobNavInsentif) {
    const span = mobNavInsentif.querySelector('span');
    if (span) span.textContent = isAdminUnlocked ? 'Gaji 🔓' : 'Gaji 🔒';
  }
  const mobNavPengaturan = document.getElementById('mobNavPengaturan');
  if (mobNavPengaturan) {
    const span = mobNavPengaturan.querySelector('span');
    if (span) span.textContent = isAdminUnlocked ? 'Kelola 🔓' : 'Kelola 🔒';
  }

  // 4. Panel Pengaturan Visibility
  const lockedOverlay = document.getElementById('pengaturanLockedOverlay');
  const unlockedContent = document.getElementById('pengaturanUnlockedContent');
  if (lockedOverlay) lockedOverlay.style.display = isAdminUnlocked ? 'none' : 'block';
  if (unlockedContent) unlockedContent.style.display = isAdminUnlocked ? 'block' : 'none';
}

function toggleAdminAuth() {
  if (isAdminUnlocked) {
    lockAdminSession();
  } else {
    openAdminPinModal('insentif');
  }
}

function switchTab(tabId) {
  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch (_) {}
  }

  // Proteksi: Hanya pengelola yang dapat membuka Tab Insentif dan Tab Pengaturan
  if ((tabId === 'insentif' || tabId === 'pengaturan') && !isAdminUnlocked) {
    openAdminPinModal(tabId);
    return;
  }

  // Update Desktop Buttons
  const tabAbsensiBtn = document.getElementById('tabAbsensiBtn');
  const tabRekapBtn = document.getElementById('tabRekapBtn');
  const tabInsentifBtn = document.getElementById('tabInsentifBtn');
  const tabPengaturanBtn = document.getElementById('tabPengaturanBtn');
  if (tabAbsensiBtn) tabAbsensiBtn.classList.toggle('active', tabId === 'absensi');
  if (tabRekapBtn) tabRekapBtn.classList.toggle('active', tabId === 'rekap');
  if (tabInsentifBtn) tabInsentifBtn.classList.toggle('active', tabId === 'insentif');
  if (tabPengaturanBtn) tabPengaturanBtn.classList.toggle('active', tabId === 'pengaturan');

  // Update Mobile Bottom Nav Buttons
  const mobNavAbsen = document.getElementById('mobNavAbsen');
  const mobNavRekap = document.getElementById('mobNavRekap');
  const mobNavInsentif = document.getElementById('mobNavInsentif');
  const mobNavPengaturan = document.getElementById('mobNavPengaturan');
  if (mobNavAbsen) mobNavAbsen.classList.toggle('active', tabId === 'absensi');
  if (mobNavRekap) mobNavRekap.classList.toggle('active', tabId === 'rekap');
  if (mobNavInsentif) mobNavInsentif.classList.toggle('active', tabId === 'insentif');
  if (mobNavPengaturan) mobNavPengaturan.classList.toggle('active', tabId === 'pengaturan');

  // Update Panels
  const panelAbsensi = document.getElementById('panelAbsensi');
  const panelRekap = document.getElementById('panelRekap');
  const panelInsentif = document.getElementById('panelInsentif');
  const panelPengaturan = document.getElementById('panelPengaturan');

  if (panelAbsensi) panelAbsensi.classList.toggle('active-panel', tabId === 'absensi');
  if (panelRekap) panelRekap.classList.toggle('active-panel', tabId === 'rekap');
  if (panelInsentif) panelInsentif.classList.toggle('active-panel', tabId === 'insentif');
  if (panelPengaturan) panelPengaturan.classList.toggle('active-panel', tabId === 'pengaturan');

  updateAdminUIState();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'rekap') {
    loadRecapData();
  } else if (tabId === 'absensi') {
    renderTodayMonitor();
    renderTeacherQuickChips();
    onSelectedTeacherChange();
  } else if (tabId === 'insentif') {
    loadSalaryData();
  } else if (tabId === 'pengaturan') {
    renderTeachersManageTable();
  }
}

/* PIN Keypad Handlers */
function openAdminPinModal(targetTab = 'insentif') {
  adminPinTargetTab = targetTab;
  currentEnteredPin = "";
  const inputEl = document.getElementById('inputPinEntered');
  if (inputEl) inputEl.value = "";

  const introText = document.getElementById('adminPinIntroText');
  if (introText) {
    if (targetTab === 'pengaturan') {
      introText.textContent = "Masukkan PIN Pengelola RQ untuk menambah guru, mengedit guru, dan mengatur lembaga.";
    } else if (targetTab === 'insentif') {
      introText.textContent = "Masukkan PIN Pengelola RQ untuk melihat rekapan insentif dan slip gaji pengajar.";
    } else {
      introText.textContent = "Masukkan PIN Pengelola RQ untuk membuka akses wewenang administrasi.";
    }
  }

  const modal = document.getElementById('modalAdminPin');
  if (modal) modal.style.display = 'flex';
}

function closeAdminPinModal() {
  const modal = document.getElementById('modalAdminPin');
  if (modal) modal.style.display = 'none';
  currentEnteredPin = "";
}

function pressPinKey(digit) {
  if (currentEnteredPin.length < 6) {
    currentEnteredPin += digit;
    const inputEl = document.getElementById('inputPinEntered');
    if (inputEl) inputEl.value = "•".repeat(currentEnteredPin.length);
  }
  if (navigator.vibrate) {
    try { navigator.vibrate(20); } catch (_) {}
  }
}

function deletePinKey() {
  if (currentEnteredPin.length > 0) {
    currentEnteredPin = currentEnteredPin.slice(0, -1);
    const inputEl = document.getElementById('inputPinEntered');
    if (inputEl) inputEl.value = "•".repeat(currentEnteredPin.length);
  }
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch (_) {}
  }
}

function clearPinKey() {
  currentEnteredPin = "";
  const inputEl = document.getElementById('inputPinEntered');
  if (inputEl) inputEl.value = "";
}

function submitAdminPin() {
  if (currentEnteredPin === adminPin) {
    isAdminUnlocked = true;
    closeAdminPinModal();
    updateAdminUIState();
    renderTeachersManageTable();
    loadRecapData();

    showToast('Alhamdulillah, Akses Pengelola Terbuka Penuh!', 'success');
    switchTab(adminPinTargetTab || 'insentif');
  } else {
    showToast('PIN salah! Silakan coba lagi.', 'error');
    clearPinKey();
  }
}

function lockAdminSession() {
  isAdminUnlocked = false;
  updateAdminUIState();
  renderTeachersManageTable();
  loadRecapData();

  showToast('Akses Pengelola telah dikunci kembali. Mode pengajar aktif.', 'info');
  switchTab('absensi');
}

function openChangePinModal() {
  document.getElementById('inputOldPin').value = '';
  document.getElementById('inputNewPin').value = '';
  document.getElementById('inputConfirmPin').value = '';
  document.getElementById('modalChangePin').style.display = 'flex';
}

function closeChangePinModal() {
  document.getElementById('modalChangePin').style.display = 'none';
}

function submitChangePin(e) {
  e.preventDefault();
  const oldPin = document.getElementById('inputOldPin').value.trim();
  const newPin = document.getElementById('inputNewPin').value.trim();
  const confirmPin = document.getElementById('inputConfirmPin').value.trim();

  if (oldPin !== adminPin) {
    showToast('PIN Lama tidak sesuai!', 'error');
    return;
  }
  if (newPin.length < 4 || newPin.length > 6) {
    showToast('PIN Baru harus 4 sampai 6 digit angka!', 'warning');
    return;
  }
  if (newPin !== confirmPin) {
    showToast('Konfirmasi PIN Baru tidak cocok!', 'error');
    return;
  }

  adminPin = newPin;
  localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, newPin);
  closeChangePinModal();
  showToast('PIN Pengelola berhasil diperbarui!', 'success');
}

const saveNewAdminPin = submitChangePin;

/* ============================================================
   PRESENSI PENGAJAR (TAB 1) & QUICK TOUCH TEACHER CHIPS
   ============================================================ */
function getTeacherInitials(name) {
  if (!name) return 'U';
  const clean = name.replace(/^(Ust\.|Usth\.|Ustadz|Ustadzah)\s+/i, '').trim();
  const words = clean.split(' ').filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}

function renderTeacherQuickChips(filterQuery = '') {
  const container = document.getElementById('teacherQuickChipsContainer');
  if (!container) return;

  const todayStr = getTodayDateString();
  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');
  const filtered = filterQuery.trim() === ''
    ? activeTeachers
    : activeTeachers.filter(t => t.name.toLowerCase().includes(filterQuery.toLowerCase()) || t.halaqah.toLowerCase().includes(filterQuery.toLowerCase()));

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size:0.82rem; color:var(--text-muted); padding:10px; width:100%; text-align:center;">Tidak ada pengajar yang cocok.</div>`;
    return;
  }

  filtered.forEach(t => {
    const initials = getTeacherInitials(t.name);
    const existingLog = attendanceLogs.find(l => l.teacherId === t.id && l.date === todayStr);

    let statusText = 'Belum Hadir';
    let statusClass = '';

    if (existingLog) {
      if (existingLog.type === 'Hadir') {
        statusText = `✓ Hadir (${existingLog.time})`;
        statusClass = 'is-present';
      } else {
        statusText = existingLog.type;
        statusClass = 'is-present';
      }
    }

    const isSelected = selectedTeacherId === t.id;

    const chip = document.createElement('div');
    chip.className = `teacher-chip ${isSelected ? 'selected' : ''}`;
    chip.onclick = () => selectTeacherFromChip(t.id);
    chip.innerHTML = `
      <div class="chip-avatar">${initials}</div>
      <div class="chip-info">
        <span class="chip-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
        <span class="chip-status ${statusClass}">${statusText}</span>
      </div>
    `;
    container.appendChild(chip);
  });
}

function filterTeacherQuickChips(query) {
  renderTeacherQuickChips(query);
}

function selectTeacherFromChip(teacherId) {
  selectedTeacherId = teacherId;
  const select = document.getElementById('selectTeacherAttendance');
  if (select) select.value = teacherId;

  if (navigator.vibrate) {
    try { navigator.vibrate(30); } catch (_) {}
  }

  onSelectedTeacherChange();
  renderTeacherQuickChips();
}

function renderTeacherSelectOptions() {
  const select = document.getElementById('selectTeacherAttendance');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Sentuh untuk memilih nama Anda --</option>';

  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');
  activeTeachers.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.halaqah})`;
    select.appendChild(opt);
  });

  if (currentVal && activeTeachers.some(t => t.id === currentVal)) {
    select.value = currentVal;
  }
}

function onSelectedTeacherChange() {
  const select = document.getElementById('selectTeacherAttendance');
  selectedTeacherId = select.value;

  const btnCheckIn = document.getElementById('btnCheckIn');
  const btnIzin = document.getElementById('btnIzin');
  const banner = document.getElementById('teacherStatusBanner');
  const bannerIcon = document.getElementById('bannerIcon');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerSubtitle = document.getElementById('bannerSubtitle');

  document.querySelectorAll('.teacher-chip').forEach(c => c.classList.remove('selected'));

  if (!selectedTeacherId) {
    btnCheckIn.disabled = true;
    btnCheckIn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Hadir Sekarang</span>`;
    btnIzin.disabled = true;

    banner.className = 'status-banner banner-neutral';
    bannerIcon.textContent = 'ℹ️';
    bannerTitle.textContent = 'Pilih nama pengajar terlebih dahulu';
    bannerSubtitle.textContent = 'Status kehadiran Anda hari ini akan tampil di sini';
    return;
  }

  const teacher = teachersList.find(t => t.id === selectedTeacherId);
  const todayStr = getTodayDateString();
  const existingLog = attendanceLogs.find(l => l.teacherId === selectedTeacherId && l.date === todayStr);

  if (existingLog) {
    if (existingLog.type === 'Hadir') {
      btnCheckIn.disabled = true;
      btnCheckIn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Sudah Hadir (Jam ${existingLog.time})</span>`;
      btnIzin.disabled = true;

      banner.className = 'status-banner banner-success';
      bannerIcon.textContent = '✅';
      bannerTitle.textContent = `Alhamdulillah! ${teacher.name} Sudah Hadir`;
      bannerSubtitle.textContent = `Tercatat masuk pada pukul ${existingLog.time}. Terima kasih atas dedikasinya.`;
    } else {
      btnCheckIn.disabled = true;
      btnCheckIn.innerHTML = `<span>Tercatat ${existingLog.type}</span>`;
      btnIzin.disabled = true;

      banner.className = 'status-banner banner-warning';
      bannerIcon.textContent = '⚠️';
      bannerTitle.textContent = `${teacher.name} Tercatat ${existingLog.type}`;
      bannerSubtitle.textContent = existingLog.note ? `Keterangan: ${existingLog.note}` : 'Tercatat tidak hadir mengajar hari ini.';
    }
  } else {
    btnCheckIn.disabled = false;
    btnCheckIn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Hadir Sekarang</span>`;
    btnIzin.disabled = false;

    banner.className = 'status-banner banner-neutral';
    bannerIcon.textContent = '👋';
    bannerTitle.textContent = `Ahlan wa Sahlan, ${teacher.name}`;
    bannerSubtitle.textContent = `Belum tercatat hari ini. Silakan klik tombol "Hadir Sekarang".`;
  }
}

function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 Harmonic
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
    });
  } catch (_) {}
}

function recordAttendance(type, note = '') {
  if (!selectedTeacherId) {
    showToast('Silakan pilih nama Anda terlebih dahulu', 'warning');
    return;
  }

  const teacher = teachersList.find(t => t.id === selectedTeacherId);
  if (!teacher) return;

  const todayStr = getTodayDateString();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const existingIdx = attendanceLogs.findIndex(l => l.teacherId === selectedTeacherId && l.date === todayStr);
  if (existingIdx !== -1) {
    showToast('Kehadiran untuk hari ini sudah tercatat sebelumnya.', 'warning');
    return;
  }

  const newLog = {
    id: 'log-' + Date.now(),
    teacherId: teacher.id,
    teacherName: teacher.name,
    date: todayStr,
    time: timeStr,
    type: type,
    note: note || (type === 'Hadir' ? 'Tepat Waktu' : '')
  };

  attendanceLogs.unshift(newLog);
  saveLogsToStorage();

  if (type === 'Hadir') {
    playSuccessChime();
    if (navigator.vibrate) {
      try { navigator.vibrate([40, 60, 40]); } catch (_) {}
    }
    showToast(`Alhamdulillah! Kehadiran ${teacher.name} berhasil tercatat pukul ${timeStr}`, 'success');
  } else {
    if (navigator.vibrate) {
      try { navigator.vibrate(50); } catch (_) {}
    }
    showToast(`Catatan ${type} ${teacher.name} berhasil disimpan.`, 'info');
  }

  onSelectedTeacherChange();
  renderTeacherQuickChips();
  renderTodayMonitor();
  loadRecapData();
  if (isAdminUnlocked) loadSalaryData();
}

function openIzinModal() {
  if (!selectedTeacherId) {
    showToast('Pilih nama pengajar terlebih dahulu', 'warning');
    return;
  }
  const teacher = teachersList.find(t => t.id === selectedTeacherId);
  document.getElementById('modalIzinTeacherName').textContent = teacher ? teacher.name : '-';
  document.getElementById('inputCatatanIzin').value = '';
  document.getElementById('selectAlasanIzin').value = 'Izin';
  document.getElementById('modalIzin').style.display = 'flex';
}

function closeIzinModal() {
  document.getElementById('modalIzin').style.display = 'none';
}

function submitIzin() {
  const type = document.getElementById('selectAlasanIzin').value;
  const note = document.getElementById('inputCatatanIzin').value.trim();

  recordAttendance(type, note);
  closeIzinModal();
}

function renderTodayMonitor() {
  const grid = document.getElementById('todayTeachersGrid');
  if (!grid) return;

  const todayStr = getTodayDateString();
  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');

  let countHadir = 0;
  let countIzin = 0;
  let countBelum = 0;

  grid.innerHTML = '';

  activeTeachers.forEach(t => {
    const log = attendanceLogs.find(l => l.teacherId === t.id && l.date === todayStr);

    let statusHtml = '';
    if (log) {
      if (log.type === 'Hadir') {
        countHadir++;
        statusHtml = `<span class="status-badge badge-hadir">✓ Hadir (${log.time})</span>`;
      } else if (log.type === 'Izin') {
        countIzin++;
        statusHtml = `<span class="status-badge badge-izin">Izin</span>`;
      } else if (log.type === 'Sakit') {
        countIzin++;
        statusHtml = `<span class="status-badge badge-sakit">Sakit</span>`;
      }
    } else {
      countBelum++;
      statusHtml = `<span class="status-badge badge-belum">Belum Hadir</span>`;
    }

    const card = document.createElement('div');
    card.className = 'teacher-today-card';
    card.innerHTML = `
      <div class="teacher-info">
        <span class="teacher-name">${escapeHtml(t.name)}</span>
        <span class="teacher-sub">${escapeHtml(t.halaqah)}</span>
      </div>
      <div>
        ${statusHtml}
      </div>
    `;
    grid.appendChild(card);
  });

  document.getElementById('todayHadirCount').textContent = countHadir;
  document.getElementById('todayIzinCount').textContent = countIzin;
  document.getElementById('todayBelumCount').textContent = countBelum;
}

/* ============================================================
   REKAPITULASI KEHADIRAN (TAB 2)
   ============================================================ */
function setupRecapMonthFilter() {
  const now = new Date();
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');

  if (monthSelect) monthSelect.value = now.getMonth() + 1;
  if (yearSelect) yearSelect.value = now.getFullYear();
}

function loadRecapData() {
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);

  const tbody = document.getElementById('recapTableBody');
  const mobileContainer = document.getElementById('recapCardsMobile');
  if (!tbody) return;

  const monthStrPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const filteredLogs = attendanceLogs.filter(l => l.date && l.date.startsWith(monthStrPrefix));

  let totalAllHadir = 0;
  let totalAllIzin = 0;
  let totalAllSakit = 0;

  tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');

  activeTeachers.forEach((teacher, idx) => {
    const teacherLogs = filteredLogs.filter(l => l.teacherId === teacher.id);
    const hadirCount = teacherLogs.filter(l => l.type === 'Hadir').length;
    const izinCount = teacherLogs.filter(l => l.type === 'Izin').length;
    const sakitCount = teacherLogs.filter(l => l.type === 'Sakit').length;
    const totalSesi = hadirCount + izinCount + sakitCount;

    totalAllHadir += hadirCount;
    totalAllIzin += izinCount;
    totalAllSakit += sakitCount;

    const rate = totalSesi > 0 ? Math.round((hadirCount / totalSesi) * 100) : 0;
    
    let rateClass = 'rate-low';
    if (rate >= 80) rateClass = 'rate-high';
    else if (rate >= 60) rateClass = 'rate-mid';

    // 1. Desktop Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">${idx + 1}</td>
      <td><strong>${escapeHtml(teacher.name)}</strong></td>
      <td><span class="text-secondary">${escapeHtml(teacher.halaqah)}</span></td>
      <td class="text-center font-bold text-success">${hadirCount}</td>
      <td class="text-center text-amber">${izinCount}</td>
      <td class="text-center text-danger">${sakitCount}</td>
      <td class="text-center">${totalSesi}</td>
      <td class="text-center">
        <span class="rate-badge ${rateClass}">${rate}%</span>
      </td>
      <td class="text-center action-col">
        <button class="btn-table-action" onclick="viewTeacherMonthDetail('${teacher.id}', ${selectedMonth}, ${selectedYear})" title="Rincian Kehadiran">
          🔍 Rincian
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card
    if (mobileContainer) {
      const mobCard = document.createElement('div');
      mobCard.className = 'recap-card-mobile-item';
      mobCard.innerHTML = `
        <div class="rc-header">
          <div>
            <div class="rc-name">${escapeHtml(teacher.name)}</div>
            <div class="rc-sub">${escapeHtml(teacher.halaqah)}</div>
          </div>
          <span class="rate-badge ${rateClass}">${rate}%</span>
        </div>
        <div class="rc-stats-row">
          <div class="rc-stat-box"><strong class="text-success">${hadirCount}</strong><span>Hadir</span></div>
          <div class="rc-stat-box"><strong class="text-amber">${izinCount}</strong><span>Izin</span></div>
          <div class="rc-stat-box"><strong class="text-danger">${sakitCount}</strong><span>Sakit</span></div>
          <div class="rc-stat-box"><strong>${totalSesi}</strong><span>Sesi</span></div>
        </div>
        <div class="rc-footer">
          <div class="rc-progress-bar-wrap">
            <div class="rc-progress-bar" style="width: ${rate}%;"></div>
          </div>
          <button class="btn-table-action" onclick="viewTeacherMonthDetail('${teacher.id}', ${selectedMonth}, ${selectedYear})" title="Rincian Kehadiran">
            🔍 Rincian
          </button>
        </div>
      `;
      mobileContainer.appendChild(mobCard);
    }
  });

  if (activeTeachers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px; color: var(--text-muted);">Belum ada data pengajar aktif.</td></tr>`;
    if (mobileContainer) {
      mobileContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Belum ada data pengajar aktif.</div>`;
    }
  }

  const totalIzinDanSakit = totalAllIzin + totalAllSakit;
  const totalAllSesi = totalAllHadir + totalIzinDanSakit;
  const avgRate = totalAllSesi > 0 ? Math.round((totalAllHadir / totalAllSesi) * 100) : 0;

  document.getElementById('metricTotalHadir').textContent = totalAllHadir;
  document.getElementById('metricTotalIzin').textContent = totalIzinDanSakit;
  document.getElementById('metricActiveTeachers').textContent = activeTeachers.length;
  document.getElementById('metricAvgRate').textContent = `${avgRate}%`;

  renderLogList(filteredLogs);
}

function renderLogList(logs) {
  const container = document.getElementById('logListContainer');
  const label = document.getElementById('logCountLabel');
  if (!container) return;

  label.textContent = `${logs.length} Catatan`;

  if (logs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Tidak ada catatan presensi pada periode bulan ini.</div>`;
    return;
  }

  container.innerHTML = '';
  const sorted = [...logs].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  sorted.slice(0, 30).forEach(l => {
    let dotColor = 'var(--accent-success)';
    if (l.type === 'Izin') dotColor = 'var(--gold)';
    if (l.type === 'Sakit') dotColor = 'var(--accent-danger)';

    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `
      <div class="log-item-left">
        <span class="log-dot" style="background-color: ${dotColor};"></span>
        <div class="log-details">
          <span class="log-teacher-name">${escapeHtml(l.teacherName)}</span>
          <span class="log-meta">${formatIndonesianDateDisplay(l.date)} • Pukul ${l.time} • <strong>${l.type}</strong> ${l.note ? `(${escapeHtml(l.note)})` : ''}</span>
        </div>
      </div>
      <div>
        ${isAdminUnlocked ? `<button class="btn-delete-log" title="Hapus Catatan Ini (Khusus Pengelola)" onclick="deleteLogEntry('${l.id}')">Hapus</button>` : ''}
      </div>
    `;
    container.appendChild(item);
  });
}

function deleteLogEntry(logId) {
  if (!isAdminUnlocked) {
    showToast('Hanya pengelola yang berhak menghapus riwayat presensi.', 'warning');
    openAdminPinModal('rekap');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin menghapus catatan presensi ini?')) return;

  attendanceLogs = attendanceLogs.filter(l => l.id !== logId);
  saveLogsToStorage();
  showToast('Catatan presensi berhasil dihapus.', 'info');
  loadRecapData();
  renderTodayMonitor();
  renderTeacherQuickChips();
  onSelectedTeacherChange();
  if (isAdminUnlocked) loadSalaryData();
}

function viewTeacherMonthDetail(teacherId, month, year) {
  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  document.getElementById('modalDetailTitle').textContent = `Presensi: ${teacher.name} (${monthNames[month]} ${year})`;

  const monthStrPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const logs = attendanceLogs.filter(l => l.teacherId === teacherId && l.date.startsWith(monthStrPrefix));

  const hadir = logs.filter(l => l.type === 'Hadir').length;
  const izin = logs.filter(l => l.type === 'Izin').length;
  const sakit = logs.filter(l => l.type === 'Sakit').length;

  document.getElementById('teacherDetailStatsBox').innerHTML = `
    <div><strong>${hadir}</strong><span>Hari Hadir</span></div>
    <div><strong>${izin}</strong><span>Hari Izin</span></div>
    <div><strong>${sakit}</strong><span>Hari Sakit</span></div>
  `;

  const tbody = document.getElementById('teacherDetailTableBody');
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 18px;">Belum ada riwayat kehadiran di bulan ini.</td></tr>`;
  } else {
    logs.sort((a, b) => a.date.localeCompare(b.date));
    logs.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatIndonesianDateDisplay(l.date)}</td>
        <td>${l.time}</td>
        <td><strong>${l.type}</strong></td>
        <td>${escapeHtml(l.note || '-')}</td>
        <td class="text-center">
          ${isAdminUnlocked ? `<button class="btn-delete-log" onclick="deleteLogEntry('${l.id}'); viewTeacherMonthDetail('${teacherId}', ${month}, ${year});">Hapus</button>` : `<span style="color:var(--text-muted);font-size:0.75rem;">Tercatat</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('modalDetailGuru').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('modalDetailGuru').style.display = 'none';
}

/* ============================================================
   TAB 3: PEREKAPAN INSENTIF & SLIP GAJI (KHUSUS PENGELOLA)
   ============================================================ */
function calculateTeacherSalary(teacher, selectedMonth, selectedYear) {
  const monthStrPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const logs = attendanceLogs.filter(l => l.teacherId === teacher.id && l.date && l.date.startsWith(monthStrPrefix));

  const hadirCount = logs.filter(l => l.type === 'Hadir').length;
  const izinCount = logs.filter(l => l.type === 'Izin').length;
  const sakitCount = logs.filter(l => l.type === 'Sakit').length;
  const totalSesi = hadirCount + izinCount + sakitCount;
  const ratePct = totalSesi > 0 ? Math.round((hadirCount / totalSesi) * 100) : 0;

  // Check custom override for this month
  const overrideKey = `${selectedYear}-${selectedMonth}_${teacher.id}`;
  const override = salaryOverrides[overrideKey] || null;

  let pokok = override ? Number(override.pokok) : Number(slipSettings.basePokok);
  let rateHadir = override ? Number(override.rateHadir) : Number(slipSettings.ratePerHadir);
  let insentifHadir = hadirCount * rateHadir;
  
  let bonus = 0;
  if (override) {
    bonus = Number(override.bonus || 0);
  } else {
    // Default full attendance bonus rule (hadir >= 10 & 0 absent)
    if (totalSesi >= 10 && izinCount === 0 && sakitCount === 0) {
      bonus = Number(slipSettings.bonusFullAttendance);
    }
  }

  let potongan = override ? Number(override.potongan || 0) : 0;
  let totalDiterima = pokok + insentifHadir + bonus - potongan;
  if (totalDiterima < 0) totalDiterima = 0;

  return {
    teacher,
    hadirCount,
    izinCount,
    sakitCount,
    totalSesi,
    ratePct,
    pokok,
    rateHadir,
    insentifHadir,
    bonus,
    potongan,
    totalDiterima,
    isOverridden: !!override
  };
}

function loadSalaryData() {
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);

  const tbody = document.getElementById('salaryTableBody');
  const mobileContainer = document.getElementById('salaryCardsMobile');
  if (!tbody) return;

  // Update Summary Rate Pill in Top Banner
  document.getElementById('summaryRatePokok').textContent = formatRupiah(slipSettings.basePokok);
  document.getElementById('summaryRateHadir').textContent = formatRupiah(slipSettings.ratePerHadir);
  document.getElementById('summaryRateBonus').textContent = formatRupiah(slipSettings.bonusFullAttendance);

  tbody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');

  let totalBudget = 0;
  let totalPaidSessions = 0;

  activeTeachers.forEach((teacher, idx) => {
    const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);
    totalBudget += sal.totalDiterima;
    totalPaidSessions += sal.hadirCount;

    // 1. Desktop Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">${idx + 1}</td>
      <td>
        <strong>${escapeHtml(teacher.name)}</strong>
        <br><span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(teacher.halaqah)}</span>
      </td>
      <td class="text-center font-bold text-success">${sal.hadirCount} hari</td>
      <td class="text-center">${formatRupiah(sal.pokok)}</td>
      <td class="text-center font-bold">${formatRupiah(sal.insentifHadir)}</td>
      <td class="text-center text-amber">${formatRupiah(sal.bonus)}</td>
      <td class="text-center text-danger">${sal.potongan > 0 ? '- ' + formatRupiah(sal.potongan) : '0'}</td>
      <td class="text-center font-bold" style="color:var(--primary); font-size:1rem;">
        ${formatRupiah(sal.totalDiterima)}
        ${sal.isOverridden ? '<span title="Nominal dikustom khusus" style="font-size:0.7rem; color:var(--gold);">★</span>' : ''}
      </td>
      <td class="text-center">
        <div style="display:flex; gap:6px; justify-content:center;">
          <button class="btn-action-slip" onclick="viewSlipPreview('${teacher.id}')" title="Lihat & Unduh Slip">
            👁️ Slip
          </button>
          <button class="btn-action-wa" onclick="sendSlipDirectViaWa('${teacher.id}')" title="Kirim Slip ke WhatsApp">
            💬 WA
          </button>
          <button class="btn-action-edit-sal" onclick="openEditTeacherSalaryModal('${teacher.id}')" title="Sesuaikan Nominal">
            ✏️ Edit
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card Item
    if (mobileContainer) {
      const mobCard = document.createElement('div');
      mobCard.className = 'salary-card-item';
      mobCard.innerHTML = `
        <div class="sal-card-header">
          <div>
            <div class="sal-card-name">${escapeHtml(teacher.name)}</div>
            <div class="sal-card-sub">${escapeHtml(teacher.halaqah)}</div>
          </div>
          <div class="sal-card-total-badge">
            <strong>${formatRupiah(sal.totalDiterima)}</strong>
            <span>Total Diterima</span>
          </div>
        </div>

        <div class="sal-breakdown-box">
          <div class="sal-row-line">
            <span>Hari Hadir:</span>
            <strong class="text-success">${sal.hadirCount} Hari Mengajar</strong>
          </div>
          <div class="sal-row-line">
            <span>${escapeHtml(slipSettings.labelPokok)}:</span>
            <span>${formatRupiah(sal.pokok)}</span>
          </div>
          <div class="sal-row-line">
            <span>${escapeHtml(slipSettings.labelHadir)} (${sal.hadirCount} x ${formatRupiah(sal.rateHadir)}):</span>
            <span>${formatRupiah(sal.insentifHadir)}</span>
          </div>
          ${sal.bonus > 0 ? `
          <div class="sal-row-line">
            <span class="text-amber">${escapeHtml(slipSettings.labelBonus)}:</span>
            <span class="text-amber">+ ${formatRupiah(sal.bonus)}</span>
          </div>` : ''}
          ${sal.potongan > 0 ? `
          <div class="sal-row-line">
            <span class="text-danger">${escapeHtml(slipSettings.labelPotongan)}:</span>
            <span class="text-danger">- ${formatRupiah(sal.potongan)}</span>
          </div>` : ''}
        </div>

        <div class="sal-card-actions">
          <button class="btn-action-edit-sal" onclick="openEditTeacherSalaryModal('${teacher.id}')" title="Sesuaikan Nominal">
            ✏️ Edit
          </button>
          <button class="btn-action-slip" onclick="viewSlipPreview('${teacher.id}')" title="Lihat & Unduh Slip">
            👁️ Slip
          </button>
          <button class="btn-action-wa" onclick="sendSlipDirectViaWa('${teacher.id}')" title="Kirim ke WhatsApp">
            💬 WA
          </button>
        </div>
      `;
      mobileContainer.appendChild(mobCard);
    }
  });

  if (activeTeachers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px; color: var(--text-muted);">Belum ada data pengajar aktif.</td></tr>`;
    if (mobileContainer) {
      mobileContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Belum ada data pengajar aktif.</div>`;
    }
  }

  // Update Summary Financial Metrics
  const avgSalary = activeTeachers.length > 0 ? Math.round(totalBudget / activeTeachers.length) : 0;
  document.getElementById('metricTotalBudget').textContent = formatRupiah(totalBudget);
  document.getElementById('metricSalaryTeacherCount').textContent = `${activeTeachers.length} Guru`;
  document.getElementById('metricSalarySessionCount').textContent = `${totalPaidSessions} Sesi`;
  document.getElementById('metricAvgSalary').textContent = formatRupiah(avgSalary);
}

/* ============================================================
   SLIP DESIGNER MODAL & SETTINGS
   ============================================================ */
function openSlipDesignerModal() {
  // Populate form with current settings
  document.getElementById('inputSlipTitle').value = slipSettings.slipTitle;
  document.getElementById('inputSlipOrgName').value = slipSettings.orgName;
  document.getElementById('inputSlipOrgTagline').value = slipSettings.orgTagline;
  document.getElementById('inputSlipOrgContact').value = slipSettings.orgContact;
  document.getElementById('inputSlipFooterQuote').value = slipSettings.footerQuote;
  document.getElementById('inputSlipSignerCity').value = slipSettings.signerCity;
  document.getElementById('inputSlipSignerName').value = slipSettings.signerName;
  document.getElementById('inputSlipSignerTitle').value = slipSettings.signerTitle;

  document.getElementById('inputBasePokok').value = slipSettings.basePokok;
  document.getElementById('inputRatePerHadir').value = slipSettings.ratePerHadir;
  document.getElementById('inputBonusFull').value = slipSettings.bonusFullAttendance;
  document.getElementById('inputLabelPokok').value = slipSettings.labelPokok;
  document.getElementById('inputLabelHadir').value = slipSettings.labelHadir;
  document.getElementById('inputLabelBonus').value = slipSettings.labelBonus;
  document.getElementById('inputLabelPotongan').value = slipSettings.labelPotongan;

  selectSlipThemePreset(slipSettings.templateTheme || 'emerald');
  renderLogoPreview();

  switchDesignerTab('design');
  document.getElementById('modalSlipDesigner').style.display = 'flex';
}

function closeSlipDesignerModal() {
  document.getElementById('modalSlipDesigner').style.display = 'none';
}

function switchDesignerTab(tab) {
  document.getElementById('tabDsDesign').classList.toggle('active', tab === 'design');
  document.getElementById('tabDsText').classList.toggle('active', tab === 'text');
  document.getElementById('tabDsRates').classList.toggle('active', tab === 'rates');

  document.getElementById('paneDsDesign').classList.toggle('active', tab === 'design');
  document.getElementById('paneDsText').classList.toggle('active', tab === 'text');
  document.getElementById('paneDsRates').classList.toggle('active', tab === 'rates');
}

function selectSlipThemePreset(theme) {
  slipSettings.templateTheme = theme;
  document.querySelectorAll('.slip-theme-card').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`st${capitalizeFirstLetter(theme)}`);
  if (target) target.classList.add('active');
}

function renderLogoPreview() {
  const container = document.getElementById('currentLogoPreviewContainer');
  if (!container) return;

  if (slipSettings.customLogoUrl) {
    container.innerHTML = `<img src="${slipSettings.customLogoUrl}" alt="Logo">`;
  } else {
    container.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2" class="quran-icon" style="width: 32px; height: 32px;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>`;
  }
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    slipSettings.customLogoUrl = e.target.result;
    renderLogoPreview();
    showToast('Logo berhasil diunggah!', 'success');
  };
  reader.readAsDataURL(file);
}

function resetSlipLogoToDefault() {
  slipSettings.customLogoUrl = "";
  renderLogoPreview();
  showToast('Logo dikembalikan ke ikon default.', 'info');
}

/* ============================================================
   PENGATURAN TARIF & DESAINER SLIP GAJI
   ============================================================ */
function validateNominalInput(inputEl) {
  // Mengizinkan nominal ganjil maupun genap (misal 43.750, 43.000, 35.000, dll)
  return true;
}

function saveSlipDesignerSettings(e) {
  e.preventDefault();

  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Hanya pengelola yang dapat mengubah pengaturan tarif.', 'error');
    openAdminPinModal('insentif');
    return;
  }

  const basePokok = parseNominalInput(document.getElementById('inputBasePokok').value);
  const ratePerHadir = parseNominalInput(document.getElementById('inputRatePerHadir').value);
  const bonusFullAttendance = parseNominalInput(document.getElementById('inputBonusFull').value);

  if (ratePerHadir < 0 || basePokok < 0 || bonusFullAttendance < 0) {
    showToast('Nominal tarif tidak boleh bernilai negatif.', 'error');
    return;
  }

  slipSettings.slipTitle = document.getElementById('inputSlipTitle').value.trim();
  slipSettings.orgName = document.getElementById('inputSlipOrgName').value.trim();
  slipSettings.orgTagline = document.getElementById('inputSlipOrgTagline').value.trim();
  slipSettings.orgContact = document.getElementById('inputSlipOrgContact').value.trim();
  slipSettings.footerQuote = document.getElementById('inputSlipFooterQuote').value.trim();
  slipSettings.signerCity = document.getElementById('inputSlipSignerCity').value.trim();
  slipSettings.signerName = document.getElementById('inputSlipSignerName').value.trim();
  slipSettings.signerTitle = document.getElementById('inputSlipSignerTitle').value.trim();

  slipSettings.basePokok = basePokok;
  slipSettings.ratePerHadir = ratePerHadir;
  slipSettings.bonusFullAttendance = bonusFullAttendance;
  slipSettings.labelPokok = document.getElementById('inputLabelPokok').value.trim();
  slipSettings.labelHadir = document.getElementById('inputLabelHadir').value.trim();
  slipSettings.labelBonus = document.getElementById('inputLabelBonus').value.trim();
  slipSettings.labelPotongan = document.getElementById('inputLabelPotongan').value.trim();

  saveSlipSettingsToStorage();
  closeSlipDesignerModal();
  loadSalaryData();
  showToast(`Pengaturan tarif berhasil disimpan! Tarif per hadir: ${formatRupiah(ratePerHadir)}`, 'success');
}

/* ============================================================
   MODAL EDIT NOMINAL KHUSUS PER GURU
   ============================================================ */
function openEditTeacherSalaryModal(teacherId) {
  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Penyesuaian tarif guru dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('insentif');
    return;
  }

  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);

  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);

  document.getElementById('modalEditSalaryTeacherTitle').textContent = `Sesuaikan Nominal: ${teacher.name}`;
  document.getElementById('overrideTeacherId').value = teacher.id;
  document.getElementById('overrideInputPokok').value = sal.pokok;
  document.getElementById('overrideInputRateHadir').value = sal.rateHadir;
  document.getElementById('overrideInputBonus').value = sal.bonus;
  document.getElementById('overrideInputPotongan').value = sal.potongan;
  document.getElementById('overrideInputCatatan').value = '';

  document.getElementById('modalEditTeacherSalary').style.display = 'flex';
}

function closeEditTeacherSalaryModal() {
  document.getElementById('modalEditTeacherSalary').style.display = 'none';
}

function saveTeacherSalaryOverride(e) {
  e.preventDefault();

  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Hanya pengelola yang berhak menyimpan nominal khusus.', 'error');
    openAdminPinModal('insentif');
    return;
  }

  const teacherId = document.getElementById('overrideTeacherId').value;
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);

  const pokok = parseNominalInput(document.getElementById('overrideInputPokok').value);
  const rateHadir = parseNominalInput(document.getElementById('overrideInputRateHadir').value);
  const bonus = parseNominalInput(document.getElementById('overrideInputBonus').value);
  const potongan = parseNominalInput(document.getElementById('overrideInputPotongan').value);

  if (pokok < 0 || rateHadir < 0 || bonus < 0 || potongan < 0) {
    showToast('Nominal tidak boleh bernilai negatif.', 'error');
    return;
  }

  const overrideKey = `${selectedYear}-${selectedMonth}_${teacherId}`;
  salaryOverrides[overrideKey] = {
    pokok: pokok,
    rateHadir: rateHadir,
    bonus: bonus,
    potongan: potongan,
    note: document.getElementById('overrideInputCatatan').value.trim()
  };

  saveSalaryOverridesToStorage();
  closeEditTeacherSalaryModal();
  loadSalaryData();
  showToast(`Nominal khusus guru (${formatRupiah(rateHadir)}/hadir) berhasil disimpan!`, 'success');
}

function resetTeacherSalaryToDefault() {
  const teacherId = document.getElementById('overrideTeacherId').value;
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);

  const overrideKey = `${selectedYear}-${selectedMonth}_${teacherId}`;
  delete salaryOverrides[overrideKey];

  saveSalaryOverridesToStorage();
  closeEditTeacherSalaryModal();
  loadSalaryData();
  showToast('Nominal dikembalikan ke rumus standar.', 'info');
}

/* ============================================================
   SLIP PREVIEW VISUAL MODAL & IMAGE GENERATOR
   ============================================================ */
const SLIP_THEME_HEX = {
  emerald: '#065f46',
  ocean: '#1d4ed8',
  gold: '#b45309',
  slate: '#334155'
};

function viewSlipPreview(teacherId) {
  activePreviewTeacherId = teacherId;
  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);

  // Apply Theme Accent Color
  const themeHex = SLIP_THEME_HEX[slipSettings.templateTheme] || '#065f46';
  const paper = document.getElementById('renderedSlipPaper');
  paper.style.setProperty('--slip-theme-color', themeHex);

  // Logo
  const logoWrap = document.getElementById('slipPaperLogoWrap');
  if (slipSettings.customLogoUrl) {
    logoWrap.innerHTML = `<img src="${slipSettings.customLogoUrl}" class="slip-logo-img" alt="Logo">`;
  } else {
    logoWrap.innerHTML = `
      <div class="logo-circle" style="background:${themeHex}; width:50px; height:50px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" class="quran-icon" style="width:28px;height:28px;">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
          <path d="M6 6h10"></path><path d="M6 10h10"></path>
        </svg>
      </div>`;
  }

  // Header Details
  document.getElementById('slipPaperOrgName').textContent = slipSettings.orgName;
  document.getElementById('slipPaperOrgTagline').textContent = slipSettings.orgTagline;
  document.getElementById('slipPaperOrgContact').textContent = slipSettings.orgContact;
  document.getElementById('slipPaperDocTitle').textContent = slipSettings.slipTitle;

  // Metadata
  document.getElementById('slipPaperTeacherName').textContent = teacher.name;
  document.getElementById('slipPaperPeriod').textContent = `${monthNames[selectedMonth]} ${selectedYear}`;
  document.getElementById('slipPaperHalaqah').textContent = teacher.halaqah;
  document.getElementById('slipPaperPhone').textContent = teacher.phone || '-';

  // Attendance
  document.getElementById('slipPaperHadirCount').textContent = sal.hadirCount;
  document.getElementById('slipPaperIzinCount').textContent = sal.izinCount + sal.sakitCount;
  document.getElementById('slipPaperRatePct').textContent = `${sal.ratePct}%`;

  // Financial Breakdown Rows
  const tbody = document.getElementById('slipPaperTableBody');
  tbody.innerHTML = '';

  const rows = [
    { no: 1, name: slipSettings.labelPokok, amount: sal.pokok },
    { no: 2, name: `${slipSettings.labelHadir} (${sal.hadirCount} hari x ${formatRupiah(sal.rateHadir)})`, amount: sal.insentifHadir }
  ];

  let currentNo = 3;
  if (sal.bonus > 0) {
    rows.push({ no: currentNo++, name: slipSettings.labelBonus, amount: sal.bonus });
  }
  if (sal.potongan > 0) {
    rows.push({ no: currentNo++, name: `${slipSettings.labelPotongan} (Pengurang)`, amount: -sal.potongan });
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: center;">${r.no}</td>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align: right; font-weight: 600; color: ${r.amount < 0 ? '#dc2626' : 'inherit'};">
        ${r.amount < 0 ? '- ' + formatRupiah(Math.abs(r.amount)) : formatRupiah(r.amount)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Total & Terbilang
  document.getElementById('slipPaperGrandTotal').textContent = formatRupiah(sal.totalDiterima);
  document.getElementById('slipPaperTerbilang').textContent = angkaKeTerbilang(sal.totalDiterima) + ' Rupiah';

  // Quote & Signatures
  document.getElementById('slipPaperFooterQuote').textContent = `"${slipSettings.footerQuote}"`;
  document.getElementById('slipPaperReceiverName').textContent = teacher.name;

  const now = new Date();
  document.getElementById('slipPaperSignDate').textContent = `${slipSettings.signerCity}, ${now.getDate()} ${monthNames[now.getMonth() + 1]} ${now.getFullYear()}`;
  document.getElementById('slipPaperSignerName').textContent = slipSettings.signerName;
  document.getElementById('slipPaperSignerTitle').textContent = slipSettings.signerTitle;

  document.getElementById('modalSlipPreview').style.display = 'flex';
}

function closeSlipPreviewModal() {
  document.getElementById('modalSlipPreview').style.display = 'none';
  activePreviewTeacherId = null;
}

/* Download Slip As High-Resolution PNG Image via HTML5 Canvas */
function downloadSlipAsImage() {
  if (!activePreviewTeacherId) return;
  const teacher = teachersList.find(t => t.id === activePreviewTeacherId);
  if (!teacher) return;

  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);
  const themeHex = SLIP_THEME_HEX[slipSettings.templateTheme] || '#065f46';

  // Create High-Res Canvas (800 x 1140 px)
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1140;
  const ctx = canvas.getContext('2d');

  // Background White
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 800, 1140);

  // Outer Decorative Border
  ctx.strokeStyle = themeHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 760, 1100);

  // Inner Dashed Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(28, 28, 744, 1084);
  ctx.setLineDash([]); // Reset dash

  // Top Accent Banner Strip
  ctx.fillStyle = themeHex;
  ctx.fillRect(20, 20, 760, 14);

  // Institution Header
  ctx.fillStyle = themeHex;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(slipSettings.orgName, 110, 75);

  ctx.fillStyle = '#475569';
  ctx.font = '500 14px sans-serif';
  ctx.fillText(slipSettings.orgTagline, 110, 100);

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText(slipSettings.orgContact, 110, 120);

  // Decorative Divider Line
  ctx.strokeStyle = themeHex;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(40, 140);
  ctx.lineTo(760, 140);
  ctx.stroke();

  // Document Badge Pill
  ctx.fillStyle = '#f0fdf4';
  ctx.fillRect(220, 155, 360, 36);
  ctx.strokeStyle = themeHex;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(220, 155, 360, 36);

  ctx.fillStyle = themeHex;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(slipSettings.slipTitle, 400, 179);
  ctx.textAlign = 'left';

  // Teacher Info Box
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, 205, 720, 80);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 205, 720, 80);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Nama Pengajar :', 60, 235);
  ctx.fillText('Periode :', 440, 235);
  ctx.fillText('Halaqah / Tugas :', 60, 265);
  ctx.fillText('No. WhatsApp :', 440, 265);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(teacher.name, 185, 235);
  ctx.fillText(`${monthNames[selectedMonth]} ${selectedYear}`, 520, 235);
  ctx.font = '500 14px sans-serif';
  ctx.fillText(teacher.halaqah, 185, 265);
  ctx.fillText(teacher.phone || '-', 555, 265);

  // Attendance Mini Box
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(40, 298, 720, 32);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`Kehadiran: ${sal.hadirCount} Hari Hadir`, 60, 319);
  ctx.fillText(`Izin/Sakit: ${sal.izinCount + sal.sakitCount} Hari`, 320, 319);
  ctx.fillText(`Persentase Hadir: ${sal.ratePct}%`, 560, 319);

  // Table Header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(40, 345, 720, 36);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(40, 345, 720, 36);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('No', 60, 368);
  ctx.fillText('Uraian Komponen Mukafa\'ah', 120, 368);
  ctx.textAlign = 'right';
  ctx.fillText('Jumlah (Rp)', 740, 368);
  ctx.textAlign = 'left';

  // Table Rows
  const rows = [
    { no: 1, name: slipSettings.labelPokok, amount: sal.pokok },
    { no: 2, name: `${slipSettings.labelHadir} (${sal.hadirCount} hari x ${formatRupiah(sal.rateHadir)})`, amount: sal.insentifHadir }
  ];

  let curNo = 3;
  if (sal.bonus > 0) {
    rows.push({ no: curNo++, name: slipSettings.labelBonus, amount: sal.bonus });
  }
  if (sal.potongan > 0) {
    rows.push({ no: curNo++, name: `${slipSettings.labelPotongan} (Pengurang)`, amount: -sal.potongan });
  }

  let y = 381;
  rows.forEach((r, idx) => {
    ctx.fillStyle = idx % 2 === 1 ? '#fafafa' : '#ffffff';
    ctx.fillRect(40, y, 720, 42);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(40, y, 720, 42);

    ctx.fillStyle = '#0f172a';
    ctx.font = '500 14px sans-serif';
    ctx.fillText(String(r.no), 65, y + 26);
    ctx.fillText(r.name, 120, y + 26);

    ctx.textAlign = 'right';
    ctx.font = 'bold 14px sans-serif';
    if (r.amount < 0) {
      ctx.fillStyle = '#dc2626';
      ctx.fillText('- ' + formatRupiah(Math.abs(r.amount)), 740, y + 26);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillText(formatRupiah(r.amount), 740, y + 26);
    }
    ctx.textAlign = 'left';
    y += 42;
  });

  // Grand Total Banner
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(40, y, 720, 52);
  ctx.strokeStyle = themeHex;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, y, 720, 52);

  ctx.fillStyle = themeHex;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('TOTAL DITERIMA (TAKE HOME PAY):', 60, y + 33);

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(formatRupiah(sal.totalDiterima), 740, y + 34);
  ctx.textAlign = 'left';

  // Terbilang
  y += 66;
  ctx.fillStyle = '#fffbeb';
  ctx.fillRect(40, y, 720, 36);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(40, y, 6, 36);

  ctx.fillStyle = '#78350f';
  ctx.font = 'italic 13px sans-serif';
  ctx.fillText('Terbilang : ' + angkaKeTerbilang(sal.totalDiterima) + ' Rupiah', 60, y + 23);

  // Quote Box
  y += 50;
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(40, y, 720, 60);
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(40, y, 720, 60);
  ctx.setLineDash([]);

  ctx.fillStyle = '#475569';
  ctx.font = 'italic 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`"${slipSettings.footerQuote}"`, 400, y + 35);
  ctx.textAlign = 'left';

  // Signatures
  y += 85;
  const now = new Date();
  const dateStr = `${slipSettings.signerCity}, ${now.getDate()} ${monthNames[now.getMonth() + 1]} ${now.getFullYear()}`;

  // Left (Receiver)
  ctx.fillStyle = '#475569';
  ctx.font = '13px sans-serif';
  ctx.fillText('Penerima Mukafa\'ah,', 90, y);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(teacher.name, 90, y + 75);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Pengajar RQ', 90, y + 92);

  // Right (Mudir / Signer)
  ctx.fillStyle = '#475569';
  ctx.font = '13px sans-serif';
  ctx.fillText(dateStr, 560, y);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(slipSettings.signerName, 560, y + 75);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(slipSettings.signerTitle, 560, y + 92);

  // Paid Stamp Stamp Impression
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 2;
  ctx.strokeRect(580, y + 20, 80, 32);
  ctx.fillStyle = '#15803d';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('LUNAS', 600, y + 41);

  // Convert to Download Link
  const dataURL = canvas.toDataURL('image/png');
  const cleanName = teacher.name.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Slip_Mukafaah_${cleanName}_${monthNames[selectedMonth]}_${selectedYear}.png`;

  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Gambar Slip Gaji (PNG) berhasil diunduh ke galeri/HP!', 'success');
}

/* Pengiriman Otomatis Slip Gaji ke WhatsApp Pengajar */
function sendSlipDirectViaWa(teacherId) {
  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  if (!teacher.phone || teacher.phone.replace(/[^0-9]/g, '').length < 8) {
    showToast(`Nomor WhatsApp untuk ${teacher.name} belum diisi atau tidak valid!`, 'warning');
    return;
  }

  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);

  // Normalize phone (08xxx -> 628xxx)
  let cleanPhone = teacher.phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('62')) {
    cleanPhone = '62' + cleanPhone;
  }

  // Pre-formatted Courteous Islamic WhatsApp Message
  let message = `Assalamu'alaikum Warahmatullahi Wabarakatuh,\n`;
  message += `Yth. *${teacher.name}* (${teacher.halaqah})\n\n`;
  message += `Berikut rincian *${slipSettings.slipTitle}* di *${slipSettings.orgName}* untuk periode *${monthNames[selectedMonth]} ${selectedYear}*:\n\n`;
  message += `📋 *Rincian Kehadiran:*\n`;
  message += `• Hadir: ${sal.hadirCount} hari\n`;
  message += `• Izin/Sakit: ${sal.izinCount + sal.sakitCount} hari\n`;
  message += `• Tingkat Kehadiran: ${sal.ratePct}%\n\n`;
  message += `💵 *Rincian Mukafa'ah:*\n`;
  message += `1. ${slipSettings.labelPokok}: ${formatRupiah(sal.pokok)}\n`;
  message += `2. ${slipSettings.labelHadir} (${sal.hadirCount} hari x ${formatRupiah(sal.rateHadir)}): ${formatRupiah(sal.insentifHadir)}\n`;
  if (sal.bonus > 0) {
    message += `3. ${slipSettings.labelBonus}: + ${formatRupiah(sal.bonus)}\n`;
  }
  if (sal.potongan > 0) {
    message += `4. ${slipSettings.labelPotongan}: - ${formatRupiah(sal.potongan)}\n`;
  }
  message += `──────────────────────\n`;
  message += `💰 *TOTAL DITERIMA: ${formatRupiah(sal.totalDiterima)}*\n`;
  message += `_${angkaKeTerbilang(sal.totalDiterima)} Rupiah_\n\n`;
  message += `_"${slipSettings.footerQuote}"_\n\n`;
  message += `Jazakumullahu khairan katsiran atas dedikasinya.\n\n`;
  message += `Salam hormat,\n`;
  message += `*${slipSettings.signerName}*\n`;
  message += `_${slipSettings.signerTitle}_ - *${slipSettings.orgName}*`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');

  showToast(`Membuka WhatsApp untuk ${teacher.name}...`, 'success');
}

/* Ekspor Rekap Gaji ke Excel (CSV BOM) */
function exportSalaryToExcel() {
  const monthSelect = document.getElementById('filterBulan');
  const yearSelect = document.getElementById('filterTahun');
  const selectedMonth = parseInt(monthSelect.value, 10);
  const selectedYear = parseInt(yearSelect.value, 10);
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const activeTeachers = teachersList.filter(t => t.status === 'Aktif');

  let csvContent = `\uFEFF`;
  csvContent += `REKAPITULASI INSENTIF & MUKAFA'AH PENGAJAR - ${slipSettings.orgName}\n`;
  csvContent += `Periode: ${monthNames[selectedMonth]} ${selectedYear}\n\n`;
  csvContent += `"No","Nama Ustadz/Ustadzah","Halaqah","No. WA","Hari Hadir","Pokok (Rp)","Insentif Mengajar (Rp)","Bonus/Tunjangan (Rp)","Potongan (Rp)","TOTAL DITERIMA (Rp)"\n`;

  let grandTotal = 0;
  activeTeachers.forEach((teacher, idx) => {
    const sal = calculateTeacherSalary(teacher, selectedMonth, selectedYear);
    grandTotal += sal.totalDiterima;
    csvContent += `"${idx + 1}","${teacher.name}","${teacher.halaqah}","${teacher.phone || '-'}","${sal.hadirCount}","${sal.pokok}","${sal.insentifHadir}","${sal.bonus}","${sal.potongan}","${sal.totalDiterima}"\n`;
  });

  csvContent += `\n"","","","","","","","","TOTAL ANGGARAN","${grandTotal}"\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Rekap_Gaji_Insentif_${slipSettings.orgName.replace(/\s+/g, '_')}_${monthNames[selectedMonth]}_${selectedYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Rekapitulasi penggajian Excel/CSV berhasil diunduh!', 'success');
}

/* ============================================================
   INDONESIAN TERBILANG HELPER
   ============================================================ */
function angkaKeTerbilang(angka) {
  angka = Math.abs(Math.floor(Number(angka) || 0));
  const huruf = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  if (angka === 0) return 'Nol';
  if (angka < 12) return huruf[angka];
  if (angka < 20) return angkaKeTerbilang(angka - 10) + ' Belas';
  if (angka < 100) return angkaKeTerbilang(Math.floor(angka / 10)) + ' Puluh ' + (angka % 10 !== 0 ? huruf[angka % 10] : '');
  if (angka < 200) return 'Seratus ' + (angka - 100 !== 0 ? angkaKeTerbilang(angka - 100) : '');
  if (angka < 1000) return angkaKeTerbilang(Math.floor(angka / 100)) + ' Ratus ' + (angka % 100 !== 0 ? angkaKeTerbilang(angka % 100) : '');
  if (angka < 2000) return 'Seribu ' + (angka - 1000 !== 0 ? angkaKeTerbilang(angka - 1000) : '');
  if (angka < 1000000) return angkaKeTerbilang(Math.floor(angka / 1000)) + ' Ribu ' + (angka % 1000 !== 0 ? angkaKeTerbilang(angka % 1000) : '');
  if (angka < 1000000000) return angkaKeTerbilang(Math.floor(angka / 1000000)) + ' Juta ' + (angka % 1000000 !== 0 ? angkaKeTerbilang(angka % 1000000) : '');
  if (angka < 1000000000000) return angkaKeTerbilang(Math.floor(angka / 1000000000)) + ' Milyar ' + (angka % 1000000000 !== 0 ? angkaKeTerbilang(angka % 1000000000) : '');
  return String(angka);
}

/* ============================================================
   KELOLA DATA GURU & FITUR PENGATURAN (TAB 4)
   ============================================================ */
function renderTeachersManageTable() {
  const tbody = document.getElementById('teachersManageBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  teachersList.forEach((t, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">${idx + 1}</td>
      <td><strong>${escapeHtml(t.name)}</strong></td>
      <td>${escapeHtml(t.halaqah)}</td>
      <td>${t.phone ? `<a href="https://wa.me/${t.phone.replace(/[^0-9]/g, '')}" target="_blank" style="color:var(--primary);text-decoration:none;">${escapeHtml(t.phone)}</a>` : '-'}</td>
      <td>
        <span class="status-badge ${t.status === 'Aktif' ? 'badge-hadir' : 'badge-belum'}">
          ${t.status}
        </span>
      </td>
      <td class="text-center action-buttons-cell">
        ${isAdminUnlocked ? `
          <button class="btn-edit-small" onclick="openEditTeacherModal('${t.id}')">✏️ Edit</button>
          <button class="btn-delete-small" onclick="deleteTeacher('${t.id}')">🗑️ Hapus</button>
        ` : `
          <button class="badge-admin-locked" onclick="openAdminPinModal('pengaturan')" title="Perlu PIN Pengelola untuk mengedit guru">
            🔒 Khusus Pengelola
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (teachersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-muted);">Belum ada data guru. Silakan klik tombol Tambah Guru Baru.</td></tr>`;
  }
}

function openAddTeacherModal() {
  if (!isAdminUnlocked) {
    showToast('Pendaftaran guru baru dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  document.getElementById('modalTeacherTitle').textContent = 'Tambah Pengajar Baru';
  document.getElementById('editTeacherId').value = '';
  document.getElementById('inputTeacherName').value = '';
  document.getElementById('inputTeacherHalaqah').value = '';
  document.getElementById('inputTeacherPhone').value = '';
  document.getElementById('selectTeacherStatus').value = 'Aktif';
  document.getElementById('btnSaveTeacherSubmit').textContent = 'Tambah Guru';
  document.getElementById('modalTeacher').style.display = 'flex';
}

function openEditTeacherModal(teacherId) {
  if (!isAdminUnlocked) {
    showToast('Pengubahan data guru dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  document.getElementById('modalTeacherTitle').textContent = 'Edit Data Pengajar';
  document.getElementById('editTeacherId').value = teacher.id;
  document.getElementById('inputTeacherName').value = teacher.name;
  document.getElementById('inputTeacherHalaqah').value = teacher.halaqah;
  document.getElementById('inputTeacherPhone').value = teacher.phone || '';
  document.getElementById('selectTeacherStatus').value = teacher.status;
  document.getElementById('btnSaveTeacherSubmit').textContent = 'Simpan Perubahan';
  document.getElementById('modalTeacher').style.display = 'flex';
}

function closeTeacherModal() {
  document.getElementById('modalTeacher').style.display = 'none';
}

function saveTeacherFromModal(e) {
  e.preventDefault();

  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Hanya pengelola yang dapat menyimpan data guru.', 'error');
    openAdminPinModal('pengaturan');
    return;
  }

  const id = document.getElementById('editTeacherId').value;
  const name = document.getElementById('inputTeacherName').value.trim();
  const halaqah = document.getElementById('inputTeacherHalaqah').value.trim();
  const phone = document.getElementById('inputTeacherPhone').value.trim();
  const status = document.getElementById('selectTeacherStatus').value;

  if (!name || !halaqah) {
    showToast('Nama dan Halaqah wajib diisi', 'warning');
    return;
  }

  if (id) {
    const idx = teachersList.findIndex(t => t.id === id);
    if (idx !== -1) {
      teachersList[idx] = { ...teachersList[idx], name, halaqah, phone, status };
      showToast(`Data ${name} berhasil diperbarui.`, 'success');
    }
  } else {
    const newTeacher = {
      id: 'tch-' + Date.now(),
      name,
      halaqah,
      phone,
      status
    };
    teachersList.push(newTeacher);
    showToast(`Ustadz/Ustadzah ${name} berhasil ditambahkan!`, 'success');
  }

  saveTeachersToStorage();
  closeTeacherModal();
  renderTeachersManageTable();
  renderTeacherSelectOptions();
  renderTeacherQuickChips();
  renderTodayMonitor();
  loadRecapData();
  if (isAdminUnlocked) loadSalaryData();
}

function deleteTeacher(teacherId) {
  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Penghapusan guru memerlukan sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  const teacher = teachersList.find(t => t.id === teacherId);
  if (!teacher) return;

  if (!confirm(`Hapus ${teacher.name} dari daftar pengajar? Data catatan kehadiran yang lama tetap tersimpan.`)) {
    return;
  }

  teachersList = teachersList.filter(t => t.id !== teacherId);
  saveTeachersToStorage();
  showToast(`Pengajar ${teacher.name} berhasil dihapus.`, 'info');

  renderTeachersManageTable();
  renderTeacherSelectOptions();
  renderTeacherQuickChips();
  renderTodayMonitor();
  loadRecapData();
  if (isAdminUnlocked) loadSalaryData();
}

/* Pengaturan Lembaga & Pimpinan RQ */
function applyInstitutionSettings() {
  const instName = appSettings.institutionName || 'RQ Ummul Qasim';
  const mudirName = appSettings.pembinaName || slipSettings.signerName || 'Ust. Pembina RQ';
  const mudirTitle = appSettings.pembinaTitle || slipSettings.signerTitle || 'Mudir Rumah Qur\'an';

  const instDisplay = document.getElementById('institutionDisplay');
  if (instDisplay) instDisplay.textContent = instName;
  const inputInst = document.getElementById('inputInstitutionName');
  if (inputInst) inputInst.value = instName;

  const inputTagline = document.getElementById('inputTagline');
  if (inputTagline) inputTagline.value = appSettings.tagline || 'Sistem Presensi & Insentif Pengajar';
  const inputLokasi = document.getElementById('inputLokasi');
  if (inputLokasi) inputLokasi.value = appSettings.lokasi || '';

  const inputMudir = document.getElementById('inputMudirName');
  if (inputMudir) inputMudir.value = mudirName;
  const inputMudirTitle = document.getElementById('inputMudirTitle');
  if (inputMudirTitle) inputMudirTitle.value = mudirTitle;

  const footerInst = document.getElementById('footerInstitutionName');
  if (footerInst) footerInst.textContent = instName;
  document.title = `Presensi & Insentif - ${instName}`;
}

function saveInstitutionSettings(e) {
  e.preventDefault();

  if (!isAdminUnlocked) {
    showToast('Akses ditolak: Pengaturan lembaga dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  appSettings.institutionName = document.getElementById('inputInstitutionName').value.trim();
  appSettings.tagline = document.getElementById('inputTagline').value.trim();
  appSettings.lokasi = document.getElementById('inputLokasi').value.trim();

  const mudirEl = document.getElementById('inputMudirName');
  const mudirTitleEl = document.getElementById('inputMudirTitle');
  const mudirName = mudirEl ? mudirEl.value.trim() : 'Ust. Pembina RQ';
  const mudirTitle = mudirTitleEl ? mudirTitleEl.value.trim() : 'Mudir Rumah Qur\'an';

  appSettings.pembinaName = mudirName;
  appSettings.pembinaTitle = mudirTitle;

  // Sinkronkan ke penandatangan slip gaji
  slipSettings.signerName = mudirName;
  slipSettings.signerTitle = mudirTitle;
  const slipSignerInput = document.getElementById('inputSlipSignerName');
  if (slipSignerInput) slipSignerInput.value = mudirName;
  const slipTitleInput = document.getElementById('inputSlipSignerTitle');
  if (slipTitleInput) slipTitleInput.value = mudirTitle;

  saveSettingsToStorage();
  saveSlipSettingsToStorage();
  applyInstitutionSettings();
  showToast(`Pengaturan lembaga & nama Mudir (${mudirName}) berhasil disimpan!`, 'success');
}

/* Backup & Restore JSON */
function backupDataJSON() {
  if (!isAdminUnlocked) {
    showToast('Pencadangan data dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  const backupObject = {
    settings: appSettings,
    slipSettings: slipSettings,
    salaryOverrides: salaryOverrides,
    teachers: teachersList,
    logs: attendanceLogs,
    exportedAt: new Date().toISOString()
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObject, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `Cadangan_Data_${appSettings.institutionName.replace(/\s+/g, '_')}_${getTodayDateString()}.json`);
  dlAnchorElem.click();

  showToast('Cadangan data berhasil diunduh!', 'success');
}

function restoreDataJSON(event) {
  if (!isAdminUnlocked) {
    showToast('Pemulihan data dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.teachers && Array.isArray(parsed.teachers)) {
        teachersList = parsed.teachers;
        saveTeachersToStorage();
      }
      if (parsed.logs && Array.isArray(parsed.logs)) {
        attendanceLogs = parsed.logs;
        saveLogsToStorage();
      }
      if (parsed.settings) {
        appSettings = parsed.settings;
        saveSettingsToStorage();
      }
      if (parsed.slipSettings) {
        slipSettings = parsed.slipSettings;
        saveSlipSettingsToStorage();
      }
      if (parsed.salaryOverrides) {
        salaryOverrides = parsed.salaryOverrides;
        saveSalaryOverridesToStorage();
      }

      applyInstitutionSettings();
      renderTeacherSelectOptions();
      renderTeacherQuickChips();
      renderTodayMonitor();
      loadRecapData();
      renderTeachersManageTable();
      if (isAdminUnlocked) loadSalaryData();

      showToast('Data berhasil dipulihkan dari file!', 'success');
    } catch (err) {
      showToast('Gagal membaca file JSON cadangan: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function confirmResetData() {
  if (!isAdminUnlocked) {
    showToast('Reset data dilindungi sandi pengelola.', 'warning');
    openAdminPinModal('pengaturan');
    return;
  }

  if (!confirm('Peringatan: Ini akan mengembalikan data ke daftar pengajar awal dan contoh rekap bawaan. Lanjutkan?')) {
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.TEACHERS);
  localStorage.removeItem(STORAGE_KEYS.LOGS);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.SLIP_SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.SALARY_OVERRIDES);

  loadDataFromStorage();
  applyInstitutionSettings();
  renderTeacherSelectOptions();
  renderTeacherQuickChips();
  renderTodayMonitor();
  loadRecapData();
  renderTeachersManageTable();
  if (isAdminUnlocked) loadSalaryData();

  showToast('Data telah direset ke pengaturan default.', 'info');
}

/* ============================================================
   PWA & PANDUAN PASANG KE HP (APK FEEL)
   ============================================================ */
function initPwaAndServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    const directArea = document.getElementById('pwaPromptDirectArea');
    if (directArea) directArea.style.display = 'block';
  });
}

function openInstallModal() {
  const modal = document.getElementById('modalInstallApp');
  if (modal) modal.style.display = 'flex';
}

function closeInstallModal() {
  const modal = document.getElementById('modalInstallApp');
  if (modal) modal.style.display = 'none';
}

function switchInstallGuide(platform) {
  const isAndroid = platform === 'android';
  document.getElementById('btnTabAndroid').classList.toggle('active', isAndroid);
  document.getElementById('btnTabIos').classList.toggle('active', !isAndroid);
  document.getElementById('guideAndroid').style.display = isAndroid ? 'block' : 'none';
  document.getElementById('guideIos').style.display = isAndroid ? 'none' : 'block';
}

function triggerPwaPrompt() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Terima kasih! Aplikasi berhasil dipasang di HP.', 'success');
      }
      deferredPwaPrompt = null;
      closeInstallModal();
    });
  } else {
    showToast('Silakan gunakan opsi Tambahkan ke Layar Utama di peramban Anda.', 'info');
  }
}

/* ============================================================
   KEYBOARD SHORTCUTS FOR WINDOWS DESKTOP
   ============================================================ */
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 1. Dukungan keyboard penuh jika modal PIN Pengelola sedang terbuka
    const modalPin = document.getElementById('modalAdminPin');
    const isPinOpen = modalPin && modalPin.style.display === 'flex';

    if (isPinOpen) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        pressPinKey(e.key);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        deletePinKey();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAdminPin();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAdminPinModal();
        return;
      }
      return; // Cegah tombol lain berpindah tab saat modal PIN aktif
    }

    // 2. Abaikan penekanan angka jika pengguna sedang mengetik di elemen form
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.key === '1') switchTab('absensi');
    if (e.key === '2') switchTab('rekap');
    if (e.key === '3') openInsentifTab();
    if (e.key === '4') openPengaturanTab();
    if (e.key === 'Escape') {
      closeIzinModal();
      closeTeacherModal();
      closeDetailModal();
      closeInstallModal();
      closeAdminPinModal();
      closeSlipDesignerModal();
      closeSlipPreviewModal();
      closeEditTeacherSalaryModal();
      closeChangePinModal();
    }
  });
}

/* ============================================================
   HELPER UTILITIES & TOAST
   ============================================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

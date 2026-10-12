/**
 * RQ UMMUL QASIM - FIREBASE CLOUD DATABASE INTEGRATION
 * Sinkronisasi Real-Time Multi-Perangkat (HP Pengajar & Laptop Pengelola)
 */

(function(window) {
  'use strict';

  // Kunci LocalStorage untuk konfigurasi kustom Firebase
  const STORAGE_KEY_FIREBASE = 'rq_firebase_config_custom';

  // Konfigurasi Bawaan (Bisa diisi langsung di sini atau via menu Pengaturan di aplikasi)
  const PRESET_FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };

  let firebaseApp = null;
  let firestoreDb = null;
  let syncStatus = 'unconfigured'; // 'unconfigured' | 'connecting' | 'online' | 'error' | 'offline'
  let statusListeners = [];
  let unsubscribeListeners = [];

  /**
   * Mengambil konfigurasi aktif (dari LocalStorage atau preset)
   */
  function getActiveConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_FIREBASE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.projectId) return parsed;
      }
    } catch (e) {
      console.warn('Gagal membaca konfigurasi Firebase dari storage:', e);
    }
    return PRESET_FIREBASE_CONFIG;
  }

  /**
   * Menyimpan konfigurasi Firebase kustom
   */
  function saveConfig(cfg) {
    if (!cfg || !cfg.projectId) {
      throw new Error('Project ID Firebase tidak boleh kosong');
    }
    const cleanConfig = {
      apiKey: (cfg.apiKey || '').trim(),
      authDomain: (cfg.authDomain || '').trim() || `${(cfg.projectId || '').trim()}.firebaseapp.com`,
      projectId: (cfg.projectId || '').trim(),
      storageBucket: (cfg.storageBucket || '').trim() || `${(cfg.projectId || '').trim()}.appspot.com`,
      messagingSenderId: (cfg.messagingSenderId || '').trim(),
      appId: (cfg.appId || '').trim()
    };
    localStorage.setItem(STORAGE_KEY_FIREBASE, JSON.stringify(cleanConfig));
    return cleanConfig;
  }

  /**
   * Menghapus konfigurasi kustom (reset)
   */
  function removeConfig() {
    localStorage.removeItem(STORAGE_KEY_FIREBASE);
    detachListeners();
    firebaseApp = null;
    firestoreDb = null;
    updateStatus('unconfigured');
  }

  /**
   * Daftarkan listener perubahan status koneksi
   */
  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      statusListeners.push(callback);
      callback(syncStatus, getActiveConfig());
    }
  }

  function updateStatus(newStatus, detail = null) {
    syncStatus = newStatus;
    statusListeners.forEach(cb => {
      try { cb(syncStatus, getActiveConfig(), detail); } catch (e) { console.error(e); }
    });
  }

  /**
   * Inisialisasi Firebase & Firestore
   */
  function initFirebase() {
    const config = getActiveConfig();

    if (!config || !config.projectId || !config.apiKey) {
      updateStatus('unconfigured');
      return null;
    }

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK belum termuat dari CDN.');
      updateStatus('error', 'Firebase SDK tidak tersedia');
      return null;
    }

    try {
      updateStatus('connecting');

      // Hindari duplikasi instance app
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }

      firestoreDb = firebase.firestore();

      // Aktifkan offline persistence jika didukung browser
      try {
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
          if (err.code === 'failed-precondition') {
            console.info('Persistence Firebase gagal: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.info('Browser tidak mendukung persistence offline Firestore');
          }
        });
      } catch (_) {}

      updateStatus('online');
      console.log('✅ Firebase Firestore berhasil terhubung ke project:', config.projectId);
      return firestoreDb;
    } catch (err) {
      console.error('❌ Gagal inisialisasi Firebase:', err);
      updateStatus('error', err.message);
      return null;
    }
  }

  function detachListeners() {
    unsubscribeListeners.forEach(unsub => {
      try { if (typeof unsub === 'function') unsub(); } catch (_) {}
    });
    unsubscribeListeners = [];
  }

  /* ============================================================
     FIRESTORE COLLECTIONS & DOCUMENTS SPECIFICATION:
     - Collection "rq_teachers" -> Doc { id: "tch-1", name, halaqah, phone, status, ... }
     - Collection "rq_attendance_logs" -> Doc { id: "log-xxx", teacherId, teacherName, date, time, type, note, ... }
     - Collection "rq_settings" ->
         Doc "general" -> { institutionName, tagline, lokasi, pembinaName, pembinaTitle }
         Doc "security" -> { adminPin: "1234" }
         Doc "slip" -> { ...slipSettings }
         Doc "salary_overrides" -> { ...salaryOverrides }
     ============================================================ */

  /**
   * Listener Real-time Data Guru
   */
  function listenTeachers(onSuccess, onError) {
    if (!firestoreDb) return;
    const unsub = firestoreDb.collection('rq_teachers').onSnapshot(snapshot => {
      const teachers = [];
      snapshot.forEach(doc => {
        teachers.push({ id: doc.id, ...doc.data() });
      });
      if (typeof onSuccess === 'function') onSuccess(teachers);
    }, err => {
      console.error('Error snapshot teachers:', err);
      if (typeof onError === 'function') onError(err);
    });
    unsubscribeListeners.push(unsub);
  }

  /**
   * Listener Real-time Catatan Presensi
   */
  function listenAttendanceLogs(onSuccess, onError) {
    if (!firestoreDb) return;
    const unsub = firestoreDb.collection('rq_attendance_logs').onSnapshot(snapshot => {
      const logs = [];
      snapshot.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      // Urutkan dari yang terbaru
      logs.sort((a, b) => (b.date + ' ' + (b.time || '')).localeCompare(a.date + ' ' + (a.time || '')));
      if (typeof onSuccess === 'function') onSuccess(logs);
    }, err => {
      console.error('Error snapshot attendance logs:', err);
      if (typeof onError === 'function') onError(err);
    });
    unsubscribeListeners.push(unsub);
  }

  /**
   * Listener Real-time Konfigurasi Pengaturan & PIN
   */
  function listenSettings(onSuccess, onError) {
    if (!firestoreDb) return;
    const unsub = firestoreDb.collection('rq_settings').onSnapshot(snapshot => {
      const settingsData = {};
      snapshot.forEach(doc => {
        settingsData[doc.id] = doc.data();
      });
      if (typeof onSuccess === 'function') onSuccess(settingsData);
    }, err => {
      console.error('Error snapshot settings:', err);
      if (typeof onError === 'function') onError(err);
    });
    unsubscribeListeners.push(unsub);
  }

  /* ============================================================
     OPERASI TULIS (WRITE & DELETE) CLOUD
     ============================================================ */

  async function writeTeacher(teacher) {
    if (!firestoreDb) return false;
    const docId = teacher.id || ('tch-' + Date.now());
    await firestoreDb.collection('rq_teachers').doc(docId).set({
      ...teacher,
      id: docId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function deleteTeacher(teacherId) {
    if (!firestoreDb || !teacherId) return false;
    await firestoreDb.collection('rq_teachers').doc(teacherId).delete();
    return true;
  }

  async function writeAttendanceLog(log) {
    if (!firestoreDb) return false;
    const docId = log.id || ('log-' + Date.now());
    await firestoreDb.collection('rq_attendance_logs').doc(docId).set({
      ...log,
      id: docId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  }

  async function deleteAttendanceLog(logId) {
    if (!firestoreDb || !logId) return false;
    await firestoreDb.collection('rq_attendance_logs').doc(logId).delete();
    return true;
  }

  async function writeGeneralSettings(settings) {
    if (!firestoreDb) return false;
    await firestoreDb.collection('rq_settings').doc('general').set({
      ...settings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function writeSecurityPin(pin) {
    if (!firestoreDb) return false;
    await firestoreDb.collection('rq_settings').doc('security').set({
      adminPin: String(pin).trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function writeSlipSettings(slipSettings) {
    if (!firestoreDb) return false;
    await firestoreDb.collection('rq_settings').doc('slip').set({
      ...slipSettings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function writeSalaryOverrides(salaryOverrides) {
    if (!firestoreDb) return false;
    await firestoreDb.collection('rq_settings').doc('salary_overrides').set({
      overrides: salaryOverrides || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  }

  /**
   * Migrasi / Sinkronisasi satu kali dari data lokal ke Cloud Firestore
   */
  async function uploadLocalDataToCloud(data) {
    if (!firestoreDb) {
      throw new Error('Firebase Firestore belum terhubung.');
    }

    const batch = firestoreDb.batch();

    // 1. Guru
    if (Array.isArray(data.teachers) && data.teachers.length > 0) {
      data.teachers.forEach(t => {
        const ref = firestoreDb.collection('rq_teachers').doc(t.id);
        batch.set(ref, {
          ...t,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }

    // 2. Log Presensi (ambil maksimal 100 terakhir agar batch aman)
    if (Array.isArray(data.logs) && data.logs.length > 0) {
      data.logs.slice(0, 150).forEach(l => {
        const ref = firestoreDb.collection('rq_attendance_logs').doc(l.id);
        batch.set(ref, {
          ...l,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }

    // 3. Pengaturan Umum
    if (data.settings) {
      const refGen = firestoreDb.collection('rq_settings').doc('general');
      batch.set(refGen, {
        ...data.settings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // 4. PIN Keamanan
    if (data.adminPin) {
      const refSec = firestoreDb.collection('rq_settings').doc('security');
      batch.set(refSec, {
        adminPin: String(data.adminPin).trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // 5. Slip Settings
    if (data.slipSettings) {
      const refSlip = firestoreDb.collection('rq_settings').doc('slip');
      batch.set(refSlip, {
        ...data.slipSettings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // 6. Salary Overrides
    if (data.salaryOverrides) {
      const refOv = firestoreDb.collection('rq_settings').doc('salary_overrides');
      batch.set(refOv, {
        overrides: data.salaryOverrides,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();
    return true;
  }

  // Ekspor API ke global window
  window.RQ_FIREBASE = {
    getActiveConfig,
    saveConfig,
    removeConfig,
    onStatusChange,
    getStatus: () => syncStatus,
    initFirebase,
    detachListeners,
    listenTeachers,
    listenAttendanceLogs,
    listenSettings,
    writeTeacher,
    deleteTeacher,
    writeAttendanceLog,
    deleteAttendanceLog,
    writeGeneralSettings,
    writeSecurityPin,
    writeSlipSettings,
    writeSalaryOverrides,
    uploadLocalDataToCloud
  };

})(window);

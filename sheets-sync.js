/**
 * RQ UMMUL QASIM - GOOGLE SPREADSHEET DATABASE SYNC
 * Sinkronisasi Otomatis Antara HP & Laptop Menggunakan Google Spreadsheet
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_SHEETS_URL = 'rq_sheets_webapp_url';

  // Preset default URL (bisa diisi langsung atau via UI aplikasi)
  const PRESET_SHEETS_URL = "https://script.google.com/macros/s/AKfycbzT_Og7_1kd2bwlMpFJexw_uraIkNWxmlMfXvmy5gDG8r5OYufr4tHgp2rNXYjopNWI/exec";

  let syncStatus = 'unconfigured'; // 'unconfigured' | 'connecting' | 'online' | 'error' | 'offline'
  let statusListeners = [];
  let pollInterval = null;

  function getActiveUrl() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SHEETS_URL);
      if (stored && stored.trim().startsWith('http')) {
        return stored.trim();
      }
    } catch (_) {}
    return PRESET_SHEETS_URL;
  }

  function saveUrl(url) {
    const clean = (url || '').trim();
    if (!clean || !clean.startsWith('http')) {
      throw new Error('URL Web App Google Sheets harus valid (berawalan https://script.google.com/...)');
    }
    localStorage.setItem(STORAGE_KEY_SHEETS_URL, clean);
    return clean;
  }

  function removeUrl() {
    localStorage.removeItem(STORAGE_KEY_SHEETS_URL);
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    updateStatus('unconfigured');
  }

  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      statusListeners.push(callback);
      callback(syncStatus, getActiveUrl());
    }
  }

  function updateStatus(newStatus, detail = null) {
    syncStatus = newStatus;
    statusListeners.forEach(cb => {
      try { cb(syncStatus, getActiveUrl(), detail); } catch (e) { console.error(e); }
    });
  }

  /**
   * Kirim aksi ke Google Apps Script via POST (text/plain menghindari CORS Preflight OPTIONS)
   */
  async function postToSheet(action, data = {}) {
    const url = getActiveUrl();
    if (!url) return null;

    try {
      const body = JSON.stringify({ action: action, ...data });
      // Gunakan text/plain agar browser langsung mengirim POST tanpa OPTIONS preflight
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow'
      });
      return await res.json();
    } catch (err) {
      console.warn('Gagal POST ke Google Sheets:', err);
      return null;
    }
  }

  /**
   * Normalisasi tanggal ke format ISO YYYY-MM-DD
   * Menangani format Date object dari Google Sheets, ISO string, maupun format lokal
   */
  function normalizeDate(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }
    // String Date bawaan Google Sheets: misal "Mon Oct 12 2026 00:00:00 GMT+0800..."
    const months = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const match = str.match(/([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
    if (match) {
      const mNum = months[match[2]] || '01';
      const day = match[3].padStart(2, '0');
      const yr = match[4];
      return `${yr}-${mNum}-${day}`;
    }
    // Format DD/MM/YYYY atau DD-MM-YYYY
    const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
      const day = slashMatch[1].padStart(2, '0');
      const mo = slashMatch[2].padStart(2, '0');
      const yr = slashMatch[3];
      return `${yr}-${mo}-${day}`;
    }
    if (str.includes('T')) {
      const parts = str.split('T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return parts[0];
    }
    const cleanStr = str.replace(/\(.*?\)/g, '').trim();
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return str;
  }

  /**
   * Normalisasi jam ke format HH:mm
   * Menangani format timestamp 1899 dari Google Sheets
   */
  function normalizeTime(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      return str.padStart(5, '0');
    }
    const match = str.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return match[1].padStart(2, '0') + ':' + match[2];
    }
    return str;
  }

  /**
   * Ambil seluruh data dari Google Spreadsheet via GET
   */
  async function fetchAllFromSheet() {
    const url = getActiveUrl();
    if (!url) {
      updateStatus('unconfigured');
      return null;
    }

    try {
      updateStatus('connecting');
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        method: 'GET',
        redirect: 'follow'
      });

      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();

      if (data && data.status === 'success') {
        updateStatus('online');
        // Normalisasi tanggal dan jam agar selalu serasi dengan aplikasi
        if (Array.isArray(data.logs)) {
          data.logs = data.logs.map(log => ({
            ...log,
            date: normalizeDate(log.date),
            time: normalizeTime(log.time)
          }));
        }
        return data;
      } else {
        throw new Error(data.message || 'Format respon spreadsheet tidak sesuai');
      }
    } catch (err) {
      console.error('Koneksi Google Spreadsheet gagal:', err);
      updateStatus('error', err.message);
      return null;
    }
  }

  function startAutoSync(onDataReceived, intervalSeconds = 45) {
    if (pollInterval) clearInterval(pollInterval);
    // Jalankan sekali saat awal
    fetchAllFromSheet().then(data => {
      if (data && typeof onDataReceived === 'function') onDataReceived(data);
    });

    pollInterval = setInterval(async () => {
      const data = await fetchAllFromSheet();
      if (data && typeof onDataReceived === 'function') onDataReceived(data);
    }, intervalSeconds * 1000);
  }

  // Operasi spesifik
  async function recordAttendance(log) {
    const cleanLog = {
      ...log,
      date: normalizeDate(log.date),
      time: normalizeTime(log.time)
    };
    return await postToSheet('record_attendance', { data: cleanLog });
  }

  async function deleteAttendance(logId) {
    return await postToSheet('delete_log', { logId: logId });
  }

  async function saveTeacher(teacher) {
    return await postToSheet('save_teacher', { data: teacher });
  }

  async function deleteTeacher(teacherId) {
    return await postToSheet('delete_teacher', { teacherId: teacherId });
  }

  async function savePin(pin) {
    return await postToSheet('save_pin', { pin: pin });
  }

  async function saveGeneralSettings(settings) {
    return await postToSheet('save_settings', { settings: settings });
  }

  async function saveSlipSettings(slipSettings) {
    return await postToSheet('save_slip_settings', { slipSettings: slipSettings });
  }

  async function saveSalaryOverrides(overrides) {
    return await postToSheet('save_overrides', { overrides: overrides });
  }

  async function uploadAllLocalToSpreadsheet(allData) {
    const res = await postToSheet('sync_all', { data: allData });
    if (!res || res.status !== 'success') {
      throw new Error('Gagal mengunggah data ke Spreadsheet');
    }
    return true;
  }

  window.RQ_SHEETS = {
    getActiveUrl,
    saveUrl,
    removeUrl,
    onStatusChange,
    getStatus: () => syncStatus,
    fetchAllFromSheet,
    startAutoSync,
    recordAttendance,
    deleteAttendance,
    saveTeacher,
    deleteTeacher,
    savePin,
    saveGeneralSettings,
    saveSlipSettings,
    saveSalaryOverrides,
    uploadAllLocalToSpreadsheet,
    normalizeDate,
    normalizeTime
  };

})(window);

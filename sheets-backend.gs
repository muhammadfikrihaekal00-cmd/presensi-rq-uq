/**
 * ====================================================================
 * RUMAH QUR'AN (RQ) UMMUL QASIM - GOOGLE SPREADSHEET BACKEND API
 * ====================================================================
 * 
 * PANDUAN PEMASANGAN (HANYA SEKALI COPY-PASTE):
 * 1. Buat Google Spreadsheet baru di Google Drive Anda (beri nama misal: "Data Presensi RQ").
 * 2. Di menu atas Google Spreadsheet, klik: Ekstensi > Apps Script.
 * 3. Hapus semua tulisan di editor Apps Script, lalu tempel SELURUH KODE ini.
 * 4. Klik tombol "Deploy" (di kanan atas) > "New deployment" (Deployment baru).
 * 5. Klik ikon gerigi (⚙️) di sebelah "Select type" > pilih "Web app".
 * 6. Atur:
 *    - Description: Presensi RQ API
 *    - Execute as: Me (email Google Anda)
 *    - Who has access: Anyone (Siapa saja)  <-- PENTING agar HP guru bisa kirim absen!
 * 7. Klik "Deploy" > Berikan Izin Akses ("Authorize access") > Pilih Akun Anda > Klik "Advanced" > "Go to ... (unsafe)" > "Allow".
 * 8. Salin "Web app URL" (yang berakhiran /exec) dan tempelkan ke aplikasi Presensi RQ Anda.
 * ====================================================================
 */

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureStructure(ss);

    const logs = readLogs(ss);
    const teachers = readTeachers(ss);
    const settingsObj = readSettings(ss);

    const output = {
      status: 'success',
      teachers: teachers,
      logs: logs,
      settings: settingsObj.settings || {},
      slipSettings: settingsObj.slipSettings || {},
      adminPin: settingsObj.adminPin || '1234',
      salaryOverrides: settingsObj.salaryOverrides || {}
    };

    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureStructure(ss);

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action;

    if (action === 'record_attendance') {
      appendLog(ss, payload.data);
    } else if (action === 'delete_log') {
      deleteLog(ss, payload.logId);
    } else if (action === 'save_teacher') {
      upsertTeacher(ss, payload.data);
    } else if (action === 'delete_teacher') {
      deleteTeacher(ss, payload.teacherId);
    } else if (action === 'save_pin') {
      writeSetting(ss, 'adminPin', String(payload.pin).trim());
    } else if (action === 'save_settings') {
      writeSetting(ss, 'settings', JSON.stringify(payload.settings));
    } else if (action === 'save_slip_settings') {
      writeSetting(ss, 'slipSettings', JSON.stringify(payload.slipSettings));
    } else if (action === 'save_overrides') {
      writeSetting(ss, 'salaryOverrides', JSON.stringify(payload.overrides));
    } else if (action === 'sync_all') {
      syncAllData(ss, payload.data);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', action: action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ============================================================
   STRUKTUR SHEET & INISIALISASI OTOMATIS
   ============================================================ */
function ensureStructure(ss) {
  // 1. Sheet Presensi
  let sheetLogs = ss.getSheetByName('Presensi');
  if (!sheetLogs) {
    sheetLogs = ss.insertSheet('Presensi');
    sheetLogs.appendRow(['ID Log', 'Tanggal', 'Jam', 'Nama Pengajar', 'ID Pengajar', 'Status Kehadiran', 'Keterangan', 'Waktu Tercatat']);
    sheetLogs.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#065f46').setFontColor('#ffffff');
    sheetLogs.setFrozenRows(1);
  }

  // 2. Sheet Guru
  let sheetTeachers = ss.getSheetByName('Data_Pengajar');
  if (!sheetTeachers) {
    sheetTeachers = ss.insertSheet('Data_Pengajar');
    sheetTeachers.appendRow(['ID Pengajar', 'Nama Lengkap Ustadz/Ustadzah', 'Halaqah / Tugas', 'No. WhatsApp', 'Status']);
    sheetTeachers.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff');
    sheetTeachers.setFrozenRows(1);

    // Bawaan Pengajar Resmi RQ Ummul Qasim
    const defaultTeachers = [
      ['tch-1', 'Ustadz Muhammad Fikri Haekal, C.LQ', 'Kelas Tahfizh Menengah Ikhwan', '082189480869', 'Aktif'],
      ['tch-2', 'Ustadzah Ummu Khadijah', 'Kelas Tahfizh Dasar Ikhwan & Akhowat', '082339495396', 'Aktif'],
      ['tch-3', 'Ustadzah A. Lulu Aprilia Latifa', 'Kelas Tahfizh Menengah Akhowat', '087722442651', 'Aktif'],
      ['tch-4', 'Ustadzah Khirfatul jannah', 'Kelas Tahfizh Dasar Ikhwan', '089654707922', 'Aktif']
    ];
    defaultTeachers.forEach(row => sheetTeachers.appendRow(row));
  }

  // 3. Sheet Pengaturan
  let sheetSettings = ss.getSheetByName('Pengaturan');
  if (!sheetSettings) {
    sheetSettings = ss.insertSheet('Pengaturan');
    sheetSettings.appendRow(['Kunci', 'Nilai']);
    sheetSettings.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#334155').setFontColor('#ffffff');
    sheetSettings.setFrozenRows(1);
    sheetSettings.appendRow(['adminPin', '1234']);
  }
}

/* ============================================================
   BACA DATA DARI SPREADSHEET
   ============================================================ */
function readLogs(ss) {
  const sheet = ss.getSheetByName('Presensi');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const logs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] && !r[3]) continue;
    logs.push({
      id: String(r[0] || ('log-' + i)),
      date: String(r[1] || ''),
      time: String(r[2] || ''),
      teacherName: String(r[3] || ''),
      teacherId: String(r[4] || ''),
      type: String(r[5] || 'Hadir'),
      note: String(r[6] || '')
    });
  }
  return logs;
}

function readTeachers(ss) {
  const sheet = ss.getSheetByName('Data_Pengajar');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const teachers = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] && !r[1]) continue;
    teachers.push({
      id: String(r[0] || ('tch-' + i)),
      name: String(r[1] || ''),
      halaqah: String(r[2] || ''),
      phone: String(r[3] || ''),
      status: String(r[4] || 'Aktif')
    });
  }
  return teachers;
}

function readSettings(ss) {
  const sheet = ss.getSheetByName('Pengaturan');
  if (!sheet) return { adminPin: '1234' };
  const rows = sheet.getDataRange().getValues();
  const result = { adminPin: '1234' };

  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0]).trim();
    const val = String(rows[i][1]).trim();
    if (key === 'adminPin') {
      result.adminPin = val || '1234';
    } else if (key === 'settings') {
      try { result.settings = JSON.parse(val); } catch(_) {}
    } else if (key === 'slipSettings') {
      try { result.slipSettings = JSON.parse(val); } catch(_) {}
    } else if (key === 'salaryOverrides') {
      try { result.salaryOverrides = JSON.parse(val); } catch(_) {}
    }
  }
  return result;
}

/* ============================================================
   TULIS DATA KE SPREADSHEET
   ============================================================ */
function appendLog(ss, log) {
  const sheet = ss.getSheetByName('Presensi');
  if (!sheet) return;

  const id = log.id || ('log-' + Date.now());
  const dateStr = log.date || '';
  const timeStr = log.time || '';
  const teacherName = log.teacherName || '';
  const teacherId = log.teacherId || '';
  const type = log.type || 'Hadir';
  const note = log.note || '';
  const recordedAt = new Date().toLocaleString('id-ID');

  sheet.appendRow([id, dateStr, timeStr, teacherName, teacherId, type, note, recordedAt]);
}

function deleteLog(ss, logId) {
  const sheet = ss.getSheetByName('Presensi');
  if (!sheet || !logId) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(logId)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function upsertTeacher(ss, teacher) {
  const sheet = ss.getSheetByName('Data_Pengajar');
  if (!sheet || !teacher) return;
  const rows = sheet.getDataRange().getValues();
  const id = teacher.id || ('tch-' + Date.now());

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.getRange(i + 1, 2).setValue(teacher.name || '');
      sheet.getRange(i + 1, 3).setValue(teacher.halaqah || '');
      sheet.getRange(i + 1, 4).setValue(teacher.phone || '');
      sheet.getRange(i + 1, 5).setValue(teacher.status || 'Aktif');
      return;
    }
  }

  sheet.appendRow([id, teacher.name || '', teacher.halaqah || '', teacher.phone || '', teacher.status || 'Aktif']);
}

function deleteTeacher(ss, teacherId) {
  const sheet = ss.getSheetByName('Data_Pengajar');
  if (!sheet || !teacherId) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(teacherId)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function writeSetting(ss, key, value) {
  const sheet = ss.getSheetByName('Pengaturan');
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  sheet.appendRow([key, value]);
}

function syncAllData(ss, data) {
  if (data.adminPin) writeSetting(ss, 'adminPin', String(data.adminPin).trim());
  if (data.settings) writeSetting(ss, 'settings', JSON.stringify(data.settings));
  if (data.slipSettings) writeSetting(ss, 'slipSettings', JSON.stringify(data.slipSettings));
  if (data.salaryOverrides) writeSetting(ss, 'salaryOverrides', JSON.stringify(data.salaryOverrides));

  if (Array.isArray(data.teachers) && data.teachers.length > 0) {
    data.teachers.forEach(t => upsertTeacher(ss, t));
  }
  if (Array.isArray(data.logs) && data.logs.length > 0) {
    const existingLogs = readLogs(ss);
    const existingIds = new Set(existingLogs.map(l => l.id));
    data.logs.forEach(l => {
      if (!existingIds.has(l.id)) {
        appendLog(ss, l);
      }
    });
  }
}

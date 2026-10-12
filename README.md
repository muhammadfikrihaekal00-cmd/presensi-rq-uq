# Aplikasi Presensi & Insentif Pengajar - RQ Ummul Qasim

Aplikasi sistem presensi modern, rekapitulasi kehadiran, dan pengelolaan insentif/mukafa'ah yang dirancang khusus untuk **Rumah Qur'an (RQ) Ummul Qasim**.

---

## 🌟 Modul & Fitur Utama

### 1. 🔒 Akses Khusus Pengelola RQ (Terproteksi PIN)
- Modul penggajian dan slip mukafa'ah guru **hanya bisa dibuka oleh Pengelola RQ**.
- Dilengkapi sistem penguncian PIN (*Keypad Angka Layar Sentuh*) agar aman saat HP dipinjam atau digunakan bersama.
- **PIN Bawaan Awal:** `1234` *(Dapat diganti kapan saja melalui tab Pengaturan atau modul Insentif)*.
- Tombol **"Kunci Akses"** sekali tekan untuk mengunci kembali session setelah pengelola selesai mengecek keuangan.

### 2. 💵 Perekapan Insentif & Mukafa'ah Otomatis
- **Dihitung otomatis** dari klik kehadiran harian ustadz/ustadzah pada bulan berjalan.
- **Fleksibel & Mendukung Angka Ganjil/Pecahan:** Pengelola bebas memasukkan nominal berapapun (misalnya Rp 43.750, Rp 35.000, Rp 50.000, dst) tanpa batasan angka genap.
- Komponen perhitungan fleksibel:
  - **Mukafa'ah / Honor Pokok** (misal: Rp 500.000)
  - **Insentif Mengajar Harian** (Hari Hadir × Tarif Sesi, misal: 22 hari × Rp 43.750 = Rp 962.500)
  - **Bonus Kehadiran Penuh (100%)**
  - **Potongan Kas / Infaq** (opsional)
  - **Total Diterima (*Take Home Pay*)** lengkap dengan teks Terbilang Rupiah otomatis.
- **Penyesuaian Khusus Per Guru:** Pengelola dapat menyesuaikan nominal guru tertentu jika ada tugas tambahan atau kas/infaq tanpa mengubah rumus guru lain.
- **Ekspor Excel / CSV Penggajian:** Sekali klik untuk laporan keuangan bulanan yayasan.

### 3. 🎨 Editor Desain & Teks Slip Gaji (Customizer Lengkap)
Pengelola bebas mengedit tampilan slip gaji sesuai identitas lembaga:
- **Pengaturan Nama Mudir / Pembina RQ:** Nama pimpinan dan jabatannya dapat diatur langsung di panel pengaturan pengelola dan otomatis tersinkronisasi ke slip gaji.
- **Desain & Warna Slip:** Pilihan tema slip (Zamrud Islami, Samudra Biru, Kasturi Emas, atau Charcoal Formal).
- **Logo Dokumen:** Gunakan logo mushaf bawaan atau **Unggah Logo / Gambar Stempel Yayasan Sendiri** (format PNG/JPG langsung dari HP/laptop).
- **Teks Dokumen:** Judul slip, Nama RQ, Sub-kop, Alamat, dan No. Kontak dapat diedit bebas.
- **Pesan / Doa Penutup:** Kustomisasi kalimat doa dan apresiasi untuk ustadz/ustadzah.
- **Tanda Tangan:** Nama Mudir/Pimpinan, jabatan, dan tanggal cetak.

### 4. 📲 Pengiriman Otomatis Slip Gaji ke WhatsApp Pengajar
- **Kirim Pesan WhatsApp Otomatis:** Sekali klik tombol **"Kirim WA"**, aplikasi langsung membuka WhatsApp dengan nomor pengajar yang dituju dan draf rincian slip gaji yang tersusun sangat sopan dan rapi.
- **📸 Unduh Slip sebagai Gambar (PNG):** Slip gaji otomatis dikonversi menjadi file gambar beresolusi tinggi (*High Resolution Image via HTML5 Canvas*) untuk disimpan ke galeri HP dan dilampirkan langsung di chat WhatsApp.
- **🖨️ Cetak / Simpan PDF:** Format cetak dokumen slip resmi.

---

### 5. 📱 Khusus Pengajar di HP & Mode Windows
- **Navigasi Bawah (*Mobile Bottom Nav*):** Thumb-friendly (Absen, Rekap, Gaji 🔒, Kelola).
- **Sentuh Cepat Nama Guru (*Quick Avatar Chips*):** Absen dalam 2 detik dengan mengetuk kartu nama dan avatar.
- **Haptic Vibration & Chime Sound:** Getaran lembut dan bel merdu saat presensi berhasil.
- **PWA / Pasang APK di HP:** Tombol *"Pasang di HP"* untuk memasang aplikasi langsung ke layar utama Android & iPhone layaknya APK native.
- **5 Pilihan Tema Warna:** Zamrud Islami, Mode Gelap (Dark OLED), Samudra Biru, Kasturi Emas, Amethyst Ungu.

---

## 🚀 Cara Menjalankan

1. Buka file [`index.html`](file:///C:/Users/Pongo/.gemini/antigravity-ide/scratch/rq-ummul-qasim-presensi/index.html) di peramban (Google Chrome, Edge, Safari di HP/Laptop).
2. Untuk membuka bagian Insentif & Gaji, klik tab **"Insentif & Slip Gaji 🔒"** dan masukkan PIN bawaan `1234`.
3. Selesai! Seluruh data tersimpan otomatis di *LocalStorage* perangkat Anda.

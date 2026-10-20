# All Downloader Nexora ✦

Website **standalone**, bukan bagian dari All Tools Nexora. Landing page dan downloader menggunakan palet *Kawaii Arcade* yang diadaptasi dari ZIP referensi (`design-reference/original-ui3.css`): cyan pastel, kartu cream, outline cokelat, tombol kuning 3D, dan dekorasi pink. CSS baru sengaja ditulis terpisah agar tidak mewarisi selector `!important` dari tema untuk website lain.

## Stack

- HTML/CSS/JavaScript vanilla, frontend di `public/` (tanpa build frontend).
- Vercel Functions Node.js: `api/analyze.js`, `api/download.js`, `api/health.js`.
- `@coflyn/mori` (lisensi GPL-3.0-or-later) menyediakan engine scraper. Repo asli: https://github.com/coflyn/Mori
- Penyimpanan riwayat di `localStorage` perangkat masing-masing. Tidak ada database atau login.

## Deploy ke Vercel (GitHub)

1. Ekstrak ZIP project. Unggah **isi folder** `all-downloader-nexora` (termasuk `public`, `api`, `lib`, `package.json`, dan `vercel.json`) ke **repository GitHub baru**. Jangan unggah ZIP saja sebagai satu berkas.
2. Masuk ke https://vercel.com/new lalu **Import Git Repository** dan pilih repo baru tersebut.
3. Framework Preset: **Other**. Root Directory: `./`. Biarkan Build Command default/kosong. Output Directory: **`public`** (biasanya terdeteksi otomatis; `vercel.json` juga mengaturnya).
4. **Wajib untuk download video:** Siapkan database **khusus Nexora Downloader, bukan Supabase All Tools Nexora**. Terapkan migrasi `supabase/migrations/20261020100000_nexora_downloader_ip_video_quota.sql` pada project khusus tersebut. Di Vercel → Environment Variables isi `DOWNLOAD_SECRET` (acak minimal 32 karakter), `SUPABASE_URL` (alamat project Nexora Downloader sendiri, lihat `.env.example`) dan `SUPABASE_SECRET_KEY` (kunci *secret* dari project tersebut, **hanya server-side**). Deploy ulang setelah menambah env.
5. Klik Deploy. Periksa homepage dan `https://DOMAIN-ANDA/api/health` (respons JSON). Coba link publik sendiri untuk tes provider.

**Batas video:** 4 unduhan video per IP publik dalam 24 jam berjalan (*rolling window*), berlaku lintas browser dengan IP yang sama, disimpan di Supabase melalui HMAC IP (tidak menyimpan IP mentah). Setiap percobaan unduhan video yang diterima dari provider dan diteruskan server menghabiskan satu slot. Saat kuota habis, API download mengembalikan HTTP 429. Foto/audio tidak memakai slot video. Satu IP bersama (misalnya Wi-Fi sekolah) berarti kuota bersama; VPN atau jaringan/IP berbeda tidak bisa diidentifikasi sebagai orang yang sama. Tanpa ketiga environment variables, **opsi video dinonaktifkan** supaya tidak ada jalur tanpa batas. Token proxy berlaku 10 menit.

## Menjalankan di lokal

Node.js 20+:

```bash
npm install
npx vercel dev
```

Tes tanpa npm install (Node built-in):

```bash
npm run check
npm test
```

> Koneksi internet untuk npm dan provider dibutuhkan pada runtime. Project ini sudah melalui uji sintaks dan unit test, tetapi belum teruji end-to-end dengan npm/Mori dan unduhan nyata karena lingkungan build yang digunakan tidak dapat mengakses registri npm/provider.

## Struktur project

```text
public/
  index.html        # antarmuka utama
  styles.css        # Kawaii Arcade responsive design
  app.js            # interaksi, status, dan history lokal
  favicon.svg
api/
  analyze.js        # validasi platform → Mori → opsi media / link
  download.js       # download proxy bertoken (opsional)
  health.js         # status backend
lib/
  platforms.js      # domain allowlist & format normalization
  safety.js         # pemeriksaan URL & keamanan proxy
  token.js          # HMAC token untuk unduhan
design-reference/original-ui3.css  # referensi CSS user
LICENSE           # GNU GPL-3.0
```

## Pemisahan project

Repository ini adalah layanan standalone dan **tidak memakai database All Tools Nexora**. Migrasi kuota tersedia sebagai berkas, tetapi harus dijalankan di project Supabase baru yang didedikasikan khusus untuk Nexora Downloader. Penggunaan project lain, bahkan bila masih satu pemilik, tidak direkomendasikan. Jika belum ada project khusus dan environment variables terkait belum dikonfigurasi, video tetap **fail closed** untuk mencegah kuota yang bisa dilewati.

## Limiter lintas browser

Endpoint `GET /api/quota` menampilkan sisa slot untuk IP pengunjung tanpa mengekspos alamat IP. `/api/download` menghabiskan satu slot **hanya untuk video**, sebelum streaming video dimulai. `/api/analyze` tidak memberikan tautan video langsung yang dapat melewati quota. Quota disimpan persisten dan diperbarui secara atomik melalui fungsi `nexora_downloader_quota` di Supabase. File migrasi: `supabase/migrations/20261020100000_nexora_downloader_ip_video_quota.sql`.

Pengaturan awal wajib: `DOWNLOAD_SECRET`, `SUPABASE_URL`, dan `SUPABASE_SECRET_KEY` pada Vercel (jangan pernah commit nilai secret atau kirim ke browser). **Jangan gunakan URL atau kunci Supabase milik All Tools Nexora; Nexora Downloader harus menggunakan project database yang terpisah.** Jika Supabase gagal, download video **ditolak sementara**. Batasan ini melindungi penggunaan normal, tetapi tidak dapat mengidentifikasi pengguna saat IP berubah atau membatasi unduhan dari URL provider yang diperoleh di luar situs. Empat video berukuran besar untuk tiap IP masih memakai bandwidth proxy Vercel; ini bukan pengganti pembatasan global dan pengelolaan biaya.

## Batasan yang penting

- **Belum menjamin setiap platform/URL berhasil.** Mori menggunakan parser dan sebagian endpoint pihak ketiga, yang bisa berubah atau memblokir serverless/IP Vercel.
- **Video dan audio terpisah tidak di-*mux* otomatis**. Label jenis/kualitas berasal dari provider; tidak ada konversi MP3 atau jaminan audio di semua MP4.
- Endpoint analisis memeriksa hingga 20 kandidat valid, memprioritaskan opsi yang siap diunduh, dan menampilkan hingga 12 opsi per link. Untuk playlist besar, adapter ini **belum** membuat job batch atau antrian terpisah.
- Proxy file dibatasi 120 MB dan eksekusi serverless ~55 detik; limit aktual paket/region Vercel mungkin lebih ketat. Media besar sebaiknya dibuka lewat link langsung atau backend khusus.
- Download yang memerlukan cookie login, DRM, atau hak akses privat tidak didukung. Hanya unduh konten yang Anda punya hak untuk menyimpan.
- Untuk traffic publik besar, pasang **Vercel WAF/rate limiting**, observability dan monitor error per provider. Fungsi analisis saat ini tidak memakai rate limiter persisten.
- Serverless tidak memiliki penyimpanan permanen. Riwayat berada di browser, bukan server.

## Keamanan dan lisensi

Input divalidasi terhadap 16 domain platform, non-HTTPS dan host palsu ditolak. Proxy memakai token HMAC sementara, pemeriksaan DNS publik, batas panjang/ukuran, dan tidak meneruskan cookie dari scraper. Proxy mengunci koneksi TLS ke IP DNS yang sudah diperiksa, sehingga tidak mengulang resolusi DNS sesudah validasi. Ini pengamanan berlapis, bukan pengganti kebijakan outbound egress; untuk deployment skala besar tambahkan egress proxy dan rate limiter.

Package Mori diterbitkan sebagai **GPL-3.0-or-later**. Project ini menyertakan `LICENSE` GPL-3.0 dan atribusi di footer. Jika mendistribusikan kode, patuhi kewajiban GPL serta lisensi dependency lainnya.

## Troubleshooting singkat

| Gejala | Solusi |
|---|---|
| 404 pada homepage | Pastikan Output Directory `public` dan `public/index.html` tersedia. |
| Function 500 | Periksa runtime Node.js 20+, `@coflyn/mori` terinstal dan file `bundle.js` ikut dalam paket Functions. |
| Ekstraksi gagal | Pastikan link publik; coba platform lain, cek Vercel Runtime Logs dan endpoint provider. |
| Video tidak bisa diunduh | Periksa `DOWNLOAD_SECRET`, `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` pada deployment Vercel; cek `/api/health` dan `/api/quota`. |
| File terlalu besar | Gunakan link langsung; backend Vercel terbatas untuk file besar. |
| Audio tidak muncul | Sumber tidak menawarkan audio gabungan, atau downloader Mori gagal mengekstraknya. |

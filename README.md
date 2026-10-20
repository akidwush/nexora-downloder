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
4. (Direkomendasikan) Di Project Settings → Environment Variables, tambah `DOWNLOAD_SECRET` dengan string acak **minimal 32 karakter**. Buat lokal dengan `openssl rand -hex 32`. Pilih Production / Preview sesuai kebutuhan. Deploy ulang sesudah menambah env.
5. Klik Deploy. Periksa homepage dan `https://DOMAIN-ANDA/api/health` (respons JSON). Coba link publik sendiri untuk tes provider.

Jika `DOWNLOAD_SECRET` tidak diisi, analisis link tetap disiapkan, tetapi website hanya menyediakan tautan langsung ke file provider (tombol **Buka media**). Browser atau provider dapat membuka konten alih-alih mengunduh otomatis. Token proxy berlaku 10 menit; ulangi analisis jika habis.

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
| Tombol unduh membuka halaman | Isi `DOWNLOAD_SECRET` untuk mengaktifkan proxy, atau unduh manual dari tab provider. |
| File terlalu besar | Gunakan link langsung; backend Vercel terbatas untuk file besar. |
| Audio tidak muncul | Sumber tidak menawarkan audio gabungan, atau downloader Mori gagal mengekstraknya. |

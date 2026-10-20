# All Downloader Nexora ✦

Website **standalone**, bukan bagian dari All Tools Nexora. Landing page dan downloader menggunakan palet *Kawaii Arcade* yang diadaptasi dari ZIP referensi (`design-reference/original-ui3.css`): cyan pastel, kartu cream, outline cokelat, tombol kuning 3D, dan dekorasi pink. CSS baru sengaja ditulis terpisah agar tidak mewarisi selector `!important` dari tema untuk website lain.

## Stack

- HTML/CSS/JavaScript vanilla, frontend di `public/` (tanpa build frontend).
- Netlify Functions Node.js: `netlify/functions/analyze.mjs`, `netlify/functions/download.mjs`, `netlify/functions/health.mjs`, menggunakan utilitas `api/` dan `lib/`.
- `@coflyn/mori` (lisensi GPL-3.0-or-later) menyediakan engine scraper. Repo asli: https://github.com/coflyn/Mori
- Penyimpanan riwayat di `localStorage` perangkat masing-masing. Tidak ada database atau login.

## Deploy ke Netlify dari GitHub (disarankan)

**Hosting Nexora Downloader terpisah dari Vercel All Tools Nexora.** Repo: https://github.com/akidwush/nexora-downloder

1. Buka https://app.netlify.com/start → **Import from Git** → GitHub → pilih `akidwush/nexora-downloder` dengan branch `main`.
2. Netlify membaca `netlify.toml` otomatis. Base directory: root; build command: `npm run check && npm test`; publish directory: `public`; functions directory: `netlify/functions`.
3. Pada **Site configuration → Environment variables** atur `DOWNLOAD_SECRET` dengan string acak minimal 32 karakter. Generate lokal dengan `openssl rand -hex 32`; jangan commit rahasia ke GitHub.
4. Deploy. Buka `/api/health` dan pastikan ada `"hosting":"Netlify"`. Uji link publik milikmu dan periksa Netlify Functions logs.
5. Setiap push ke `main` otomatis memicu deploy baru melalui Git integration.

**Preview video:** Setelah Analyze Link, pilih **Preview** pada format video untuk membuka pemutar HTML5 dalam dialog tanpa langsung meninggalkan halaman. Video hanya dimuat ketika pengunjung mengetuk Preview. Setelah menonton, pilih **Download / Simpan** atau tutup pemutar. Preview dan download melalui **token media yang sama** memakan satu slot kuota pada instance Netlify yang sama (seek/retry token sama tidak menambah slot). Browser mungkin tetap mengunduh secara otomatis atau tidak bisa memutar jika provider melarang hotlink, memasang header attachment, atau mengharuskan cookie/header khusus. Jika unduh membuka tab pemutar media, pengguna dapat menyimpan manual apabila diizinkan sumber. Ini bukan proxy streaming dan belum menjamin semua sumber bisa dipreview.

**Mode hemat bandwidth Netlify:** `/api/analyze` menggunakan Mori untuk mencari opsi media. `/api/download` memverifikasi token, menjalankan limiter IP per-instance, lalu mengirim **HTTP 302 redirect** ke URL HTTPS media asli. Byte video **tidak diteruskan oleh Netlify Functions**. Browser dapat membuka/streaming video dalam tab baru dan provider dapat menolak akses tanpa cookie/referer; unduh manual bila tersedia.

**Batas 4 video/24 jam hanya best effort.** Kuota disimpan di memori masing-masing proses Netlify Function, tidak global dan tidak persisten. Mengganti browser dengan IP sama hanya berbagi hitungan ketika ditangani proses sama. Mengganti instance, cold start, restart, atau redeploy dapat mengulang kuota. Pengguna bisa memakai URL media langsung di luar situs setelah dialihkan. Ini bukan jaminan pencegahan penyalahgunaan atau pengendalian tagihan.

Netlify membatasi respons streaming Functions maksimal 20 MB, jadi video besar harus memakai pengalihan ke sumber dan keberhasilannya bergantung pada sumber. Tanpa `DOWNLOAD_SECRET`, opsi video akan ditandai tidak siap; foto/audio masih dapat menggunakan URL langsung jika sumber mendukung.
## Menjalankan di lokal

Node.js 20+ (Node.js 22 direkomendasikan):

```bash
npm install
npm run dev
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

## Limiter video kode saja (tanpa database)

- `lib/quota.js` menyimpan maksimum 4 cap waktu per IP dalam memori **tiap proses**. IP disimpan sebagai HMAC-SHA256 menggunakan `DOWNLOAD_SECRET`, tidak sebagai alamat mentah. Alamat IPv6 digabung ke /64.
- Di Netlify, `/api/download` memeriksa kuota dan mengirim redirect 302 ke file asli (bukan streaming lewat Netlify); video ke-5 pada proses sama mendapat HTTP 429.
- Pada serverless, **setiap instance/function terisolasi**. Tidak ada counter bersama antar-instance dan tidak ada penyimpanan tahan restart. Ini *best effort*, bukan enforcement global atau jaminan pengendalian biaya.
- Browser berbeda dengan IP yang sama akan berbagi kuota **jika diarahkan ke proses yang sama**. Satu jaringan Wi-Fi dapat berbagi IP; pengguna yang mengganti jaringan/VPN bisa mendapat IP berbeda.
- Tampilan hanya mengumumkan batas sementara dan tidak lagi mengklaim angka sisa kuota real-time, karena informasi tersebut tidak bisa akurat lintas instance.
- Tetap diperlukan `DOWNLOAD_SECRET` untuk memverifikasi token unduhan. Jangan taruh secret di frontend atau GitHub.
- Untuk kuota yang **benar-benar konsisten dan tahan restart** diperlukan penyimpanan/limiter bersama; itu sengaja **tidak dipasang** sesuai permintaan tanpa layanan tambahan.

## Batasan yang penting

- **Belum menjamin setiap platform/URL berhasil.** Mori menggunakan parser dan sebagian endpoint pihak ketiga, yang bisa berubah atau memblokir serverless/IP Netlify.
- **Video dan audio terpisah tidak di-*mux* otomatis**. Label jenis/kualitas berasal dari provider; tidak ada konversi MP3 atau jaminan audio di semua MP4.
- Endpoint analisis memeriksa hingga 20 kandidat valid, memprioritaskan opsi yang siap diunduh, dan menampilkan hingga 12 opsi per link. Untuk playlist besar, adapter ini **belum** membuat job batch atau antrian terpisah.
- Netlify memakai redirect langsung agar video besar tidak melewati batas streaming Functions 20 MB. Sebagian provider dapat menolak hotlink atau memutar video di browser.
- Download yang memerlukan cookie login, DRM, atau hak akses privat tidak didukung. Hanya unduh konten yang Anda punya hak untuk menyimpan.
- Function analisis Netlify menerapkan throttle 12 permintaan per menit per IP. Monitor penggunaan credit, Functions logs, dan error provider; limit 24 jam masih per-instance.
- Serverless tidak memiliki penyimpanan permanen. Riwayat berada di browser, bukan server.

## Keamanan dan lisensi

Input divalidasi terhadap 16 domain platform, non-HTTPS dan host palsu ditolak. Mode Netlify memakai token HMAC sementara dan validasi URL HTTPS sebelum redirect tanpa meneruskan file, cookie, atau header scraper. Proxy Node lama memiliki pemeriksaan DNS publik dan pinning jika digunakan di hosting lain. Ini pengamanan berlapis, bukan pengganti kebijakan outbound egress; untuk deployment skala besar tambahkan egress proxy dan rate limiter.

Package Mori diterbitkan sebagai **GPL-3.0-or-later**. Project ini menyertakan `LICENSE` GPL-3.0 dan atribusi di footer. Jika mendistribusikan kode, patuhi kewajiban GPL serta lisensi dependency lainnya.

## Troubleshooting singkat

| Gejala | Solusi |
|---|---|
| 404 pada homepage | Pastikan Output Directory `public` dan `public/index.html` tersedia. |
| Function 500 | Periksa runtime Node.js 20+, `@coflyn/mori` terinstal dan file `bundle.js` ikut dalam paket Functions. |
| Ekstraksi gagal | Pastikan link publik; coba platform lain, cek Netlify Functions logs dan endpoint provider. |
| Video gagal dibuka | Periksa `DOWNLOAD_SECRET` di Netlify dan `/api/health`. Provider dapat menolak direct link, dan kuota per-instance dapat sementara habis. |
| File terbuka di tab baru | Ini adalah mode redirect Netlify. Simpan manual bila browser dan provider mengizinkan. |
| Audio tidak muncul | Sumber tidak menawarkan audio gabungan, atau downloader Mori gagal mengekstraknya. |

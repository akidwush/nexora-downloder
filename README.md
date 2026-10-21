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

**Preview video:** Setelah Analyze Link, tombol **Preview** pada video memakai `/api/media?mode=preview`, sedangkan **Download / Simpan** memakai `/api/media` dengan `Content-Disposition: attachment`. Keduanya satu domain dengan NEXORA, tanpa tab eksternal dan tanpa memaparkan URL CDN kepada navigasi browser. Pemutar mendukung permintaan `Range` untuk seek jika CDN mendukung. Token yang sama dihitung satu slot pada instance kuota yang sama. Beberapa provider tetap dapat menolak akses server-side, memerlukan cookie, atau mengirim format yang tidak dapat diputar.

**Mode unduh same-origin (Netlify Edge):** `/api/analyze` menggunakan Mori untuk mencari opsi media dan memberikan `/api/media?token=...`. `netlify/edge-functions/media.mjs` meminta izin ke `/api/download` (Function internal yang memverifikasi token dan limiter, masih membalas 302 **hanya ke Edge**), lalu Edge mengambil media dari CDN dan melakukan streaming ke browser dengan header unduh. Browser tetap di domain NEXORA. **Traffic video sekarang melewati Netlify Edge dan memakan bandwidth/kuota Netlify**: pantau pemakaian di dashboard agar tidak melebihi batas paket gratis. Proxy menetapkan batas 120 MB per respons dan menolak URL/protokol yang tidak aman; tidak menjamin semua video atau ukuran besar berhasil.

**Batas 4 video/24 jam hanya best effort.** Kuota disimpan di memori masing-masing proses Netlify Function, tidak global dan tidak persisten. Mengganti browser dengan IP sama hanya berbagi hitungan ketika ditangani proses sama. Mengganti instance, cold start, restart, atau redeploy dapat mengulang kuota. Kuota per-instance ini bukan jaminan pencegahan penyalahgunaan atau pengendalian tagihan.

Netlify Functions memiliki batas respons streaming 20 MB; itulah sebabnya **streaming file dilakukan di Netlify Edge**, bukan di Functions. Edge memiliki batas dan penggunaan bandwidth tersendiri, serta ketergantungan pada kemampuan hotlink/akses upstream. Rute `/api/media` membatasi respons menjadi maksimum 120 MB. Tanpa `DOWNLOAD_SECRET`, opsi video akan ditandai tidak siap; foto/audio masih dapat menggunakan URL langsung jika sumber mendukung.
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
- Di Netlify, `/api/download` memeriksa kuota dan mengirim HTTP 302 **ke Edge gateway internal saja**. `/api/media` lalu meng-stream byte media ke pengguna dengan domain NEXORA; video ke-5 pada proses sama mendapat HTTP 429.
- Pada serverless, **setiap instance/function terisolasi**. Tidak ada counter bersama antar-instance dan tidak ada penyimpanan tahan restart. Ini *best effort*, bukan enforcement global atau jaminan pengendalian biaya.
- Browser berbeda dengan IP yang sama akan berbagi kuota **jika diarahkan ke proses yang sama**. Satu jaringan Wi-Fi dapat berbagi IP; pengguna yang mengganti jaringan/VPN bisa mendapat IP berbeda.
- Tampilan hanya mengumumkan batas sementara dan tidak lagi mengklaim angka sisa kuota real-time, karena informasi tersebut tidak bisa akurat lintas instance.
- Tetap diperlukan `DOWNLOAD_SECRET` untuk memverifikasi token unduhan. Jangan taruh secret di frontend atau GitHub.
- Untuk kuota yang **benar-benar konsisten dan tahan restart** diperlukan penyimpanan/limiter bersama; itu sengaja **tidak dipasang** sesuai permintaan tanpa layanan tambahan.

## Batasan yang penting

- **Belum menjamin setiap platform/URL berhasil.** Mori menggunakan parser dan sebagian endpoint pihak ketiga, yang bisa berubah atau memblokir serverless/IP Netlify.
- **Video dan audio terpisah tidak di-*mux* otomatis**. Label jenis/kualitas berasal dari provider; tidak ada konversi MP3 atau jaminan audio di semua MP4.
- Endpoint analisis memeriksa hingga 20 kandidat valid, memprioritaskan opsi yang siap diunduh, dan menampilkan hingga 12 opsi per link. Untuk playlist besar, adapter ini **belum** membuat job batch atau antrian terpisah.
- Unduhan memakai Netlify Edge gateway agar browser tidak dibawa ke domain provider; sebagian provider menolak proxy, dan bandwidth file dihitung pada Netlify. Limit 120 MB per respons dan batas layanan hosting tetap berlaku.
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
| Download gagal atau menampilkan JSON | Pastikan deploy memuat `netlify/edge-functions/media.mjs`, token belum kedaluwarsa, `DOWNLOAD_SECRET` terpasang, kuota masih cukup, dan provider tidak menolak akses dari Edge. |
| Audio tidak muncul | Sumber tidak menawarkan audio gabungan, atau downloader Mori gagal mengekstraknya. |

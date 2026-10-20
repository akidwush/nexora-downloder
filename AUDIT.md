# Audit Nexora Downloader — 20 Oktober 2026

Repository: `akidwush/nexora-downloder` · branch: `main`

## Temuan dan perbaikan

| Prioritas | Masalah | Solusi |
|---|---|---|
| Tinggi | Filter alamat publik menerima sebagian range `192.0.0.0/24` (contoh `192.0.0.8`) | Blok range IPv4 reserved secara penuh; tambah uji IPv4/IPv6 |
| Sedang | Ekstensi download diasumsikan MP4/MP3/JPG untuk format lain | Tentukan ekstensi dari URL file dan label sumber; tangani WebM, OGG, AAC, FLAC, WebP, AVIF, dan format umum lainnya |
| Sedang | Manifest HLS/DASH bisa diunduh sebagai `.mp4` yang tidak dapat diputar | Jangan tampilkan sebagai unduhan file tunggal; tampilkan alasan unsupported |
| Sedang | Placeholder kosong dalam 20 data awal menghilangkan opsi valid sesudahnya | Filter opsi tidak valid sebelum batas jumlah diterapkan |
| Rendah | Frontend menolak hostname YouTube NoCookie yang diterima server | Samakan daftar domain |
| Rendah | Deteksi platform otomatis berpotensi mengatur ulang fokus saat mengetik | Gunakan `focus:false` saat perubahan input |
| Sedang | Deteksi file audio/gambar dari URL belum mencakup OGG/FLAC/AVIF dan lainnya | Perluas deteksi tipe file dan tambah regression test |

## Validasi

- Workflow GitHub Actions `Nexora checks` menjalankan `npm run check` dan `npm test` pada setiap push ke main.
- Tes mencakup validasi platform, filter URL/DNS, token bertanda tangan, format media, API error path, dan keberadaan link sosial di footer.
- Saat audit ini dilakukan, GitHub Actions telah mengonfirmasi 17 tes lulus pada commit `82143d3`; perubahan klasifikasi berikutnya memerlukan verifikasi run terbaru.

## Risiko/batasan yang masih terbuka

- Belum ada bukti uji unduhan sesungguhnya untuk semua 16 platform karena runtime extractor `@coflyn/mori` bergantung pada provider luar.
- API sumber dapat berubah, terkena pemblokiran bot, atau menolak alamat IP serverless.
- `DOWNLOAD_SECRET` perlu disetel pada Vercel untuk tombol download proxy. Tanpanya, pengguna hanya mendapat tautan langsung.
- Proxy tetap dibatasi 120 MB/timeout Vercel; tidak dapat menggabungkan video dan audio terpisah, streaming HLS/DASH, konten privat, maupun DRM.
- Tambahkan WAF/rate limiting persisten dan observability sebelum digunakan untuk traffic publik besar.
- Keberhasilan deployment Vercel untuk repo ini belum terverifikasi. Setelah terhubung, periksa `/api/health`, log Functions, dan beberapa tautan publik yang pengguna berhak unduh.

Catatan: lulusnya unit test dan syntax check **tidak membuktikan** seluruh platform downloader pasti bekerja end-to-end.

## Audit lanjutan — perbaikan downloader (20 Oktober 2026)

| Prioritas | Temuan baru | Perbaikan di main |
|---|---|---|
| Sedang | Deskripsi seperti "MP4 no sound" bisa diklasifikasikan sebagai audio karena substring `sound` | Gunakan ekstensi URL sebagai prioritas, kemudian token jenis media yang utuh |
| Sedang | 12 kandidat gagal pertama menutupi format siap unduh di posisi berikutnya | Periksa seluruh 20 kandidat yang telah dinormalisasi, prioritaskan opsi valid dan batasi hasil akhir hingga 12 |
| Tinggi | Alamat IPv6 yang sama dapat dieja dengan nol di depan sehingga lolos regex blokir range reserved | Kanonisasi IPv6 sebelum pemeriksaan; blok pula rentang dokumentasi dan ORCHID |
| Sedang | Proxy dapat menyimpan respons HTTP 206 parsial atau redirect ke manifest HLS/DASH sebagai file lengkap | Wajibkan HTTP 200; blok MIME dan URL playlist HLS/DASH serta respons dokumen |
| Rendah | Belum ada tes regresi untuk keadaan di atas | Tambahkan kasus ke `tests/core.test.js` dan `tests/routes.test.js` |

**Verifikasi:** GitHub Actions menjalankan syntax check dan unit tests otomatis setiap push ke main. Status commit akhir dapat dilihat pada tab Actions repository; pengujian live terhadap situs/provider eksternal tetap membutuhkan deployment dan tautan media asli.

**Batasan belum terselesaikan:** belum diuji end-to-end dengan Mori pada runtime produksi dan sejumlah provider dapat menolak permintaan dari serverless; download streaming terpisah, DRM, konten privat, rate limiting persisten dan observability tetap di luar cakupan patch ini.

## Limiter video: implementasi hanya kode (20 Oktober 2026)

- Permintaan limit: 4 video per IP per 24 jam berjalan, tetap dikenali ketika browser diganti **pada proses server yang sama**.
- Implementasi: `lib/quota.js` menyimpan daftar waktu unduhan pada `Map` dalam memori Node.js dengan HMAC-SHA256 atas identitas IP, sehingga alamat IP mentah tidak disimpan dalam counter. Rentang IPv6 dihitung per /64. Memori dibatasi 5.000 bucket aktif dan entri lama dibersihkan oportunistik.
- Endpoint `/api/download` memeriksa kuota sebelum menghubungi provider. Slot ditambah setelah HTTP upstream dapat diterima, sebelum streaming, secara sinkron dalam satu proses. Jika habis, HTTP 429 beserta `Retry-After`. Foto/audio tidak memakai kuota video.
- Tidak lagi ada penyimpanan eksternal, endpoint statistik kuota antar-instance, kunci/URL layanan data tambahan, atau berkas migrasi database.
- Hanya `DOWNLOAD_SECRET` (minimal 32 karakter) yang diperlukan untuk membuat/verifikasi token unduhan; tanpa secret, unduhan video tidak diaktifkan.
- **Keterbatasan penting:** Vercel menjalankan Functions pada beberapa instance/proses terpisah. `Map` tersebut **tidak persisten dan tidak dibagi**; restart, redeploy, cold start, atau perpindahan instance dapat menghapus/memisahkan hitungan. Karena itu batas 4/24 jam **tidak terjamin secara global**, tidak boleh diklaim sebagai perlindungan biaya/bandwidth yang kuat.
- Satu IP bersama berarti satu kuota proses bersama; pergantian IP/VPN dapat menghindari pembatasan. Kode tidak bisa mengenali satu orang secara andal ketika IP berubah.
- Verifikasi: sintaks dan tes regresi melalui GitHub Actions; pengujian lintas instance dan trafik nyata belum dilakukan. Tidak ada perubahan database ataupun hosting eksternal dalam revisi ini.

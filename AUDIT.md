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

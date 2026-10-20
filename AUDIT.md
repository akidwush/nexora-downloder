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

## Limiter video lintas browser — 20 Oktober 2026

- Video: maksimal **4 permintaan unduh yang disetujui backend dalam 24 jam berjalan** per IP publik. Pembatasan dicek setelah upstream mengembalikan respons media layak unduh dan sebelum mengirim body video.
- Browser berbeda di IP yang sama memakai kuota bersama. IP pengguna disimpan **hanya sebagai HMAC-SHA256** memakai DOWNLOAD_SECRET; IPv6 digabung per /64 untuk mengurangi reset saat privacy address berubah.
- Persistensi/atomicity: fungsi `public.nexora_downloader_quota` memakai transaksi advisory lock, tabel `public.nexora_downloader_ip_quota`, RLS aktif, akses hanya service_role. Row lama dibersihkan berkala oportunistik.
- Video URL tidak dibocorkan dari hasil analisis; tombol unduhan memakai token bertanda tangan. Foto/audio tidak memakai kuota video. Token yang dibuat sebelum patch tanpa kategori dianggap video.
- `GET /api/quota` membaca sisa slot; UI menampilkan 4/4 hingga 0/4 dan waktu pulih berikutnya.
- **Fail closed:** tanpa `DOWNLOAD_SECRET`, `SUPABASE_URL`, dan `SUPABASE_SECRET_KEY` di runtime, video tidak dapat diunduh. Rahasia jangan dimasukkan ke git/frontend.
- **Batasan:** IP tidak sama dengan identitas orang; satu Wi-Fi berbagi kuota, VPN/jaringan berbeda bisa mendapatkan kuota lain. Slot dipakai saat backend mulai mengirim video, meskipun pengguna membatalkan unduhan. Batas per IP tidak membatasi biaya global ataupun permintaan analisis yang tidak menghasilkan download.
- **Koreksi pemisahan project:** migrasi yang sempat diterapkan ke Supabase `All tools` telah di-rollback. Tabel `public.nexora_downloader_ip_quota` terbukti kosong sebelum rollback; tabel dan fungsi `public.nexora_downloader_quota` telah dihapus dan diverifikasi tidak ada. Jangan gunakan database All Tools untuk downloader. Migrasi di repository hanya untuk project **khusus Nexora Downloader**, yang belum dibuat/diaktifkan. Target Vercel untuk repo standalone juga belum terhubung, sehingga fitur limiter belum aktif di produksi. `npm run check` dan `npm test` berjalan pada GitHub Actions.

## Koreksi infrastruktur (20 Oktober 2026)

Database kuota telah dipisahkan dari project utama: objek yang sempat dibuat di Supabase All Tools dikembalikan seperti semula (kedua objek dihapus setelah memastikan tabel 0 baris). `.env.example` kini menggunakan placeholder URL Supabase khusus downloader; README menegaskan bahwa deploy harus memakai database khusus. Tidak ada resource Supabase Nexora Downloader baru yang dibuat otomatis, sehingga sebelum project khusus dikonfigurasi unduhan video tetap fail-closed.

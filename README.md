# Serene — Spa Management

Implementasi MVP dari [blueprint](spa-management-nuxt4-blueprint.md), menggunakan Nuxt 4, Vue Composition API, JavaScript, Tailwind CSS v4, Nitro, PostgreSQL, Drizzle, Zod, dan Argon2. Semua data operasional tersimpan di PostgreSQL.

## Menjalankan

Persyaratan: Node.js 22.19+ dan PostgreSQL 17.

```bash
npm install
cp .env.example .env
# Isi DATABASE_URL, SESSION_SECRET (minimal 32 karakter), APP_URL, dan SEED_PASSWORD.
# Jika belum mempunyai PostgreSQL lokal:
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Buka http://localhost:3000. Seed hanya berjalan pada database tanpa user, tidak menimpa data yang sudah ada. Password akun contoh mengikuti `SEED_PASSWORD` di `.env`.

| Akun contoh | Role | Lokasi |
| --- | --- | --- |
| owner@serene.local | Owner | Semua |
| cs@serene.local | Customer Service | Semua |
| admin@serene.local | Location Admin | Seminyak |
| ayu@serene.local | Therapist | Seminyak |
| made@serene.local | Therapist | Seminyak |
| putu@serene.local | Therapist | Canggu |
| wayan@serene.local | Therapist | Canggu |
| komang@serene.local | Therapist | Ubud |
| ni@serene.local | Therapist | Ubud |

Password akun demo mengikuti `SEED_PASSWORD` yang ditetapkan pengelola. File `.env` tidak disertakan dalam repository.

## Alur operasional

1. Login sebagai CS. Tambah customer dan alamat melalui Customers.
2. Buat order dari Orders. Harga dan durasi dihitung server, kemudian disimpan sebagai snapshot. Konfirmasi order dan tetapkan cabang.
3. Login sebagai admin lokasi atau owner. Buka Dispatch, pilih order, dan assign therapist yang tersedia pada slot tersebut. Panel WhatsApp menyiapkan pesan dan tautan konfirmasi.
4. Admin membuka **Kirim melalui WhatsApp**, lalu menekan Send di WhatsApp. Therapist membuka tautan tanpa login, memilih **Ambil job** atau **Tidak bisa**, lalu mengonfirmasi. Setelah menerima, tautan yang sama menyediakan navigasi, mulai perjalanan, tiba di lokasi, mulai treatment, dan selesai treatment.
5. Login sebagai owner/super admin untuk mencatat pembayaran pada detail order, termasuk pembayaran sebagian. Setelah treatment selesai dan tagihan lunas, owner atau admin lokasi dapat menutup order.
6. Owner melihat dashboard, laporan orders/revenue/therapists/locations, export CSV, dan audit log.

Penolakan dan pengalihan therapist menyimpan assignment lama. Therapist dapat melihat histori penugasannya, tetapi hanya assignment aktif yang dapat diperbarui. Pembayaran dapat dicatat sebelum atau setelah treatment selesai; refund oleh owner merupakan pencatatan pengembalian dana yang sudah dilakukan, bukan eksekusi transfer bank.

## Halaman

- `/` — landing page publik dengan layanan aktif, durasi, harga sesuai area, dan tautan booking.
- `/login`, `/logout`, `/dashboard`, `/dispatch`
- `/orders`, `/orders/new`, `/orders/:id`, `/orders/:id/edit`
- Customers, Locations, Therapists, Services, Schedules, dan Users: daftar, tambah, detail, edit
- `/payments`, `/reports`, `/reports/orders`, `/reports/revenue`, `/reports/therapists`, `/reports/locations`, `/audit`
- `/therapist`, `/therapist/jobs`, `/therapist/jobs/:id`, `/therapist/history`, `/therapist/profile`
- `/book`: permintaan booking publik, status NEW, kemudian dikonfirmasi CS
- `/job/:token`: halaman job khusus therapist tanpa login, dibagikan melalui WhatsApp
- `/dokumentasi.html`: panduan penggunaan demo berupa HTML statis, publik tanpa login.

## Landing page publik

Beranda `/` dapat dibuka tanpa login, termasuk oleh pengguna yang sudah login. Katalog mengambil layanan aktif, durasi, deskripsi dan harga langsung dari `/api/public/catalog`. Pilihan area memakai harga khusus lokasi bila tersedia, kemudian harga umum layanan. Semua area menampilkan harga terendah di area aktif; label **Mulai dari** muncul bila harga berbeda. Harga yang belum ditetapkan tidak ditampilkan sebagai nol rupiah dan kartu tersebut tidak menyediakan tombol booking.

Tombol **Pilih treatment** membawa ID layanan dan area yang dipilih ke `/book`; pilihan yang valid otomatis terisi pada form. Area dengan harga belum tersedia tidak dapat dikirim sebagai booking. Keterangan transport/pajak mengikuti flags Settings. Landing page tidak mengekspos data customer, order, therapist, atau pembagian pendapatan.

## Aturan server

- Kolom rupiah pada harga layanan, diskon, transport, pajak, dan pembayaran menampilkan pemisah ribuan Indonesia (contoh `250.000`, atau `12.500,50` untuk desimal). Nilai dikirim ke API sebagai angka tanpa pemisah. Input kosong tetap kosong; nominal tidak valid, melebihi batas, atau lebih dari dua angka desimal ditolak pada form.
- Session opaque di cookie HTTP-only, HMAC, hashed token di database, kedaluwarsa 7 hari, logout mencabut session. Role dan status aktif dibaca ulang setiap request.
- API memeriksa role dan scope lokasi. Admin lokasi tidak dapat membaca atau mengubah order cabang lain. CS tidak dapat mengubah master sistem, assign therapist, atau mencatat pembayaran.
- Validasi Zod menolak status/total yang disuntikkan client. Transisi status mengikuti workflow eksplisit.
- Assignment memakai transaction, row lock order dan therapist, serta unique index satu assignment aktif per order. Slot pending mereservasi waktu sampai penawaran kedaluwarsa.
- Ketersediaan mengikuti lokasi kerja, jadwal AVAILABLE, batas jam kerja, cuti/libur, dan overlap job aktif. Pergantian jadwal atau penonaktifan therapist dengan job aktif ditolak jika membuat job tidak valid.
- Waktu booking dikonversi berdasarkan timezone cabang. Durasi total memakai jumlah `duration_minutes × qty`, sebagai treatment berurutan. Order maksimal 24 jam, dan harus sepenuhnya berada dalam jadwal therapist.
- Nilai uang memakai PostgreSQL `numeric(14,2)` dan perhitungan sen. Constraint database menjaga total dan kuantitas. Partial payment, overpayment guard, refund, dan transaksi nol rupiah didukung.
- Histori status, assignment, notifikasi, dan audit dibuat dalam transaction yang sama dengan mutasi.
- Nomor order memakai sequence PostgreSQL; nomor tidak bentrok pada request bersamaan. Gap sequence setelah rollback adalah normal.
- Dashboard dan job melakukan polling setiap 25 detik ketika tab aktif.
- Laporan menggunakan tanggal booking; dashboard revenue menggunakan waktu pembayaran dalam Asia/Makassar. Net collected adalah jumlah pembayaran SUCCESS; pembayaran REFUNDED dikeluarkan, bukan dikurangi dua kali.
- Form publik tidak mengungkap data customer berdasarkan telepon dan tidak menerima diskon/total dari client. Booking publik memakai counter PostgreSQL atomik per IP, nomor WhatsApp dan total request; tetap berlaku setelah restart dan antar instance. Login/job memakai limiter in-memory. `TRUST_PROXY_HOPS` menentukan pembacaan IP di belakang proxy terpercaya.

## Pin lokasi dan navigasi

Customer dapat memilih pin di `/book` dengan klik peta, menggeser marker, tombol **Gunakan lokasi saya**, atau menempelkan koordinat/tautan Google Maps lengkap. Lokasi perangkat hanya diminta setelah tombol ditekan. Pin bersifat opsional untuk menjaga kompatibilitas order lama.

Pin juga tersedia pada alamat tersimpan dan form order admin. Koordinat menjadi snapshot pada order; perubahan alamat tersimpan tidak mengubah tujuan job yang sudah dibuat. Pada detail job therapist tersedia peta tujuan dan **Buka rute di Google Maps**. Order tanpa pin menggunakan alamat tertulis dengan keterangan agar therapist mengonfirmasi lokasi.

Tautan Google Maps singkat perlu dibuka terlebih dahulu dan disalin sebagai tautan lengkap yang memuat koordinat. Tautan tempat memakai koordinat tempat yang dipilih, bukan titik tengah kamera peta.

Peta menggunakan [Leaflet](https://leafletjs.com/reference.html) dan OpenStreetMap; navigasi menggunakan [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). Tidak memerlukan Google Maps API key. Attribution peta ditampilkan dan tile hanya dimuat untuk peta yang dibuka, mengikuti [kebijakan tile OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Provider dapat diganti melalui `NUXT_PUBLIC_MAP_TILE_URL` dan `NUXT_PUBLIC_MAP_ATTRIBUTION`; gunakan provider yang sesuai untuk volume traffic deployment.

## Penawaran job melalui WhatsApp

Setiap assignment baru membuat tautan acak khusus untuk assignment tersebut. Admin/owner dapat menyalin pesan atau tautan dan membuka `wa.me` dengan pesan yang sudah disiapkan. Pengiriman tetap manual: **membuka WhatsApp bukan bukti pesan terkirim atau dibaca**. Tidak ada pengiriman, pembacaan chat, atau penerimaan Live Location melalui WhatsApp API.

Penawaran awal berlaku **30 menit sejak dibuat**, termasuk waktu admin menyiapkan pengiriman. Admin dapat membuat ulang tautan dengan masa respons 15, 30, 60, atau 120 menit. Membuat ulang tautan membatalkan tautan sebelumnya; kirim tautan pengganti kepada therapist. Setelah job diterima, batas respons tidak menghalangi pembaruan status. Akses operasional berlaku sampai 24 jam setelah waktu selesai booking, atau minimal 24 jam sejak tautan diterbitkan.

Therapist tidak perlu login. Pembukaan halaman/preview WhatsApp hanya melakukan GET; semua keputusan dan pembaruan status memerlukan tombol konfirmasi dan POST. Preview penawaran hanya menampilkan jadwal, layanan, durasi, dan area; nama/telepon customer, alamat lengkap, koordinat, dan catatan ditampilkan setelah penerimaan. Pembayaran, daftar customer, dan order lain tidak tersedia melalui tautan ini.

Token disimpan sebagai SHA-256 di database, dibatasi pada satu assignment, dan diperiksa ulang setelah row lock order sebelum mutasi. Penugasan ulang, pembatalan, dan penggantian tautan menolak akses lama. Penerimaan memeriksa ulang jadwal dan bentrok di bawah lock therapist; POST yang diulang pada status yang sama tidak menggandakan timeline. Halaman memakai `no-store`, `noindex`, dan referrer policy `strict-origin` agar token tidak ikut terkirim sebagai Referer ke provider peta.

Penawaran kedaluwarsa langsung tidak dapat diterima dan tidak lagi mereservasi slot. Status assignment `EXPIRED` dan order `NO_THERAPIST_AVAILABLE` direkonsiliasi saat request/polling orders, dashboard, laporan, atau jadwal, serta pada POST halaman job. Tidak ada scheduler atau pengiriman otomatis ke kandidat berikutnya; admin memilih kandidat dan mengirim pesan berikutnya.

Tautan memberikan akses kepada pemegangnya, bukan bukti identitas nomor WhatsApp. Bagikan lewat chat pribadi therapist. OTP belum diterapkan. Tautan `/job/:token` juga dapat dipakai untuk menghubungi admin/customer via WhatsApp setelah penerimaan. Dashboard therapist lama tetap tersedia untuk kompatibilitas, tetapi tidak diperlukan untuk alur WhatsApp.

Setelah **Mulai treatment** dikonfirmasi, countdown `HH:MM:SS` berjalan berdasarkan timestamp transisi `IN_PROGRESS` yang tersimpan di database, ditambah total durasi snapshot layanan × qty. Timer tersedia pada halaman tautan WhatsApp dan detail order/dashboard therapist. Tombol **Selesaikan treatment** nonaktif sampai durasi habis; endpoint penyelesaian juga menolak permintaan sebelum waktunya. Menutup halaman atau memuat ulang tidak memulai ulang countdown. Tampilan memakai waktu server dan waktu berjalan perangkat (`performance.now`), lalu menyinkronkan kembali saat halaman aktif. Treatment tidak otomatis ditandai selesai ketika timer habis: therapist tetap mengonfirmasi penyelesaian.

**Deployment:** isi `APP_URL` dengan domain HTTPS yang dapat diakses dari ponsel therapist. URL localhost hanya cocok untuk pengujian pada komputer yang menjalankan aplikasi. Migrasi `0001_aberrant_cardiac.sql` menambahkan tabel `therapist_job_links`; jalankan `npm run db:migrate` pada setiap database deployment sebelum versi ini dijalankan.

## Harga, pembayaran, dan pembagian pendapatan

Owner/Super Admin mengaktifkan atau menonaktifkan transport dan pajak secara terpisah di **Settings → Transport dan pajak** (`GET/PATCH /api/settings/billing`). Keduanya aktif secara default. Saat nonaktif, kolom tidak tampil pada form order, informasi terkait tidak tampil pada booking publik, dan server memaksa nilai nol pada pembuatan/perubahan order meskipun request masih mengirim nominal. Pengaturan tidak menghitung ulang tagihan atau pembagian pada order yang sudah tersimpan. GET pengaturan tagihan juga tersedia bagi customer service/admin lokasi sebagai referensi perhitungan order; perubahan hanya untuk owner/super admin. Migrasi `0003_foamy_hex.sql` menambahkan tabel pengaturannya.

Metode pembayaran ditampilkan sebagai Tunai, Transfer bank, QRIS, Kartu, dan Pembayaran online. Kode enum tetap digunakan pada API dan database, sementara modal pembayaran, riwayat order, dan tabel Payments menampilkan label yang mudah dibaca. Antarmuka dan pesan sistem tidak menggunakan emoji.

Owner/Super Admin mengatur persentase dan waktu pembagian di **Settings → Pembagian pendapatan** (`GET/PATCH /api/settings/revenue-sharing`). Default owner 10%, admin 10%, therapist 80%; total wajib tepat 100%, maksimal dua desimal. Dasar pembagian selalu subtotal layanan dikurangi diskon, tanpa transport dan pajak. Harga dan durasi layanan disalin saat order dibuat sehingga perubahan master harga tidak mengubah tagihan lama.

Pembayaran boleh dicatat sebelum treatment selesai. Status pembayaran diperbarui tanpa melewati tahapan operasional; order yang telah lunas menjadi `PAID` saat therapist menyelesaikan treatment. Order tidak dapat diedit setelah catatan pembagian dibuat. Pilihan **Saat pembayaran diterima** langsung mencatat bagian dari dana diterima. Pilihan **Setelah treatment selesai** menahan bagian hingga treatment selesai, tetap hanya membagi dana yang sudah diterima. Order yang selesai tetapi belum dibayar memiliki bagian nol hingga pembayaran dicatat.

Pembayaran sebagian diprorata: layanan setelah diskon Rp90.000, transport Rp20.000, pajak Rp10.000 menghasilkan tagihan Rp120.000. Pembayaran Rp60.000 mengandung dana layanan Rp45.000, dibagi Rp4.500/Rp4.500/Rp36.000 pada formula default. Pembulatan menggunakan satuan sen dan largest remainder agar jumlah bagian selalu sama dengan dana layanan yang dibagi. Setiap tambahan pembayaran atau refund menghitung ulang saldo kumulatif, mencatat selisih dalam ledger, dan dilindungi row lock order. Refund membalik hak pendapatan terkait, bukan menghapus histori.

Formula dikunci pada pembayaran pertama atau penyelesaian treatment, sehingga perubahan Settings tidak menghitung ulang histori. Lokasi dan therapist penerima mengikuti penugasan order; pembayaran di muka sebelum dispatch menampilkan bagian therapist yang menunggu penetapan. Rincian, riwayat, dan total bagian tersedia pada detail order untuk owner/super admin, Payments, serta Revenue report/CSV; laporan therapist menyertakan bagian therapist tersendiri. Pembagian adalah pencatatan hak pendapatan, belum transfer otomatis atau pencairan. Tautan WhatsApp therapist tidak mengekspos data keuangan ini.

Jalankan `npm run db:migrate` sebelum deployment. Migrasi `0002_clever_professor_monster.sql` membuat settings, snapshot per order, dan ledger. Script migrasi membuat saldo awal untuk order lama yang memiliki pembayaran atau sudah selesai memakai formula yang aktif saat migrasi; ini tidak merekonstruksi transaksi pembagian historis. Saldo awal dicatat sebagai `OPENING_BALANCE`, refund lama tidak ikut saldo dana sukses, dan pengulangan migrasi tidak menggandakan saldo. Seed demo baru memakai alur pembagian yang sama.

## Akses admin lokasi

Admin lokasi memiliki dashboard operasional tersendiri, dengan antrean booking/assignment, penawaran menunggu respons, treatment aktif, dan jadwal/ketersediaan tim. Payload dashboard tidak memuat pendapatan, chart keuangan, nilai pembayaran, atau pembagian pendapatan. Sidebar admin hanya berisi Dashboard, Orders, dan Therapists. Dispatch tersedia sebagai tindakan pengelolaan order. Akses langsung ke Customers, Locations, Services, Schedules, Payments, Reports, Users, Audit, dan Settings ditolak pada halaman dan API.

Admin dapat membuat/mengedit order, menambahkan customer melalui form order, konfirmasi, penetapan lokasi/therapist, penerbitan tautan WhatsApp, pembatalan, dan penutupan order di lokasi yang ditugaskan kepadanya. Harga dan status/sisa tagihan tetap terlihat sebagai bagian booking; pencatatan pembayaran/refund, histori transaksi, laporan dan pembagian pendapatan khusus owner/super admin. Referensi customer/alamat, lokasi, layanan/harga, serta flags tagihan untuk form tersedia lewat `GET /api/orders/options`; customer baru lewat `POST /api/orders/customer`. Referensi customer dibatasi pada customer yang memiliki order di lokasi admin, serta customer baru yang dibuatnya dan belum memiliki order.

Admin dapat membuat, mengedit dan menonaktifkan therapist yang seluruh lokasi kerjanya berada dalam cakupan admin. Jadwal kerja/libur/cuti dikelola di detail therapist melalui `GET/POST /api/therapists/:id/schedules` dan `PATCH /api/therapists/:id/schedules/:scheduleId`. Konflik dengan job aktif tetap ditolak. Therapist bersama beberapa lokasi tetap terlihat dan dapat dijadwalkan di lokasi admin; perubahan profil global atau lokasi di luar cakupan hanya dilakukan owner. Pemeriksaan berlaku di server dan tidak dapat dilewati dengan mengganti ID atau parameter lokasi.

## Struktur

```text
app/                 Pages, layouts, components, composables, styling
server/api/          REST router Nitro, authentication dan validation
server/services/     Aturan operasi, payment, master data dan reports
server/repositories/ Query dengan scope role/lokasi
server/database/     Drizzle schema PostgreSQL dan migration SQL
shared/              Constants, schemas dan utilities JavaScript
scripts/             Migration, seed dan verification API
tests/              Unit rules dan pengujian UI Playwright
```

API mengikuti endpoint blueprint, ditambah `/api/orders/:id/confirm`, `/close`, `/availability`, `/api/payments`, `/api/payments/:id/refund`, `/api/schedules`, `/api/users`, `/api/notifications`, `/api/reports`, `/api/dashboard`, `/api/audit`, `/api/customers/:id/addresses`, dan `/api/public/catalog`/`booking`.

Alur WhatsApp menambahkan `POST /api/orders/:id/job-link`, `GET /api/public/jobs/:token`, dan `POST /api/public/jobs/:token/action`. Response assign therapist menyertakan `jobLink` (pesan, URL konfirmasi, URL WhatsApp, dan batas waktu); token mentah hanya tersedia saat penerbitan, bukan pada detail order atau audit.

## Graphify

[Graphify](https://github.com/Graphify-Labs/graphify) ditambahkan sebagai alat development untuk menelusuri hubungan file, fungsi, dan modul. Versi CLI dipatok ke `graphifyy[sql]==0.9.22` (nama paket menggunakan dua huruf `y`), termasuk parser SQL untuk migrasi database; tidak menjadi dependensi runtime aplikasi.

```bash
# Setup di komputer/checkout baru; memerlukan uv dan Python 3.10+.
npm run graphify:setup
# Alternatif tanpa uv: pipx install 'graphifyy[sql]==0.9.22'

npm run graphify:build
npm run graphify:query -- "revenue sharing payment"
npm run graphify:explain -- "locationAdminApiAllowed"
npm run graphify:update
```

Build dan update memakai ekstraksi AST lokal dengan `--code-only`, kemudian clustering dengan `--no-label`. Tidak memerlukan API key atau mengirim kode ke model eksternal. Penamaan komunitas memakai label bawaan; isi dokumen, gambar, dan blueprint Markdown belum dianalisis secara semantik. Update membangun ulang seluruh graph dengan `--force` agar file yang tidak berubah tetap tercakup; mode incremental `--no-cluster` pada versi ini dapat menulis hanya perubahan terakhir.

Hasil tersedia di `graphify-out/graph.html` (graph interaktif), `graphify-out/GRAPH_REPORT.md` (laporan), dan `graphify-out/graph.json` (data). Buka HTML melalui browser. Direktori hasil diabaikan Git dan dibuat ulang pada checkout baru. `.graphifyignore` mengecualikan environment, private key/export, dependensi, hasil build, screenshot, dan metadata migrasi; source aplikasi, SQL migrasi, serta tests tetap diindeks.

Skill Codex terpasang pada `.codex/skills/graphify/SKILL.md` dan dapat dipanggil dengan `$graphify`. `AGENTS.md` mengarahkan pencarian struktur kode melalui graph lebih dahulu; `.codex/hooks.json` berisi hook bawaan Graphify menggunakan executable dari PATH. Hook tidak menggantikan perintah build/update. Pastikan direktori executable uv/pipx masuk PATH (`uv tool update-shell` bila diperlukan). Hook Git belum dipasang; perintah build/update dan panduan AGENTS.md digunakan untuk memperbarui graph.

## Verifikasi

```bash
npm test                      # Perhitungan slot, timezone, jadwal dan validasi
npm run test:api               # Server harus aktif, akun seed dan DB lokal diperlukan
npm run test:admin             # Dashboard admin, pembatasan modul, CRUD dan isolasi lokasi
npm run test:deployment        # Sesudah build; memerlukan izin CREATE DATABASE lokal. DB sementara dibersihkan.
npm run test:revenue           # Formula, role, partial/prepayment, refund, snapshot dan konkurensi
npm run test:jobs              # Penawaran WhatsApp, token, privasi, expiry, konkurensi, workflow tanpa login
npx playwright install chromium
npm run test:ui                # Login, navigasi, responsivitas dan form end-to-end
npm run build
npm audit
```

Pengujian API/UI menggunakan data dengan identitas unik dan membersihkan hanya data yang dibuat oleh pengujian. Screenshot pemeriksaan tersedia di `artifacts/`. Playwright hanya dipakai untuk development.

## Production dan tahap berikutnya

Untuk Coolify, pilih Docker Compose Build Pack dengan [compose.coolify.yaml](compose.coolify.yaml), atau [docker-compose.yaml](docker-compose.yaml) yang berisi konfigurasi sama. Compose production hanya menjalankan app pada port internal `3088`; isi `DATABASE_URL` untuk PostgreSQL yang sudah tersedia. Development lokal tetap pada `http://localhost:3000`. [Panduan deployment](docs/deployment-coolify.md) memuat environment, jaringan database, domain, seed demo/bootstrap owner, backup, dan rate limit. Dockerfile memakai build bertahap dan menjalankan app sebagai non-root. Migration dan inisialisasi berjalan sebelum app menerima traffic. `compose.yaml` tetap khusus DB development.

Default booking publik: 5 request/IP/15 menit, 3 request/nomor WhatsApp/jam, dan 120 request total/menit. Request invalid ikut batas IP/global. Saat dibatasi, API mengembalikan 429 dengan Retry-After. Jalankan migration `0004_public_booking_limits.sql` sebelum versi ini; Docker entrypoint melakukannya otomatis. Angka dapat diubah melalui environment pada Compose. Limiter mengurangi spam; belum memverifikasi nomor WhatsApp dan tidak menggantikan WAF/CAPTCHA terhadap bot yang merotasi identitas.

```bash
npm run build
# Proses production tidak membaca .env otomatis; inject environment variables,
# atau gunakan node --env-file=.env .output/server/index.mjs pada deployment lokal.
node .output/server/index.mjs
```

Gunakan HTTPS, `APP_URL` sesuai domain, SESSION_SECRET acak, dan database khusus production. Secure cookie aktif pada production; `COOKIE_SECURE=false` dalam `.env` workspace ini hanya untuk localhost HTTP. Ganti konfigurasi tersebut ketika menggunakan HTTPS. Jangan menjalankan seed demo pada database operasional.

Favicon dan ikon PWA memakai logo daun yang sama dengan aplikasi. PWA diaktifkan pada build production melalui manifest dan service worker pada domain HTTPS (localhost dapat digunakan untuk pengujian). Chrome/Edge dapat memasang melalui menu Install app; Safari iPhone/iPad melalui Bagikan → Tambahkan ke Layar Utama. Browser menentukan ketersediaan menu pemasangan. Jalankan `npm run icons:generate` setelah mengubah `public/favicon.svg`, dan `npm run test:pwa` setelah build untuk memeriksa ikon, manifest, service worker dan batas cache.

Saat offline, navigasi menampilkan halaman bantuan dan panduan HTML tetap dapat dibuka setelah service worker berhasil diaktifkan saat online. Cache hanya berisi panduan, halaman bantuan dan ikon publik. Booking, API, halaman akun, order, pembayaran dan tautan job tidak disimpan di cache atau antrean offline. Jika koneksi putus saat menyimpan, periksa status order sebelum mengirim ulang. Tidak ada background GPS atau push notification. Untuk memperbarui file publik yang diprecache, naikkan versi `CACHE_NAME` di `public/sw.js`; worker baru aktif tanpa memuat ulang form secara paksa. Service worker tidak didaftarkan oleh dev server.

MVP, booking publik, dan penawaran job WhatsApp dengan konfirmasi tanpa login sudah tersedia. WhatsApp tetap dikirim manual melalui `wa.me`. WhatsApp Business API, gateway pembayaran, pelacakan GPS therapist, pencairan komisi otomatis, dan fitur lanjutan di bagian Future Features memerlukan konfigurasi/integrasi terpisah. Notifikasi admin tersedia di dalam aplikasi.

Referensi integrasi: [Nuxt 4 configuration](https://nuxt.com/docs/4.x/getting-started/configuration), [Tailwind CSS Vite](https://tailwindcss.com/docs/installation/using-vite), [Drizzle transactions](https://orm.drizzle.team/docs/transactions).

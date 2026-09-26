# Deploy Serene di Coolify

Gunakan **Application dari Git repository** dengan Build Pack **Docker Compose**. Repo harus berisi Dockerfile dan file Compose; metode Compose Empty tanpa checkout tidak dapat membangun `context: .`. Pastikan project sudah di-commit dan di-push ke repository yang dihubungkan ke Coolify, tanpa `.env`, artifacts, atau hasil build.

Compose production hanya menjalankan service **app**, menggunakan PostgreSQL yang sudah tersedia melalui `DATABASE_URL`. Tidak ada container atau volume database dalam stack ini. Siapkan database khusus Serene beserta user yang memiliki hak migration (membuat/mengubah tabel, indeks dan schema `drizzle`) sebelum deploy.

## Konfigurasi

1. Pilih project/environment di Coolify, tambah Application dari repository.
2. Base Directory: `/`; Docker Compose Location: `/compose.coolify.yaml` atau `/docker-compose.yaml` (konfigurasi sama).
3. Reload definition. Isi environment variables berikut di Coolify, sebagai runtime values:

| Variable | Nilai |
| --- | --- |
| `APP_URL` | Origin publik, misalnya `https://spa.example.com`, tanpa path, trailing slash, atau port container |
| `SESSION_SECRET` | Rahasia acak minimal 32 karakter; pertahankan antar deploy |
| `DATABASE_URL` | Wajib: connection URL PostgreSQL yang sudah tersedia, misalnya `postgresql://spa:encoded-password@database-host:5432/spa_management` |
| `SEED_DEMO` | `true` untuk demo baru; default `false` |
| `SEED_PASSWORD` | Wajib minimal 10 karakter bila `SEED_DEMO=true`; diberikan terpisah kepada pengguna demo |
| `BOOTSTRAP_OWNER_EMAIL` | Untuk database baru tanpa demo: email owner awal |
| `BOOTSTRAP_OWNER_PASSWORD` | Untuk database baru tanpa demo: password minimal 10 karakter |
| `BOOTSTRAP_OWNER_NAME` | Opsional, default `Owner` |
| `TRUST_PROXY_HOPS` | Default Compose `1` untuk satu proxy Coolify; sesuaikan rantai proxy sebenarnya |

Gunakan password berbeda untuk DB, owner dan akun demo. Rahasia tidak di-embed saat build. Salin connection URL dari resource/provider database. Jika menyusun URL sendiri, encode karakter khusus pada username/password (misalnya `@` menjadi `%40`, `:` menjadi `%3A`, dan `%` menjadi `%25`). Ikuti konfigurasi TLS/sertifikat dari provider bila diperlukan; parameter koneksi dapat disertakan dalam URL.

4. Jika memakai proxy domain Coolify, isi Domains service **app** dengan `https://spa.example.com:3000`. Suffix `:3000` menentukan port container yang dituju proxy; pengunjung tetap membuka `https://spa.example.com`. `APP_URL` tetap tanpa suffix. Port host `3088` digunakan untuk pemeriksaan dari server, sedangkan proxy menghubungi container pada `3000`. Jika memakai **Cloudflared Tunnel**, kolom Domains tidak diperlukan; ikuti konfigurasi tunnel di bawah. Pastikan jaringan database sesuai panduan di bawah. Gunakan deployment Compose normal; Raw Compose memerlukan pengelolaan label proxy sendiri.
5. Deploy setelah PostgreSQL tersedia dan dapat diakses dari container app. Container app memvalidasi konfigurasi, menjalankan migration, melakukan seed/bootstrap pada DB baru, kemudian memulai Nitro pada `0.0.0.0:3000` sebagai user non-root. Bila koneksi database gagal, startup gagal dan container mencoba kembali sesuai restart policy.
6. Verifikasi `/api/health` (HTTP 200), `/`, `/book`, `/dokumentasi.html`, dan login. Demo memiliki akun pada README/panduan; password adalah `SEED_PASSWORD` yang Anda tetapkan.

Migration dan inisialisasi memakai PostgreSQL advisory lock agar startup bersamaan tidak menimpa data. Deploy berikutnya tidak mengubah password atau menambahkan ulang data seed. `SEED_DEMO=true` pada DB yang sudah memiliki user tidak mengubahnya menjadi data demo. Untuk production baru, gunakan `SEED_DEMO=false` dan bootstrap owner; lengkapi lokasi, layanan dan therapist melalui UI.

## Koneksi ke PostgreSQL yang sudah ada

Compose menghubungkan service app ke network **default** milik stack dan network eksternal **coolify**, sesuai konfigurasi server ini. Network `coolify` harus sudah tersedia pada server deployment; Compose menggunakan network yang ada. Proxy dan PostgreSQL perlu berada pada network yang dapat menjangkau app. Jika PostgreSQL berada pada network yang sama, gunakan connection URL **internal** dari resource database. Untuk destination Coolify dengan nama network berbeda, sesuaikan deklarasi dan koneksi network pada kedua file Compose. Lihat [dokumentasi jaringan Coolify](https://coolify.io/docs/applications/builds/docker-compose).

Jika PostgreSQL berada di server/provider lain, gunakan hostname/IP yang dapat dijangkau dari container app, port sebenarnya, dan konfigurasi TLS yang diwajibkan provider. Izinkan koneksi dari server app pada firewall/aturan akses database. `localhost` atau `127.0.0.1` dalam `DATABASE_URL` merujuk container app sendiri, sehingga tidak dapat dipakai untuk database di container/server lain.

Contoh environment runtime di Coolify:

```dotenv
DATABASE_URL=postgresql://spa:encoded-password@database-host:5432/spa_management
APP_URL=https://spa.example.com
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters
SEED_DEMO=false
BOOTSTRAP_OWNER_EMAIL=owner@example.com
BOOTSTRAP_OWNER_PASSWORD=replace-with-a-unique-password
```

Host, nama database dan kredensial pada contoh harus diganti sesuai PostgreSQL Anda. Compose tidak membuat database tersebut; migration hanya membuat/memperbarui struktur tabel di database yang dituju. `/api/health` memeriksa koneksi database sebelum mengembalikan HTTP 200.

## Rate limit booking

Counter tersimpan di PostgreSQL, atomik untuk request bersamaan, dibagi antar instance, dan tidak reset saat app direstart. Counter kedaluwarsa dibersihkan berkala. Request berlebih mendapat **429** serta header **Retry-After**; database yang bermasalah tidak membuat limiter dilewati.

| Variable | Default |
| --- | --- |
| `BOOKING_RATE_LIMIT_IP_MAX` | `5` |
| `BOOKING_RATE_LIMIT_IP_WINDOW_SECONDS` | `900` |
| `BOOKING_RATE_LIMIT_PHONE_MAX` | `3` |
| `BOOKING_RATE_LIMIT_PHONE_WINDOW_SECONDS` | `3600` |
| `BOOKING_RATE_LIMIT_GLOBAL_MAX` | `120` |
| `BOOKING_RATE_LIMIT_GLOBAL_WINDOW_SECONDS` | `60` |

Nilai harus integer 1–86400. Batas IP/global dihitung sebelum parsing payload, termasuk request invalid. Batas telepon berlaku setelah validasi; format `08…` dan `+628…` memakai bucket yang sama. Pembatasan telepon ini tidak mengubah identitas customer lama di database.

`TRUST_PROXY_HOPS=0` mengabaikan X-Forwarded-For (default development). Nilai `1` mengambil alamat paling kanan pada header yang ditambahkan satu proxy terpercaya. Rantai CDN + proxy mungkin membutuhkan nilai lain; periksa konfigurasi nyata. Saat forwarded headers dipercaya, batasi akses langsung port host `3088` ke jaringan tepercaya agar trafik publik tetap melalui proxy/tunnel. Batas IP dapat memengaruhi customer dalam Wi-Fi/NAT yang sama. Bot yang mengganti IP dan nomor masih dapat membuat permintaan sampai batas global; gunakan WAF/CAPTCHA bila volume serangan memerlukannya. Rate limit bukan verifikasi kepemilikan WhatsApp.

## Data, backup, dan operasi

Penyimpanan data dikelola oleh PostgreSQL yang sudah ada. Redeploy app tidak membuat atau menghapus volume database. Saat merotasi kredensial, perbarui PostgreSQL dan `DATABASE_URL` app secara terkoordinasi.

Siapkan backup database terjadwal melalui resource Coolify/provider atau `pg_dump`, dan uji restore sebelum perubahan besar. Rollback image tidak membatalkan migration SQL; pulihkan backup bila diperlukan rollback schema/data.

Console service app dapat menjalankan `node scripts/migrate.js`. CLI `npm run db:migrate` lokal membaca `.env`, tetapi image tidak membawa file `.env`. Cookie production selalu secure dan membutuhkan domain HTTPS. Tile Maps tetap memakai OpenStreetMap secara default; provider dapat diubah dengan `NUXT_PUBLIC_MAP_TILE_URL` dan `NUXT_PUBLIC_MAP_ATTRIBUTION` sebagai environment runtime tambahan.

## Validasi lokal

PWA tersedia pada build production dan membutuhkan domain HTTPS. Manifest, favicon daun, ikon perangkat dan `/sw.js` sudah ikut di dalam image; tidak perlu service tambahan. Pastikan proxy dapat melayani `/sw.js` dengan MIME JavaScript dan tidak menimpa header `Cache-Control: no-cache`. Chrome/Edge menyediakan pemasangan melalui menu browser; Safari iOS melalui Bagikan → Tambahkan ke Layar Utama. Pemasangan tidak mengaktifkan GPS latar belakang atau push notification.

Service worker hanya menyimpan ikon, halaman offline dan panduan publik. Transaksi dan data akun tetap online. Ubah versi cache dalam `public/sw.js` jika mengubah file yang diprecache. Verifikasi dengan `npm run build` lalu `npm run test:pwa` di lingkungan lokal dengan database development; pengujian tidak menulis data booking.

```bash
# compose.yaml tetap hanya DB untuk development. Deployment memakai file terpisah.
docker compose -f compose.coolify.yaml --env-file .env.coolify config --quiet
docker compose -f compose.coolify.yaml --env-file .env.coolify build
docker compose -f compose.coolify.yaml --env-file .env.coolify up -d
```

Compose mempublikasikan port host `3088` pada semua interface ke port `3000` di container (`3088:3000`), sehingga app dapat diperiksa melalui `http://IP-LAN-server:3088`. Untuk jalur proxy/tunnel dengan forwarded headers terpercaya, batasi akses langsung port host pada firewall ke jaringan tepercaya. Pengunjung menggunakan domain HTTPS publik untuk login dengan secure cookie. File `.env.coolify` harus disimpan lokal/rahasia, tidak di-commit. Pastikan `DATABASE_URL` mengarah ke database yang sesuai lingkungan deployment.

## Jika domain menampilkan 502

Setelah mengubah `ports`, muat ulang konfigurasi Compose dan redeploy agar container dibuat ulang. Restart container lama saja tidak menambahkan port mapping. Pada server, `docker ps --format "table {{.Names}}\t{{.Ports}}"` harus menampilkan published port `0.0.0.0:3088->3000/tcp` untuk app; tampilan `3000/tcp` saja berarti port belum dipublikasikan. Jika mapping belum muncul, periksa file Compose/commit yang dipakai Coolify.

Status container running belum memastikan aplikasi sudah siap. Pada server deployment, jalankan `curl -i http://127.0.0.1:3088/api/health` setelah redeploy. HTTP 200 memastikan aplikasi dapat dijangkau melalui mapping host dan dapat mengakses database. Jika koneksi ditolak, lihat log startup; bila masih ada error bootstrap, isi kredensial owner atau `SEED_DEMO=true` beserta `SEED_PASSWORD`, kemudian redeploy. Jika health mengembalikan 503, periksa koneksi database.

Jika health HTTP 200 tetapi domain tetap 502, periksa Domains service app (`https://domain-anda:3000`), port tujuan pada label proxy yang dihasilkan Coolify (`3000`), serta koneksi network proxy ke app. Domain menargetkan port container, bukan host `3088`. Muat ulang konfigurasi dan redeploy setelah perubahan. Log startup yang berhasil menampilkan `Listening on ...:3000`; aplikasi mengikat `0.0.0.0` agar proxy dapat mengaksesnya.

## Cloudflared Tunnel

Isi `APP_URL` dengan origin HTTPS publik tunnel, misalnya `https://spa.example.com`. Aplikasi menerima HTTP pada origin internal; browser tetap menggunakan HTTPS melalui Cloudflare. Kolom Domains Coolify boleh kosong untuk jalur ini.

Jika cloudflared berjalan sebagai container, hubungkan container cloudflared ke network `coolify` yang sama. Pada route Public Hostname, pilih **HTTP** dan isi Service URL **`http://serene-book:3000`**. Compose menyediakan alias network `serene-book` agar tunnel tidak bergantung pada nama container yang dihasilkan Coolify atau alias `app` milik aplikasi lain. `localhost` dalam container cloudflared menunjuk container cloudflared sendiri, sehingga tidak menunjuk app.

Jika cloudflared berjalan langsung di server yang sama (atau memakai host networking), Service URL adalah **`http://127.0.0.1:3088`**, sesuai mapping host ke container. Jika cloudflared berjalan di container bridge atau di server lain dan memakai port host, gunakan **`http://IP-server:3088`** yang dapat dijangkau cloudflared. Jangan gunakan `localhost` pada container bridge untuk menunjuk host. Pada network Docker yang sama, gunakan alias `http://serene-book:3000`.

Jika app sudah healthy tetapi tunnel masih 502, periksa URL Service, protocol HTTP, koneksi network dan log cloudflared (`connection refused`, kegagalan DNS atau timeout). Health app hanya membuktikan origin berfungsi dari dalam container, belum membuktikan cloudflared dapat menjangkaunya. Lihat [troubleshooting Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/troubleshooting/).

Referensi: [Docker Compose di Coolify](https://coolify.io/docs/applications/builds/docker-compose), [Docker multi-stage build](https://docs.docker.com/build/building/multi-stage/), [trusted forwarded IP di H3](https://v1.h3.dev/utils/request).

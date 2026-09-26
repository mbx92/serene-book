# Deploy Serene di Coolify

Gunakan **Application dari Git repository** dengan Build Pack **Docker Compose**. Repo harus berisi Dockerfile dan file Compose; metode Compose Empty tanpa checkout tidak dapat membangun `context: .`. Pastikan project sudah di-commit dan di-push ke repository yang dihubungkan ke Coolify, tanpa `.env`, artifacts, atau hasil build.

## Konfigurasi

1. Pilih project/environment di Coolify, tambah Application dari repository.
2. Base Directory: `/`; Docker Compose Location: `/compose.coolify.yaml`.
3. Reload definition. Isi environment variables berikut di Coolify, sebagai runtime values:

| Variable | Nilai |
| --- | --- |
| `APP_URL` | Origin publik, misalnya `https://spa.example.com`, tanpa path, trailing slash, atau port container |
| `SESSION_SECRET` | Rahasia acak minimal 32 karakter; pertahankan antar deploy |
| `POSTGRES_PASSWORD` | Password database acak; pertahankan selama volume lama digunakan |
| `POSTGRES_USER` / `POSTGRES_DB` | Opsional, default `spa` / `spa_management` |
| `SEED_DEMO` | `true` untuk demo baru; default `false` |
| `SEED_PASSWORD` | Wajib minimal 10 karakter bila `SEED_DEMO=true`; diberikan terpisah kepada pengguna demo |
| `BOOTSTRAP_OWNER_EMAIL` | Untuk database baru tanpa demo: email owner awal |
| `BOOTSTRAP_OWNER_PASSWORD` | Untuk database baru tanpa demo: password minimal 10 karakter |
| `BOOTSTRAP_OWNER_NAME` | Opsional, default `Owner` |
| `TRUST_PROXY_HOPS` | Default Compose `1` untuk satu proxy Coolify; sesuaikan rantai proxy sebenarnya |

Gunakan password berbeda untuk DB, owner dan akun demo. Rahasia tidak di-embed saat build. Kredensial database diberikan sebagai variabel terpisah agar karakter khusus pada password dapat di-encode dengan benar; aplikasi membentuk connection URL sendiri.

4. Pada service **app**, isi Domains dengan `https://spa.example.com:3000`. Suffix `:3000` menentukan port internal untuk proxy; pengunjung tetap membuka `https://spa.example.com`. Domain ini harus sesuai `APP_URL` tanpa suffix. Jangan memberi domain/port publik pada postgres.
5. Deploy. Postgres harus healthy dahulu. Container app memvalidasi konfigurasi, menjalankan migration, melakukan seed/bootstrap pada DB baru, kemudian memulai Nitro pada `0.0.0.0:3000` sebagai user non-root.
6. Verifikasi `/api/health` (HTTP 200), `/`, `/book`, `/dokumentasi.html`, dan login. Demo memiliki akun pada README/panduan; password adalah `SEED_PASSWORD` yang Anda tetapkan.

Migration dan inisialisasi memakai PostgreSQL advisory lock agar startup bersamaan tidak menimpa data. Deploy berikutnya tidak mengubah password atau menambahkan ulang data seed. `SEED_DEMO=true` pada DB yang sudah memiliki user tidak mengubahnya menjadi data demo. Untuk production baru, gunakan `SEED_DEMO=false` dan bootstrap owner; lengkapi lokasi, layanan dan therapist melalui UI.

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

`TRUST_PROXY_HOPS=0` mengabaikan X-Forwarded-For (default development). Nilai `1` mengambil alamat paling kanan pada header yang ditambahkan satu proxy terpercaya. Rantai CDN + proxy mungkin membutuhkan nilai lain; periksa konfigurasi nyata. Jangan mempublikasikan port app langsung ketika forwarded headers dipercaya. Batas IP dapat memengaruhi customer dalam Wi-Fi/NAT yang sama. Bot yang mengganti IP dan nomor masih dapat membuat permintaan sampai batas global; gunakan WAF/CAPTCHA bila volume serangan memerlukannya. Rate limit bukan verifikasi kepemilikan WhatsApp.

## Data, backup, dan operasi

Volume `spa_postgres_production` menyimpan data PostgreSQL. Tidak ada binding source dari host dan tidak ada port database yang dipublikasikan. Jangan menghapus volume untuk redeploy. Perubahan `POSTGRES_PASSWORD` tidak otomatis mengubah password user dalam database lama; rotasi melalui PostgreSQL dan perbarui environment app secara terkoordinasi.

Siapkan backup database terjadwal (misalnya `pg_dump` melalui akses internal) dan uji restore sebelum perubahan besar. Database yang berada di stack Compose ini perlu prosedur backup sendiri; bukan resource database terpisah yang otomatis dikelola menu backup Coolify. Rollback image tidak membatalkan migration SQL; pulihkan backup bila diperlukan rollback schema/data.

Console service app dapat menjalankan `node scripts/migrate.js`. CLI `npm run db:migrate` lokal membaca `.env`, tetapi image tidak membawa file `.env`. Cookie production selalu secure dan membutuhkan domain HTTPS. Tile Maps tetap memakai OpenStreetMap secara default; provider dapat diubah dengan `NUXT_PUBLIC_MAP_TILE_URL` dan `NUXT_PUBLIC_MAP_ATTRIBUTION` sebagai environment runtime tambahan.

## Validasi lokal

```bash
# compose.yaml tetap hanya DB untuk development. Deployment memakai file terpisah.
docker compose -f compose.coolify.yaml --env-file .env.coolify config --quiet
docker compose -f compose.coolify.yaml --env-file .env.coolify build
docker compose -f compose.coolify.yaml --env-file .env.coolify up -d
```

Compose production sengaja tidak mempublikasikan host port; akses app melalui proxy Coolify. File `.env.coolify` harus disimpan lokal/rahasia, tidak di-commit. Jangan menjalankan stack production di atas volume development.

Referensi: [Docker Compose di Coolify](https://coolify.io/docs/applications/builds/docker-compose), [Docker multi-stage build](https://docs.docker.com/build/building/multi-stage/), [trusted forwarded IP di H3](https://v1.h3.dev/utils/request).

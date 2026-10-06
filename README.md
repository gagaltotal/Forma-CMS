# Forma CMS - Gagaltotal666

CMS headless **open-source, developer-first** berbasis **Node.js + TypeScript**.
Modelkan konten Anda secara visual (artikel, produk, apa saja), dapatkan **REST + GraphQL API** otomatis,
dan sajikan ke frontend apa pun (React, Next.js, Vue, mobile, dsb.). Bisa di-host sendiri di mana saja.

- **Panel admin** rapi & dapat disesuaikan (tema terang/gelap, warna aksen, kepadatan, sidebar ciut)
- **Content-type builder visual** dengan *pratinjau API langsung* (endpoint, contoh JSON, query GraphQL)
- **13 tipe field**: teks, teks panjang, rich text, integer, desimal, boolean, tanggal, email, slug, pilihan (enum), JSON, media, relasi
- **Pustaka media** bawaan (drag & drop, teks alternatif, URL publik)
- **RBAC**: role dengan matriks izin per tipe konten (lihat / lihat draft / buat / ubah / hapus / publish) + izin sistem
- **Draft & publish**, **API token** untuk frontend, **audit log anti-manipulasi**
- **SSO (OIDC)**: satu klik login dengan Google/Azure AD/Keycloak/Okta — **tersedia untuk semua role**, tanpa auto-provision
- **Landing page premium siap pakai** dengan Tailwind CSS yang di-build **secara lokal** (tanpa CDN, patuh CSP)
- **Database-agnostic**: **SQLite, PostgreSQL, MySQL/MariaDB** (satu ganti `DB_CLIENT`)
- **Keamanan berlapis** (lihat [SECURITY.md](SECURITY.md)) dan **97 tes otomatis** yang lolos di ketiga database

## Mulai cepat (lokal)

Butuh Node.js ≥ 20.11.

```bash
npm install
cp .env.example .env
# isi APP_SECRET:  openssl rand -hex 32
# untuk lokal tanpa HTTPS set: NODE_ENV=development dan PUBLIC_URL=http://127.0.0.1:3000

npm run cli:dev -- create-admin --email anda@contoh.com   # tanpa akun default; password diminta tersembunyi
npm run dev                                               # lalu buka http://127.0.0.1:3000/ (landing page publik) dan http://127.0.0.1:3000/admin/ (login panel)
npm run seed:homepage                                     # buat template homepage premium siap pakai di CMS
```

Halaman depan `/` **langsung tampil sebagai landing page premium** saat pertama kali boot (tipe konten `home` + satu entri
publik di-seed otomatis bila database masih kosong). Tidak perlu menulis JSON manual. Jalankan
`npm run seed:homepage -- --force` untuk menimpa dengan template terbaru (mis. setelah upgrade).

Produksi: `npm run build && npm start` (atau Docker di bawah).

## Docker

```bash
cp .env.example .env     # isi APP_SECRET, POSTGRES_PASSWORD, PUBLIC_URL (https)
docker compose up -d
docker compose run --rm -it forma node dist/cli.js create-admin --email anda@contoh.com
```
Port hanya dibuka ke `127.0.0.1`; taruh reverse proxy HTTPS (Caddy/Nginx/Traefik) di depannya.
Container berjalan non-root, filesystem read-only, tanpa capability.

## Cara memakai

1. Buka `/` untuk melihat landing page publik dinamis. `/admin/` tetap hanya untuk login panel admin.
2. Masuk ke `/admin/` → **Content types** → *New content type* → tambah field → simpan.
3. Isi konten di menu **Content**. Entri baru berstatus *draft*; *Publish* membuatnya terlihat publik.
4. **Roles** → role **Public** → centang *View published* untuk tipe yang ingin dibuka tanpa login,
   atau buat **API token** (menu *API tokens*) untuk frontend Anda.

### Landing page publik dinamis

Halaman depan `/` secara otomatis mencoba membaca satu tipe konten dari backend yang memiliki field seperti `header`, `subtitle`, `body`, `footer`, `features`, `testimonials`, `stats`, serta tombol CTA, `steps`, `logos`, `plans`, dan `faq`. Jika konten ditemukan, halaman depan menampilkan hero, CTA, fitur, cara kerja, logo, harga, testimonial, FAQ, dan footer yang diambil dari backend dengan desain premium dan responsif. Jika belum ada data, sistem memakai template default yang sudah dibuat agar tampilan tetap elegan.

Struktur halaman yang didukung (semua opsional, ada fallback bawaan):

| Field | Tipe | Isi |
|---|---|---|
| `eyebrow`, `header`, `subtitle`, `body` | text / richtext | Hero |
| `cta_primary`, `cta_secondary` | json | `{ "label": "...", "href": "..." }` |
| `stats` | json | `[{ "label": "...", "value": "..." }]` |
| `features` | json | `[{ "title": "...", "description": "..." }]` |
| `steps` | json | `[{ "title": "...", "description": "..." }]` |
| `logos` | json | `["Brand A", "Brand B"]` |
| `plans` | json | `[{ "name", "price", "period", "description", "features": [...], "ctaLabel", "ctaHref", "highlighted" }]` |
| `faq` | json | `[{ "question": "...", "answer": "..." }]` |
| `testimonials` | json | `[{ "quote": "...", "name": "...", "role": "..." }]` |
| `footer` | text | Kaki halaman |

> Tujuan perubahan ini sangat terikat: hanya route publik di `/` yang berubah. `/admin` dan `/admin/` tetap menjadi login panel admin, sementara fitur lain tidak diubah.

### Tailwind CSS lokal (tanpa CDN)

Desain landing page memakai **Tailwind CSS yang di-compile lokal**, bukan CDN — karena Content-Security-Policy Forma hanya mengizinkan `script-src 'self'`. Pipeline:

- Konfigurasi: [`tailwind.config.mjs`](tailwind.config.mjs) (font Inter, palet brand, `@tailwindcss/typography`).
- Sumber CSS: [`admin/landing.css`](admin/landing.css) (direktif `@tailwind` + utilitas kustom).
- Build: `npm run build:admin` menjalankan esbuild untuk panel admin **dan** `tailwindcss -i admin/landing.css -o dist/admin/landing.css --minify`.
- Hasil: `dist/admin/landing.css` disajikan di `/admin/landing.css` dan direferensikan oleh landing page via `<link rel="stylesheet">`.

`npm run dev` menjalankan langkah build ini otomatis sebelum server start, jadi cukup satu perintah.

### Seed homepage siap pakai

Untuk pengalaman siap pakai tanpa menulis JSON manual:

```bash
npm run seed:homepage              # buat bila belum ada (aman dijalankan berulang)
npm run seed:homepage -- --force   # timpa entry `home` dengan template terbaru
```

Perintah ini memakai `ctx.services.seed.ensureHomepage()` — sama seperti seed otomatis saat boot (`SEED_HOMEPAGE_ON_BOOT=true`).
Template lengkapnya juga tersedia di [`docs/homepage-template.json`](docs/homepage-template.json) sebagai referensi bentuk field & data.

### SSO (OIDC / OAuth2)

Login tunggal yang **provider-agnostic** (Google, Azure AD/Entra, Keycloak, Okta, Auth0, dsb.) memakai *Authorization Code + PKCE*.

- **Tersedia untuk SEMUA role.** Siapa pun yang sudah punya akun di CMS bisa masuk lewat tombol SSO di halaman login; menu tampil sesuai role-nya.
- **Tanpa auto-provision.** Pengguna harus **sudah terdaftar** lebih dulu (via CLI `create-admin` atau menu **Users**). Email yang tidak dikenal akan ditolak dan dicatat di audit log (`auth.sso_rejected`).
- **Tidak ada rahasia di browser.** Client secret hanya di server; endpoint publik `/api/auth/sso/info` hanya mengembalikan `{ enabled, providerName, startUrl }`.

Aktifkan dengan mengisi env (lihat [.env.example](.env.example)):

```dotenv
SSO_ENABLED=true
SSO_PROVIDER_NAME=Google                 # label tombol di halaman login
SSO_ISSUER=https://accounts.google.com   # issuer OIDC (discovery otomatis)
SSO_CLIENT_ID=xxxx.apps.googleusercontent.com
SSO_CLIENT_SECRET=xxxx
# SSO_REDIRECT_URI=https://cms.example.com/api/auth/sso/callback   # default: <PUBLIC_URL>/api/auth/sso/callback
SSO_SCOPES=openid email profile
SSO_STATE_TTL_MINUTES=10
```

Langkah setup:

1. Di penyedia identitas, buat **OAuth Client (Web)** dan daftarkan Redirect URI: `<PUBLIC_URL>/api/auth/sso/callback`.
2. Isi env di atas (di Docker: lewat `env_file: .env`). Pastikan `PUBLIC_URL` sudah benar — dipakai untuk membangun redirect URI.
3. Buat akun pengguna di Forma CMS dengan email yang **sama** dengan klaim email penyedia.
4. Buka `/admin/` → tombol **Continue with {provider name}** akan tampil. SSO hanya muncul bila konfigurasi lengkap.

Keamanan: state sekali pakai disimpan di tabel `forma_sso_states` (+ PKCE `code_verifier`, `nonce`, serta anti-SSRF allowlist untuk discovery), ID token diverifikasi RS256 (signature, `iss`, `aud`, `exp`, `nonce`), email wajib `email_verified`, dan semua percobaan login dicatat di audit log. Lihat [SECURITY.md](SECURITY.md).

### Docker / deployment compatibility

Dockerfile sudah kompatibel: stage `build` menjalankan `npm ci` (devDependencies terpasang) lalu `npm run build` — termasuk kompilasi Tailwind untuk landing page — **sebelum** `npm prune --omit=dev`. Folder `docs/` ikut disalin ke image agar template `homepage` tetap tersedia di container. Halaman publik dirender server-side, dan script seeding berada di `scripts/`. Tidak ada perubahan route admin, jadi `/admin` tetap berfungsi sebagai panel login seperti semula.

### REST

```
GET    /api/content/:type                 daftar (page, pageSize≤100, sort, q, filter, populate)
GET    /api/content/:type/:id
POST   /api/content/:type                 body: {"data": {...}, "status": "draft|published"}
PATCH  /api/content/:type/:id             body: {"data": {...parsial}, "status": "..."}
DELETE /api/content/:type/:id
GET    /media/file/:id                    file media publik
```

```bash
# daftar artikel terbit, urut terbaru, dengan relasi & cover
curl -H "Authorization: Bearer $TOKEN" \
  "https://cms.contoh.com/api/content/article?sort=publishedAt:desc&pageSize=10&populate=author,cover"

# filter: filter[field][op]=nilai   op: eq ne gt gte lt lte contains startsWith in null
curl "https://cms.contoh.com/api/content/article?filter[slug][eq]=halo-dunia&filter[views][gte]=100"
```

Next.js (server component):

```ts
const qs = new URLSearchParams({ 'filter[slug][eq]': slug, populate: 'cover,author' });
const res = await fetch(`${process.env.CMS_URL}/api/content/article?${qs}`, {
  headers: { Authorization: `Bearer ${process.env.CMS_TOKEN}` }, next: { revalidate: 60 },
});
const { data } = await res.json();
```

### GraphQL — `POST /graphql`

Skema dibangun otomatis dari tipe konten (tipe `Article`, query `article(id)` dan `articles(...)`, mutasi `createArticle`, dst.).

```graphql
{
  articles(page: 1, pageSize: 10, sort: "createdAt:desc", filter: [{ field: "views", op: gte, value: "100" }]) {
    total
    items { id title slug cover { url alt } author { name } }
  }
}
```
Operator `null` di GraphQL bernama `isNull`. Introspeksi nonaktif secara default (`GRAPHQL_INTROSPECTION=true` untuk dev).
Mutasi menerima `data: JSON!` yang divalidasi dengan aturan yang sama seperti REST.

> **Penting:** jangan menaruh token yang bisa menulis di kode browser. Untuk frontend publik, gunakan role **Public**
> (baca saja) atau token read-only, dan panggil API tulis dari server Anda.

## Konfigurasi

Semua lewat environment variable (lihat [.env.example](.env.example) untuk daftar lengkap).

| Variabel | Fungsi |
|---|---|
| `APP_SECRET` | rahasia ≥32 karakter untuk rantai HMAC audit log (**wajib**) |
| `PUBLIC_URL` | URL publik admin; **harus https** di production (cookie Secure, cek Origin) |
| `DB_CLIENT` / `DATABASE_URL` / `SQLITE_PATH` | `sqlite` \| `postgres` \| `mysql` |
| `TRUST_PROXY` | `true` hanya jika di belakang reverse proxy tepercaya |
| `CORS_ORIGINS` | origin frontend yang boleh memanggil API (default: tidak ada) |
| `RATE_LIMIT_PER_MINUTE`, `LOGIN_MAX_PER_15MIN`, `RATE_LIMIT_ALLOWLIST` | batas laju; allowlist untuk IP server SSR (login tetap dibatasi) |
| `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` | masa berlaku sesi |
| `SSO_ENABLED`, `SSO_PROVIDER_NAME`, `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET` | login SSO/OIDC untuk semua role (tanpa auto-provision) |
| `SSO_REDIRECT_URI`, `SSO_SCOPES`, `SSO_STATE_TTL_MINUTES` | penyetelan SSO lanjutan (default: `<PUBLIC_URL>/api/auth/sso/callback`) |
| `SEED_HOMEPAGE_ON_BOOT` | seed otomatis tipe `home` + landing page saat boot pertama |
| `MAX_UPLOAD_MB`, `UPLOAD_DIR` | media |

## CLI

```bash
node dist/cli.js create-admin --email <e> [--name <n>]   # password diminta tersembunyi, atau env FORMA_ADMIN_PASSWORD
node dist/cli.js reset-password --email <e>              # juga membuka kunci akun & mencabut semua sesi
node dist/cli.js verify-audit                            # cek keutuhan rantai audit (exit code 2 jika rusak)
```

## Tes

```bash
npm test                                                       # SQLite
TEST_DB=postgres TEST_ADMIN_URL=postgres://u:p@127.0.0.1:5432/postgres npm test
TEST_DB=mysql    TEST_ADMIN_URL=mysql://u:p@127.0.0.1:3306/mysql      npm test
npm run test:visual                                             # Chromium desktop/mobile screenshots
```
Suite memuat tes arsitektur (aturan lapisan), tes keamanan end-to-end (SQLi, XSS, path traversal/LFI, CSRF, brute force, sesi, privilege escalation, mass-assignment, upload berbahaya, GraphQL abuse, audit tamper),
tes SSO/OIDC (PKCE + state sekali pakai, verifikasi ID token, penolakan akun belum terdaftar), tes landing page & seed homepage (tipe `home` + entri publik), dan tes UI yang menjalankan bundel panel admin asli di jsdom. Setiap `makeApp()` memakai database baru.
`npm run test:visual` menjalankan panel di Chromium sungguhan, memeriksa layout desktop/mobile, lalu menyimpan screenshot ke `test-results/visual/`. Install browser sekali dengan `npx playwright install chromium`, atau set `CHROME_BIN` ke browser Chromium yang sudah terpasang.

## Arsitektur

Arsitektur **berlapis** — `routes → middleware → controllers → services → models → database` — dengan validator zod,
migrasi bernomor, dan *dependency injection* manual. Aturan dependensinya **diuji otomatis** (`tests/architecture.test.ts`).
Penjelasan lengkap, alur request, peta resource, dan panduan menambah resource baru: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
src/
├── server.ts · app.ts · cli.ts       entry, composition root, CLI
├── config/            env (zod) + constants.ts (batas & angka keamanan)
├── core/container.ts  DI: db → models → services
├── database/          connection · migrate · migrations/001...007
├── models/            akses data per tabel + query-builder dinamis (satu-satunya tempat SQL)
├── validators/        skema zod (body/query/params, aturan field dinamis)
├── services/          logika bisnis: auth, session, user, role, token, schema, content, media, audit, graphql, sso, seed
├── middleware/        authenticate · csrf · authorize · rate-limit · security-headers · error-handler
├── controllers/       adaptor HTTP tipis
├── routes/            URL → middleware → controller (satu file per resource)
├── graphql/           pembangun skema dinamis + penjaga kompleksitas
├── security/          scrypt · token · sanitasi · izin (RBAC) · deteksi upload · verifikasi OIDC
└── types/ · utils/
admin/src/             main · app/ · core/ · components/ · pages/   (TypeScript tanpa framework, tanpa innerHTML)
admin/landing.css      sumber Tailwind untuk landing page (di-build ke dist/admin/landing.css)
tailwind.config.mjs    konfigurasi Tailwind (font Inter, palet brand, typography)
tests/                 auth · content (keamanan) · sso (OIDC) · landing (seed) · ui (jsdom) · architecture
scripts/visual-check.ts screenshot UI desktop/mobile di Chromium
```

## Fitur Baru

### SSO (OIDC / OAuth2)
Login tunggal ke panel admin memakai penyedia identitas apa pun yang mendukung OIDC (Google, Azure AD/Entra, Keycloak, Okta, Auth0, ...):
- Tombol **Continue with {provider}** tampil otomatis di halaman login bila SSO aktif — **untuk semua role**.
- **Wajib terdaftar dulu:** SSO tidak membuat akun otomatis; email tak dikenal ditolak (audit `auth.sso_rejected`).
- Endpoint: `GET /api/auth/sso/info` (publik), `GET /api/auth/sso/start`, `GET /api/auth/sso/callback`.
- UI elegan dengan Tailwind lokal + pemisah "or continue with email"; pesan error tampil rapi di kartu login.
- Keamanan: Authorization Code + PKCE (S256), state sekali pakai, verifikasi RS256 (`iss`/`aud`/`exp`/`nonce`), `email_verified` wajib.
Pengaturan lengkap ada di bagian **SSO (OIDC / OAuth2)** di atas dan di [.env.example](.env.example).

### 2FA/TOTP
Autentikasi dua faktor dengan Time-based One-Time Password (TOTP) menggunakan algoritma built-in Node.js:
- Setup & enable 2FA: `POST /api/totp/setup`, `POST /api/totp/enable`
- Backup codes untuk recovery
- Regenerate backup codes: `POST /api/totp/regenerate-backup-codes`
- Disable 2FA: `POST /api/totp/disable`
- Status 2FA: `GET /api/totp/status`

### Reset Password via Email
Reset password melalui link email (development: log ke console):
- Request reset: `POST /api/password-reset/request` dengan `{ "email": "user@example.com" }`
- Reset dengan token: `POST /api/password-reset/reset` dengan `{ "token": "...", "newPassword": "..." }`
- Token berlaku 1 jam
- Untuk production: ganti `ConsoleEmailService` dengan implementasi SMTP (nodemailer, dll)

### Content Versioning
Versioning otomatis untuk semua perubahan konten:
- Snapshot dibuat otomatis saat create/update entry
- List versions: `GET /api/content/:type/:id/versions`
- Get specific version: `GET /api/content/:type/:id/versions/:version`
- Get version data untuk restore: `GET /api/content/:type/:id/versions/:version/data`
- Restore: ambil data dari endpoint di atas, lalu `PATCH /api/content/:type/:id` dengan data tersebut
- Versions dihapus otomatis saat entry dihapus

### Perubahan field dan unique
- Tipe field yang sudah ada dapat diubah melalui content-type builder. Nilai lama dikonversi oleh database dalam transaksi; jika konversi gagal, perubahan skema dibatalkan.
- Properti `unique` tersedia untuk text, email, slug, enum, datetime, number, boolean, media, dan relation. Long text, rich text, dan JSON tidak dapat diindeks unique.
- Slug selalu unique. Jika nilai yang sudah ada bentrok saat unique diaktifkan, penyimpanan skema ditolak.

Panel admin menampilkan footer copyright dengan nama aplikasi dari `application-name` dan tahun berjalan.

Lisensi: MIT Gagaltotal666.
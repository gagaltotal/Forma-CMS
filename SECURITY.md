# Keamanan Forma CMS - Gagaltotal666

Tidak ada perangkat lunak yang dapat dijamin "tanpa celah". Forma dirancang dengan prinsip *secure by default*,
*defense in depth*, dan *deny by default*, lalu setiap kontrol diverifikasi dengan tes otomatis.
**Lakukan penetration test independen sebelum dipakai untuk data sensitif.**

## Pelaporan kerentanan
Laporkan secara privat (jangan membuat issue publik) ke pengelola proyek dengan langkah reproduksi, versi, dan dampak.
Kami menargetkan balasan awal ≤ 72 jam.

## Model ancaman & kontrol

| Ancaman | Kontrol | Diverifikasi oleh tes |
|---|---|---|
| **SQL injection** | Semua query lewat query-builder Knex dengan parameter binding. Nama tabel/kolom **hanya** dari skema yang divalidasi regex ketat + whitelist (tidak pernah dari input mentah). `LIKE` di-escape (`!`,`%`,`_`). Operator/sort/populate di-whitelist per tipe field. Satu-satunya SQL mentah: `lower(??) like ? escape '!'` dengan binding. **Hanya `models/` yang boleh menyentuh Knex/SQL** (ditegakkan `architecture.test.ts`). | `SQL injection` (nilai, kolom, operator, sort, id, apiId), `Content-type builder` (identifier berbahaya), `Arsitektur berlapis` (tidak ada SQL di luar models) |
| **LFI / path traversal** | File upload disimpan dengan nama acak buatan server (`uuid.ext`, ekstensi dari isi file). Penyajian lewat ID di database, bukan path dari user; path diverifikasi `STORED_RE` + `dirname === root`. Panel admin dilayani `@fastify/static` dengan `dotfiles: deny`. | `Media: upload aman, LFI & path traversal`, `Panel admin (statis)` |
| **RCE** | Tidak ada `eval`/`Function`/`child_process`/`require` dinamis, tidak ada template engine, tidak ada pustaka parser gambar. Tipe file ditentukan dari magic bytes; hanya PNG/JPEG/GIF/WebP/PDF (SVG/HTML/skrip ditolak). Upload dilayani dengan `Content-Type` tetap + `nosniff` + `CSP: sandbox`; PDF sebagai `attachment`. Prototype-pollution ditolak (`secure-json-parse`, validasi JSON kunci terlarang). | `file berbahaya ditolak berdasarkan ISI`, `JSON rusak / prototype poisoning` |
| **XSS** | Panel admin: **nol `innerHTML`**, semua teks via `createTextNode`; CSP ketat tanpa inline script (`script-src 'self'`). Rich text disanitasi server (allowlist, tanpa `javascript:`/`data:`) **dan** klien (DOMParser inert + allowlist). API selalu `application/json` + `nosniff`. | `XSS & sanitasi`, UI: `XSS: data berbahaya hanya dirender sebagai teks` |
| **Brute force** | Rate limit per-IP (login 10/15 mnt, API 300/mnt, GraphQL 120/mnt, upload 30/mnt) **+** lockout per-akun dengan backoff eksponensial (5 gagal → 15 mnt … maks 24 jam). Hash selalu dihitung (waktu respons seragam) dan pesan error identik (anti user-enumeration). scrypt N=2¹⁵. | `Login, brute force & sesi`, `Rate limiting` |
| **Session bypass / hijack / fixation** | Token sesi acak 256-bit, **hanya hash SHA-256 yang disimpan**. Cookie `HttpOnly; SameSite=Strict; Path=/` (+ `Secure` & prefix `__Host-` di HTTPS). Token baru setiap login (anti-fixation). Idle & absolute timeout di server. Terikat hash User-Agent. Maks 10 sesi/user. Ganti password/role/status mencabut sesi. | `cookie sesi`, `session fixation`, `pembajakan sesi`, `sesi idle & absolut`, `menonaktifkan user` |
| **CSRF** | Token CSRF per-sesi (header `x-csrf-token`, banding waktu-konstan) **+** pengecekan `Origin` pada semua request mutasi berbasis cookie (juga login) **+** SameSite=Strict. Berlaku juga untuk mutasi GraphQL. CORS: allowlist eksplisit, tanpa kredensial. | `CSRF & Origin`, `GraphQL … mutasi wajib CSRF` |
| **Tamper / mass-assignment / IDOR** | Validasi zod `.strict()` per skema: field tak dikenal, field sistem (`id`, `status`, …), tipe salah, di luar batas → 400. Otorisasi RBAC di server pada **setiap** request; draft = 404 bagi yang tak berhak; referensi relasi/media memeriksa izin baca target (tanpa oracle keberadaan data). **Audit log berantai HMAC**: ubah/hapus baris terdeteksi. | `field tak dikenal…`, `relasi … anti oracle/IDOR`, `Audit log tamper-evident` |
| **Privilege escalation** | Tak bisa memberi izin yang tidak dimiliki sendiri; tak bisa mengubah user/role yang lebih berkuasa; tak bisa ubah role/status sendiri; admin terakhir tak bisa dihapus/dinonaktifkan; role Public hanya-baca; API token tak pernah membawa izin administrasi (ditegakkan saat dibuat **dan** saat dipakai). | `privilege escalation dicegah`, `API token` |
| **GraphQL abuse** | Introspeksi mati (default), batching ditolak, batas kedalaman 6 & 150 field, anggaran kunjungan anti *fragment-bomb*, batas token parser, error internal di-mask, rate limit khusus. | `GraphQL` |
| **Kebocoran informasi** | Error 5xx generik + `requestId`; tak ada stack/SQL ke klien; log menyamarkan `Authorization`/`Cookie`; `no-store` pada API; tanpa `X-Powered-By`. | `JSON rusak…`, `error internal tidak bocor` |
| **Konfigurasi lemah** | Production menolak `PUBLIC_URL` non-https dan `APP_SECRET` placeholder/pendek. **Tidak ada akun default** (admin dibuat lewat CLI). HSTS, CSP, `X-Frame-Options: DENY`, `COOP/CORP`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. | `Konfigurasi production & cookie HTTPS`, `Header & konfigurasi` |

Dependensi: `npm audit` → 0 kerentanan (saat rilis). Jalankan `npm audit` & perbarui secara berkala.

## Checklist produksi

- [ ] HTTPS di depan aplikasi (Caddy/Nginx/Traefik), `PUBLIC_URL=https://…`
- [ ] `TRUST_PROXY=true` **hanya** jika proxy tepercaya; pastikan proxy menimpa `X-Forwarded-For` dari klien
- [ ] `APP_SECRET` acak ≥32 byte, disimpan di secret manager; **backup** database + folder upload
- [ ] Database: user khusus dengan hak minimal; jangan expose port DB ke publik
- [ ] `CORS_ORIGINS` diisi hanya origin frontend Anda; token tulis tidak pernah di kode browser
- [ ] Pasang rate limit/WAF tambahan di proxy; pantau log & jalankan `verify-audit` berkala
- [ ] Multi-instance: pakai store rate-limit terpusat (Redis) dan satu penulis audit
- [ ] SSO (OIDC) tersedia untuk semua role: set `SSO_ENABLED=true` + `SSO_ISSUER`/`SSO_CLIENT_ID`/`SSO_CLIENT_SECRET`.
      Gunakan *Authorization Code + PKCE*; state disimpan sekali pakai di DB (`forma_sso_states`).
      Akun **wajib terdaftar lebih dulu** — SSO tidak pernah membuat user otomatis, dan izin tetap mengikuti role di CMS.
      Client secret hanya di server; endpoint publik `/api/auth/sso/info` tidak mengembalikan rahasia apa pun.
- [ ] 2FA (TOTP) tersedia per akun; pertimbangkan mewajibkannya untuk role admin via kebijakan internal

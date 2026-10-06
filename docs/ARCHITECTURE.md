# Arsitektur Forma

Forma memakai arsitektur **berlapis (layered / MVC-style)** dengan *dependency injection* manual.
Aturan dependensi antarlapisan **ditegakkan oleh tes otomatis** (`tests/architecture.test.ts`): build gagal jika ada lapisan yang melanggar.

## Alur sebuah request

```
Klien
  │  HTTP
  ▼
┌─────────────────────────── middleware/ ───────────────────────────┐
│ helmet + CSP + CORS + cookie  →  rate-limit  →  no-store          │
│ →  authenticate (Bearer | sesi | publik)  →  csrf (Origin+token)  │
└───────────────────────────────┬───────────────────────────────────┘
                                ▼
                     routes/   URL → preHandler → controller
                                │  requireUser('x') / requirePermission('x')
                                ▼
                  controllers/  validasi input (validators/) → panggil service → bentuk respons
                                ▼
                   services/    logika bisnis: RBAC, aturan domain, audit, orkestrasi transaksi
                                ▼
                    models/     SATU-SATUNYA tempat SQL (Knex, parameter binding, whitelist kolom)
                                ▼
                  database/     koneksi + migrations (SQLite | PostgreSQL | MySQL)
```
Error di lapisan mana pun dilempar sebagai `HttpError` (atau `ZodError`) dan diubah menjadi JSON aman oleh `middleware/error-handler.ts`.

## Tanggung jawab tiap folder

| Folder | Tanggung jawab | Boleh bergantung ke |
|---|---|---|
| `config/` | env + validasi (`index.ts`), konstanta keamanan/batas (`constants.ts`) | — |
| `database/` | koneksi Knex, runner migrasi, `migrations/001...007` (idempoten, tercatat di `forma_migrations`) | config, utils, types |
| `models/` | akses data per tabel (`UserModel`, `RoleModel`, `SessionModel`, `ApiTokenModel`, `MediaModel`, `AuditModel`, `ContentTypeModel`, `EntryModel`) + query-builder dinamis (`entry.query.ts`) + mapper | database, utils, types, security, validators |
| `validators/` | skema zod: body/query/params, aturan field dinamis (`.strict()` → anti mass-assignment) | security, utils, types |
| `services/` | logika bisnis, otorisasi domain, audit; **tidak tahu HTTP** | models, validators, security, utils, graphql |
| `controllers/` | adaptor HTTP tipis: `req` → service → `reply` | services, validators, utils |
| `middleware/` | authenticate, CSRF, otorisasi (`preHandler`), rate-limit, header keamanan, error handler | services, security, utils |
| `routes/` | deklarasi URL + middleware + controller (satu file per resource) | controllers, middleware |
| `graphql/` | pembangun skema dinamis + penjaga kompleksitas (dipakai `GraphQLService`) | services, validators |
| `security/` | primitif: scrypt, token, sanitasi HTML, izin (RBAC), deteksi tipe upload | utils, types, config |
| `core/` | composition root `container.ts`: db → models → services | semuanya (hanya merakit) |
| `types/`, `utils/` | tipe bersama; helper murni (error, cookie, penamaan) | — |

Aturan tambahan yang diuji: hanya `models/`+`database/` yang mengimpor Knex atau menulis SQL/DDL; controller tidak menyentuh `ctx.models`/`ctx.db`;
service/model tidak mengimpor Fastify; setiap route admin punya `preHandler` otorisasi; setiap controller & route file terdaftar.

## Peta resource

| Resource | Routes | Controller | Service | Model |
|---|---|---|---|---|
| Auth (login, me, logout, password) | `auth.routes` | `AuthController` | `AuthService`, `SessionService` | `UserModel`, `SessionModel`, `RoleModel` |
| Users | `user.routes` | `UserController` | `UserService` | `UserModel`, `RoleModel` |
| Roles | `role.routes` | `RoleController` | `RoleService` | `RoleModel` |
| API tokens | `token.routes` | `TokenController` | `ApiTokenService` | `ApiTokenModel` |
| Content types (builder) | `content-type.routes` | `ContentTypeController` | `SchemaService` | `ContentTypeModel`, `EntryModel` (DDL) |
| Content (CRUD) | `content.routes` | `ContentController` | `ContentService` | `EntryModel`, `MediaModel` |
| Media | `media.routes` | `MediaController` | `MediaService` | `MediaModel` |
| Audit | `audit.routes` | `AuditController` | `AuditService` | `AuditModel` |
| GraphQL | `graphql.routes` | `GraphQLController` | `GraphQLService` (+ `graphql/`) | lewat `ContentService` |
| SSO (OIDC) | `sso.routes` | `SsoController` | `SsoService` (+ `security/oidc.ts`) | `SsoStateModel`, `UserModel`, `SessionModel` |
| Landing page `/` + panel admin | `admin-ui.routes` | — (render server-side) | `SeedService` (template `config/homepage-template.ts`) | `EntryModel`, `ContentTypeModel` |

## Contoh: `POST /api/content/article`

1. **middleware** — rate-limit → `authenticate` (cookie → `SessionService.resolve` → `req.principal`) → `csrfProtection` (Origin + `x-csrf-token`).
2. **routes/content.routes.ts** → `ContentController.create`.
3. **controller** — memvalidasi `:apiId` (`contentParams`), lalu `ContentService.create(principal, apiId, body)`.
4. **service** — `SchemaService.require` → izin `content:article:create` → `parseWith(createEnvelope(ct), body)` (zod `.strict()` dari skema) → `checkRefs` (izin baca target relasi/media) → status publish perlu izin `publish`.
5. **model** — `EntryModel.insert` (parameter binding; nama kolom dari skema) ; unique-violation → `409`.
6. **service** — `AuditService.log('content.create', …)` (rantai HMAC) → mengembalikan entri → controller membalas `201`.

## Menambah resource baru

1. **Migrasi**: `database/migrations/008_<nama>.ts` (`up(db)` idempoten) lalu daftarkan di `migrations/index.ts`.
2. **Model**: `models/<x>.model.ts` (extends `BaseModel`) → daftarkan di `models/index.ts`.
3. **Validator**: `validators/<x>.validator.ts` (zod `.strict()`).
4. **Service**: `services/<x>.service.ts` (logika + `AuditService.log`) → rakit di `core/container.ts`.
5. **Controller**: `controllers/<x>.controller.ts` → daftarkan di `controllers/index.ts`.
6. **Routes**: `routes/<x>.routes.ts` dengan `preHandler: [requireUser('izin:baru')]` → daftarkan di `routes/index.ts`; tambah izin di `security/permissions.ts`.
7. **Tes**: tambahkan ke `tests/` — `architecture.test.ts` otomatis memeriksa aturan lapisan & perlindungan route.

## Panel admin (`admin/src`)

```
main.ts          boot: cek sesi → login | shell + router
app/             router.ts (tabel rute + guard izin), shell.ts (sidebar/topbar), location.ts
core/            http.ts (klien API + CSRF), state.ts (sesi, can()), types.ts, prefs.ts (tema/aksen/kepadatan)
components/      dom.ts (h/icon, tanpa innerHTML), toast, modal, form, format, rich-text, media-picker, field-editor
pages/           satu file per halaman: dashboard, content-list, content-editor, builder, media, roles, users, tokens, audit, account, login
```
Aturan: tidak ada `innerHTML` (semua teks lewat `createTextNode`); `core/` tidak bergantung ke `components/` atau `pages/`.

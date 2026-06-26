# 🏪 Kasir SaaS — Telegram Mini App

Aplikasi pembukuan toko berbasis **Telegram Mini App (Web App)** dengan arsitektur SaaS multi-tenant.

---

## 🏗 Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM CLIENT                          │
│   ┌─────────────────────┐  ┌───────────────────────────┐   │
│   │   Telegram Bot       │  │  Telegram Mini App (WebApp)│   │
│   │   (Telegraf v4)      │  │  (Next.js 14 + Tailwind)  │   │
│   └──────────┬──────────┘  └─────────────┬─────────────┘   │
└──────────────┼──────────────────────────┼─────────────────┘
               │                          │ HTTPS
               ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (Node.js + Express)                 │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐ │
│  │ Bot Logic│  │ REST API    │  │  ExcelJS Export Service │ │
│  │ /start   │  │ /api/...    │  │  → Kirim via Bot        │ │
│  │ Admin Cmd│  │ JWT Auth    │  └────────────────────────┘ │
│  │ Cron Job │  │ Rate Limit  │                              │
│  └──────────┘  └─────────────┘                              │
│                    │ Prisma ORM                              │
└────────────────────┼────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               PostgreSQL Database                           │
│  users → ledger_entries → sale_items                        │
│       → products → stock_logs                               │
│       → transaction_categories → unit_types                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Struktur Folder

```
kasir-saas/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (General Ledger)
│   ├── src/
│   │   ├── bot/
│   │   │   └── index.ts           # Telegraf bot + cron jobs
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts # Login, check status
│   │   │   ├── ledger.controller.ts
│   │   │   ├── product.controller.ts
│   │   │   └── pos.controller.ts
│   │   ├── db/
│   │   │   └── prisma.ts          # Prisma client singleton
│   │   ├── middlewares/
│   │   │   └── auth.middleware.ts # JWT guard
│   │   ├── services/
│   │   │   ├── auth.service.ts    # PIN hash, JWT, user mgmt
│   │   │   ├── ledger.service.ts  # ⭐ Core accounting engine
│   │   │   ├── pos.service.ts     # Atomic POS transaction
│   │   │   ├── product.service.ts # Inventory + stock
│   │   │   └── excel.service.ts   # ExcelJS → Telegram
│   │   └── index.ts               # Express app entrypoint
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout + Telegram script
│   │   │   ├── providers.tsx      # React Query + Toast
│   │   │   ├── globals.css        # Windtail CSS
│   │   │   ├── page.tsx           # 🔐 Login PIN page
│   │   │   └── app/
│   │   │       ├── layout.tsx     # App shell + auth guard
│   │   │       ├── kas/page.tsx   # 📒 Buku Kas
│   │   │       ├── produk/page.tsx # 📦 Manajemen Produk
│   │   │       ├── pos/page.tsx   # ⚡ Kasir Cepat
│   │   │       └── analytic/page.tsx # 📊 Dashboard Analitik
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── BottomNav.tsx  # Bottom navigation bar
│   │   │   └── ui/
│   │   │       └── index.tsx      # Shared UI components
│   │   ├── lib/
│   │   │   └── api.ts             # Axios client + API helpers
│   │   └── store/
│   │       └── auth.store.ts      # Zustand auth state
│   ├── .env.local.example
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package.json
│   └── tailwind.config.ts
│
└── docker-compose.yml
```

---

## ⚙️ Setup & Instalasi

### 1. Clone & Konfigurasi

```bash
git clone <repo-url>
cd kasir-saas
```

### 2. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env: isi BOT_TOKEN, ADMIN_TELEGRAM_ID, DATABASE_URL, JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev
```

### 3. Setup Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_ADMIN_USERNAME
npm install
npm run dev
```

### 4. Docker (Production)

```bash
cp .env.example .env  # isi semua variable
docker-compose up -d
```

---

## 🤖 Admin Bot Commands

| Command | Fungsi |
|---------|--------|
| `/adduser <tg_id> <nama> <pin> <hari>` | Tambah user baru |
| `/resetpin <tg_id> <pin_baru>` | Reset PIN user |
| `/extend <tg_id> <hari>` | Perpanjang membership |
| `/deleteuser <tg_id>` | Hapus user + semua data |
| `/listusers` | Daftar semua user aktif |

---

## 🗄 Desain Database: General Ledger Pattern

Setiap mutasi saldo adalah **row immutable** di tabel `ledger_entries`:
- `type = CREDIT` → uang masuk (saldo bertambah)
- `type = DEBIT` → uang keluar (saldo berkurang)
- `balance_after` → snapshot saldo setelah transaksi (O(1) read current balance)

**Kenapa General Ledger?**
- Audit trail lengkap — tidak ada data yang dihapus/dimodifikasi
- Saldo tidak bisa manipulasi (append-only)
- Setiap penjualan POS, tambah stok, dan transaksi manual terekam di satu tabel

---

## 🎨 Windtail CSS Design System

| Token | Value | Deskripsi |
|-------|-------|-----------|
| `bg-bg-base` | `#09090b` | Background utama |
| `bg-bg-card` | `#18181b` | Card container |
| `border-border` | `#27272a` | Border default |
| `accent` | `#059669` | Emerald aksen |
| `text-text-primary` | `#fafafa` | Teks utama |
| `text-text-muted` | `#71717a` | Teks sekunder |

---

## 🔐 Security

- **PIN**: bcrypt hash (rounds 12), tidak pernah disimpan plaintext
- **JWT**: 24h expiry, diverifikasi di setiap request
- **initData**: Divalidasi dengan HMAC-SHA256 menggunakan Bot Token (spec Telegram)
- **Rate limiting**: 10 percobaan login / 5 menit
- **Tenant isolation**: Setiap query di-scope ke `userId` — tidak bisa akses data tenant lain
- **Auth freshness**: JWT valid tapi user bisa dideaktivasi realtime via DB check

---

## 📊 API Endpoints

### Auth (Public)
```
POST /api/auth/login     — Verifikasi initData + PIN → JWT
GET  /api/auth/check     — Cek status akun (sebelum tampil form PIN)
```

### Ledger (Protected)
```
GET  /api/ledger         — Histori transaksi (paginated + filter)
POST /api/ledger         — Catat transaksi baru
GET  /api/ledger/balance — Saldo saat ini (real-time)
GET  /api/ledger/analytics — Dashboard summary
GET  /api/ledger/categories — Daftar kategori
POST /api/ledger/categories — Tambah kategori baru
GET  /api/ledger/export  — Generate + kirim Excel via Telegram
```

### Products (Protected)
```
GET  /api/products       — Daftar produk (search + filter)
POST /api/products       — Tambah produk baru
GET  /api/products/:id   — Detail produk
PUT  /api/products/:id   — Update produk
DEL  /api/products/:id   — Soft delete produk
POST /api/products/:id/stock/add    — Tambah stok
POST /api/products/:id/stock/adjust — Koreksi stok
```

### POS (Protected)
```
POST /api/pos/sale       — Proses transaksi penjualan (atomic)
GET  /api/pos/history    — Riwayat penjualan
```

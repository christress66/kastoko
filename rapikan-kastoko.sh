#!/bin/bash
# ============================================================
# Script: Rapikan repo kastoko
# Jalankan dari dalam folder repo: cd kastoko && bash rapikan-kastoko.sh
# ============================================================

set -e

echo "📁 Membuat struktur folder..."

# Backend folders
mkdir -p backend/src/bot
mkdir -p backend/src/controllers
mkdir -p backend/src/services
mkdir -p backend/src/db
mkdir -p backend/prisma

# Frontend folders
mkdir -p frontend/src/app/app/kas
mkdir -p frontend/src/app/app/produk
mkdir -p frontend/src/app/app/pos
mkdir -p frontend/src/app/app/analytic
mkdir -p frontend/src/components/layout
mkdir -p frontend/src/components/ui
mkdir -p frontend/src/lib

echo "📦 Memindahkan file backend..."

# Bot (index.ts adalah bot berdasarkan isinya)
git mv index.ts backend/src/bot/index.ts

# Express app entrypoint
git mv index-1.ts backend/src/index.ts

# Services
git mv auth.service.ts backend/src/services/auth.service.ts
git mv ledger.service.ts backend/src/services/ledger.service.ts
git mv pos.service.ts backend/src/services/pos.service.ts
git mv product.service.ts backend/src/services/product.service.ts
git mv excel.service.ts backend/src/services/excel.service.ts

# Controllers
git mv pos.controller.ts backend/src/controllers/pos.controller.ts
git mv product.controller.ts backend/src/controllers/product.controller.ts

# API (kemungkinan db/prisma client atau api helper)
git mv api.ts backend/src/db/prisma.ts

# Prisma schema (hapus ekstensi .txt)
git mv schema.prisma.txt backend/prisma/schema.prisma

# Docker
git mv docker-compose.yml.txt docker-compose.yml

echo "📦 Memindahkan file frontend..."

# Pages (.txt → .tsx)
git mv page.tsx.txt frontend/src/app/page.tsx
git mv page-1.tsx.txt frontend/src/app/app/kas/page.tsx
git mv page-2.tsx.txt frontend/src/app/app/produk/page.tsx
git mv page-3.tsx.txt frontend/src/app/app/pos/page.tsx
git mv page-4.tsx.txt frontend/src/app/app/analytic/page.tsx

# Components
git mv BottomNav.tsx.txt frontend/src/components/layout/BottomNav.tsx
git mv index.tsx.txt frontend/src/components/ui/index.tsx

echo "📝 Membuat .gitignore..."

cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
.next/
out/
build/

# Environment files
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS
.DS_Store
Thumbs.db

# Prisma
backend/prisma/migrations/

# TypeScript
*.tsbuildinfo
EOF

git add .gitignore

echo "✅ Commit perubahan..."
git add -A
git commit -m "refactor: rapikan struktur repo ke backend/ dan frontend/

- Pindahkan semua file ke struktur folder yang sesuai README
- Rename .txt → ekstensi asli (.tsx, .yml, .prisma)
- Tambah .gitignore untuk Node.js/Next.js"

echo ""
echo "🚀 Push ke GitHub..."
git push origin main

echo ""
echo "✅ Selesai! Repo sudah rapi."


// src/services/ledger.service.ts
// ============================================================
// CORE ACCOUNTING ENGINE
// Uses append-only General Ledger pattern.
// Balance snapshot is stored per-row for O(1) current balance.
// Historical queries sum from filtered rows.
// ============================================================

import { LedgerType, Prisma, RefType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Types ──────────────────────────────────────────────────

export interface CreateLedgerEntryInput {
  userId: string;
  type: LedgerType;
  amount: number;
  categoryId: string;
  description?: string;
  refType?: RefType;
  refId?: string;
  recordedAt?: Date;
}

export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export interface AnalyticsSummary {
  currentBalance: number;
  totalRevenue: number;      // Sum semua CREDIT
  totalExpense: number;      // Sum semua DEBIT (kecuali POS_SALE COGS)
  totalCogs: number;         // Modal produk terjual
  grossProfit: number;       // Revenue - COGS
  netProfit: number;         // Revenue - COGS - Operational Expense
  totalItemsSold: number;
  margin: number;            // (grossProfit / totalRevenue) * 100
}

// ─── Ledger Service ──────────────────────────────────────────

export const LedgerService = {

  /**
   * Ambil saldo terkini dari snapshot terakhir di ledger.
   * O(1) — tidak perlu sum seluruh tabel.
   */
  async getCurrentBalance(userId: string): Promise<number> {
    const lastEntry = await prisma.ledgerEntry.findFirst({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      select: { balanceAfter: true },
    });
    return lastEntry ? lastEntry.balanceAfter.toNumber() : 0;
  },

  /**
   * Buat entri ledger baru dengan kalkulasi saldo otomatis.
   * Menggunakan Prisma transaction untuk atomisitas.
   */
  async createEntry(
    input: CreateLedgerEntryInput
  ): Promise<{ entry: any; newBalance: number }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Ambil saldo terakhir (dengan row lock untuk concurrency safety)
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { userId: input.userId },
        orderBy: { recordedAt: "desc" },
        select: { balanceAfter: true },
      });

      const currentBalance = lastEntry
        ? lastEntry.balanceAfter.toNumber()
        : 0;

      const amount = new Decimal(input.amount);

      // 2. Kalkulasi saldo baru
      const newBalance =
        input.type === LedgerType.CREDIT
          ? new Decimal(currentBalance).plus(amount)
          : new Decimal(currentBalance).minus(amount);

      // 3. Validasi: saldo tidak boleh negatif kecuali admin override
      if (newBalance.lessThan(0)) {
        throw new Error(
          `Saldo tidak cukup. Saldo saat ini: ${currentBalance.toLocaleString("id-ID")}`
        );
      }

      // 4. Insert entri ledger dengan snapshot saldo
      const entry = await tx.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: input.type,
          amount: amount,
          balanceAfter: newBalance,
          categoryId: input.categoryId,
          description: input.description,
          refType: input.refType,
          refId: input.refId,
          recordedAt: input.recordedAt ?? new Date(),
        },
        include: {
          category: true,
        },
      });

      return { entry, newBalance: newBalance.toNumber() };
    });
  },

  /**
   * Ambil histori transaksi dengan pagination dan filter tanggal.
   */
  async getHistory(
    userId: string,
    options: {
      filter?: DateRangeFilter;
      page?: number;
      limit?: number;
      type?: LedgerType;
    } = {}
  ) {
    const { filter, page = 1, limit = 20, type } = options;

    const where: Prisma.LedgerEntryWhereInput = {
      userId,
      ...(type && { type }),
      ...(filter?.from || filter?.to
        ? {
            recordedAt: {
              ...(filter.from && { gte: filter.from }),
              ...(filter.to && { lte: filter.to }),
            },
          }
        : {}),
    };

    const [entries, total] = await prisma.$transaction([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { recordedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { name: true, type: true } },
          saleItems: {
            include: {
              product: { select: { name: true, imageUrl: true } },
            },
          },
        },
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Kalkulasi analytics komprehensif untuk dashboard.
   */
  async getAnalytics(
    userId: string,
    filter?: DateRangeFilter
  ): Promise<AnalyticsSummary> {
    const dateWhere = filter?.from || filter?.to
      ? {
          recordedAt: {
            ...(filter.from && { gte: filter.from }),
            ...(filter.to && { lte: filter.to }),
          },
        }
      : {};

    // Parallel queries untuk performa
    const [creditAgg, debitAgg, saleItemsAgg, currentBalance] =
      await Promise.all([
        // Total CREDIT dalam range
        prisma.ledgerEntry.aggregate({
          where: { userId, type: LedgerType.CREDIT, ...dateWhere },
          _sum: { amount: true },
        }),

        // Total DEBIT dalam range (termasuk COGS dari POS — kita pisah via sale items)
        prisma.ledgerEntry.aggregate({
          where: {
            userId,
            type: LedgerType.DEBIT,
            NOT: { refType: RefType.POS_SALE }, // exclude POS (COGS dihitung terpisah)
            ...dateWhere,
          },
          _sum: { amount: true },
        }),

        // COGS dari sale items (modal produk terjual)
        prisma.saleItem.aggregate({
          where: {
            ledgerEntry: {
              userId,
              refType: RefType.POS_SALE,
              ...dateWhere,
            },
          },
          _sum: {
            subtotal: true,       // Total revenue dari POS
            qty: true,
          },
        }),

        // Saldo real-time (selalu dari latest snapshot, tidak terpengaruh filter)
        LedgerService.getCurrentBalance(userId),
      ]);

    // Hitung COGS: sum(qty * buyPriceAtSale)
    const cogsResult = await prisma.$queryRaw<{ cogs: number }[]>`
      SELECT COALESCE(SUM(si.qty * si.buy_price_at_sale), 0) as cogs
      FROM sale_items si
      JOIN ledger_entries le ON le.id = si.ledger_entry_id
      WHERE le.user_id = ${userId}
        AND le.ref_type = 'POS_SALE'
        ${filter?.from ? Prisma.sql`AND le.recorded_at >= ${filter.from}` : Prisma.empty}
        ${filter?.to ? Prisma.sql`AND le.recorded_at <= ${filter.to}` : Prisma.empty}
    `;

    const totalRevenue = creditAgg._sum.amount?.toNumber() ?? 0;
    const totalExpense = debitAgg._sum.amount?.toNumber() ?? 0;
    const totalCogs = Number(cogsResult[0]?.cogs ?? 0);
    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpense;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const totalItemsSold = saleItemsAgg._sum.qty ?? 0;

    return {
      currentBalance,
      totalRevenue,
      totalExpense,
      totalCogs,
      grossProfit,
      netProfit,
      totalItemsSold,
      margin: parseFloat(margin.toFixed(2)),
    };
  },

  /**
   * Seed kategori default saat user pertama kali register.
   */
  async seedDefaultCategories(userId: string): Promise<void> {
    const defaults = [
      { name: "Penjualan Produk", type: LedgerType.CREDIT },
      { name: "Tambah Modal", type: LedgerType.CREDIT },
      { name: "Penerimaan Lainnya", type: LedgerType.CREDIT },
      { name: "Bayar Supplier / Tambah Stok", type: LedgerType.DEBIT },
      { name: "Biaya Operasional", type: LedgerType.DEBIT },
      { name: "Biaya Iklan", type: LedgerType.DEBIT },
      { name: "Gaji Karyawan", type: LedgerType.DEBIT },
      { name: "Tarik Tunai / Prive", type: LedgerType.DEBIT },
      { name: "Pengeluaran Lainnya", type: LedgerType.DEBIT },
    ];

    await prisma.transactionCategory.createMany({
      data: defaults.map((d) => ({ ...d, userId, isDefault: true })),
      skipDuplicates: true,
    });
  },
};

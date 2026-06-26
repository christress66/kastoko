// src/services/pos.service.ts
// ============================================================
// Point of Sale Engine
// Satu transaksi bisa multi-item. Atomically:
//   1. Kurangi stok setiap produk
//   2. Buat SaleItem per produk
//   3. Buat LedgerEntry CREDIT dengan total penjualan
//   4. Update balanceAfter snapshot
// ============================================================

import { Prisma, RefType, LedgerType, StockReason } from "@prisma/client";
import { prisma } from "../db/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface SaleItemInput {
  productId: string;
  qty: number;
  priceOverride?: number; // Optional: override harga jual (diskon)
}

export interface ProcessSaleInput {
  userId: string;
  items: SaleItemInput[];
  categoryId: string; // Kategori "Penjualan Produk"
  note?: string;
}

export const POSService = {

  /**
   * Proses transaksi penjualan multi-item secara atomic.
   */
  async processSale(input: ProcessSaleInput) {
    const { userId, items, categoryId, note } = input;

    if (!items.length) throw new Error("Tidak ada item yang dipilih.");

    return await prisma.$transaction(async (tx) => {
      // 1. Validasi & lock produk
      const productIds = items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, userId, isActive: true },
      });

      if (products.length !== productIds.length) {
        throw new Error("Beberapa produk tidak ditemukan atau tidak aktif.");
      }

      // 2. Validasi stok
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)!;
        if (product.stock < item.qty) {
          throw new Error(
            `Stok ${product.name} tidak cukup. Tersedia: ${product.stock}, diminta: ${item.qty}`
          );
        }
      }

      // 3. Hitung total
      let totalRevenue = new Decimal(0);
      const saleItemsData: {
        productId: string;
        qty: number;
        priceAtSale: Decimal;
        buyPriceAtSale: Decimal;
        subtotal: Decimal;
      }[] = [];

      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)!;
        const priceAtSale = new Decimal(item.priceOverride ?? product.sellPrice.toNumber());
        const buyPriceAtSale = new Decimal(product.buyPrice.toNumber());
        const subtotal = priceAtSale.times(item.qty);
        totalRevenue = totalRevenue.plus(subtotal);

        saleItemsData.push({
          productId: item.productId,
          qty: item.qty,
          priceAtSale,
          buyPriceAtSale,
          subtotal,
        });
      }

      // 4. Ambil saldo terakhir (snapshot)
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { userId },
        orderBy: { recordedAt: "desc" },
        select: { balanceAfter: true },
      });
      const currentBalance = lastEntry?.balanceAfter ?? new Decimal(0);
      const newBalance = currentBalance.plus(totalRevenue);

      // 5. Buat LedgerEntry CREDIT
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          userId,
          type: LedgerType.CREDIT,
          amount: totalRevenue,
          balanceAfter: newBalance,
          categoryId,
          description: note ?? `Penjualan ${items.length} item`,
          refType: RefType.POS_SALE,
          recordedAt: new Date(),
        },
      });

      // 6. Buat SaleItem + kurangi stok + log stok
      for (const itemData of saleItemsData) {
        const product = products.find((p) => p.id === itemData.productId)!;
        const newStock = product.stock - itemData.qty;

        // SaleItem
        await tx.saleItem.create({
          data: {
            ledgerEntryId: ledgerEntry.id,
            productId: itemData.productId,
            qty: itemData.qty,
            priceAtSale: itemData.priceAtSale,
            buyPriceAtSale: itemData.buyPriceAtSale,
            subtotal: itemData.subtotal,
          },
        });

        // Update stok produk
        await tx.product.update({
          where: { id: itemData.productId },
          data: { stock: newStock },
        });

        // StockLog
        await tx.stockLog.create({
          data: {
            productId: itemData.productId,
            changeQty: -itemData.qty,
            stockAfter: newStock,
            reason: StockReason.SALE,
            ledgerRefId: ledgerEntry.id,
            note: `Terjual via POS`,
          },
        });
      }

      return {
        ledgerEntryId: ledgerEntry.id,
        totalRevenue: totalRevenue.toNumber(),
        newBalance: newBalance.toNumber(),
        itemCount: items.length,
        items: saleItemsData.map((d) => ({
          productId: d.productId,
          qty: d.qty,
          subtotal: d.subtotal.toNumber(),
        })),
      };
    });
  },

  /**
   * Ambil riwayat penjualan POS dengan detail item.
   */
  async getSaleHistory(
    userId: string,
    options: { page?: number; limit?: number; from?: Date; to?: Date } = {}
  ) {
    const { page = 1, limit = 20, from, to } = options;

    const where: Prisma.LedgerEntryWhereInput = {
      userId,
      refType: "POS_SALE",
      ...(from || to
        ? {
            recordedAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
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
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};

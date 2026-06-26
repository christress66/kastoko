// src/services/product.service.ts
// ============================================================
// Manajemen Produk & Stok
// Setiap penambahan stok yang memotong saldo otomatis
// mencatat entry di General Ledger.
// ============================================================

import { Prisma, StockReason } from "@prisma/client";
import { prisma } from "../db/prisma";
import { LedgerService } from "./ledger.service";

export interface CreateProductInput {
  userId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryName?: string;
  unitTypeId: string;
  buyPrice: number;
  sellPrice: number;
  initialStock?: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  imageUrl?: string;
  categoryName?: string;
  unitTypeId?: string;
  buyPrice?: number;
  sellPrice?: number;
  isActive?: boolean;
}

export interface AddStockInput {
  productId: string;
  userId: string;
  qty: number;
  buyPricePerUnit: number;      // harga beli per unit saat ini
  deductFromBalance: boolean;   // potong saldo toko?
  debitCategoryId?: string;     // kategori ledger jika potong saldo
  note?: string;
}

export const ProductService = {

  async getAll(
    userId: string,
    options: {
      search?: string;
      categoryName?: string;
      isActive?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { search, categoryName, isActive, page = 1, limit = 20 } = options;

    const where: Prisma.ProductWhereInput = {
      userId,
      ...(isActive !== undefined && { isActive }),
      ...(categoryName && { categoryName }),
      ...(search && {
        name: { contains: search, mode: "insensitive" },
      }),
    };

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          unitType: { select: { id: true, name: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Hitung profit margin per produk
    const enriched = products.map((p) => {
      const buy = p.buyPrice.toNumber();
      const sell = p.sellPrice.toNumber();
      const profit = sell - buy;
      const margin = sell > 0 ? (profit / sell) * 100 : 0;
      return {
        ...p,
        buyPrice: buy,
        sellPrice: sell,
        profit: parseFloat(profit.toFixed(2)),
        margin: parseFloat(margin.toFixed(2)),
      };
    });

    return {
      data: enriched,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getById(productId: string, userId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
      include: {
        unitType: { select: { id: true, name: true } },
        stockLogs: {
          orderBy: { recordedAt: "desc" },
          take: 10,
        },
      },
    });
    if (!product) return null;

    const buy = product.buyPrice.toNumber();
    const sell = product.sellPrice.toNumber();
    return {
      ...product,
      buyPrice: buy,
      sellPrice: sell,
      profit: sell - buy,
      margin: sell > 0 ? parseFloat(((sell - buy) / sell * 100).toFixed(2)) : 0,
    };
  },

  async create(input: CreateProductInput) {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          userId: input.userId,
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          categoryName: input.categoryName,
          unitTypeId: input.unitTypeId,
          buyPrice: new Prisma.Decimal(input.buyPrice),
          sellPrice: new Prisma.Decimal(input.sellPrice),
          stock: input.initialStock ?? 0,
        },
        include: { unitType: { select: { id: true, name: true } } },
      });

      // Log initial stock jika ada
      if (input.initialStock && input.initialStock > 0) {
        await tx.stockLog.create({
          data: {
            productId: product.id,
            changeQty: input.initialStock,
            stockAfter: input.initialStock,
            reason: StockReason.PURCHASE,
            note: "Stok awal saat produk dibuat",
          },
        });
      }

      return product;
    });
  },

  async update(productId: string, userId: string, input: UpdateProductInput) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!existing) throw new Error("Produk tidak ditemukan.");

    return await prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.categoryName !== undefined && { categoryName: input.categoryName }),
        ...(input.unitTypeId !== undefined && { unitTypeId: input.unitTypeId }),
        ...(input.buyPrice !== undefined && { buyPrice: new Prisma.Decimal(input.buyPrice) }),
        ...(input.sellPrice !== undefined && { sellPrice: new Prisma.Decimal(input.sellPrice) }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: { unitType: { select: { id: true, name: true } } },
    });
  },

  async delete(productId: string, userId: string) {
    const existing = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!existing) throw new Error("Produk tidak ditemukan.");
    // Soft delete
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
  },

  /**
   * Tambah stok dengan opsi potong saldo.
   * Jika deductFromBalance=true, otomatis buat LedgerEntry DEBIT.
   */
  async addStock(input: AddStockInput) {
    const { productId, userId, qty, buyPricePerUnit, deductFromBalance, debitCategoryId, note } = input;

    if (qty <= 0) throw new Error("Jumlah stok harus lebih dari 0.");

    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!product) throw new Error("Produk tidak ditemukan.");

    return await prisma.$transaction(async (tx) => {
      const newStock = product.stock + qty;

      // Update stok produk
      await tx.product.update({
        where: { id: productId },
        data: {
          stock: newStock,
          buyPrice: new Prisma.Decimal(buyPricePerUnit), // update harga beli terkini
        },
      });

      let ledgerRefId: string | undefined;

      // Potong saldo jika diminta
      if (deductFromBalance && debitCategoryId) {
        const totalCost = qty * buyPricePerUnit;
        const { entry } = await LedgerService.createEntry({
          userId,
          type: "DEBIT",
          amount: totalCost,
          categoryId: debitCategoryId,
          description: `Beli stok: ${product.name} ×${qty} @ ${buyPricePerUnit.toLocaleString("id-ID")}`,
          refType: "STOCK_PURCHASE",
          refId: productId,
        });
        ledgerRefId = entry.id;
      }

      // Log perubahan stok
      await tx.stockLog.create({
        data: {
          productId,
          changeQty: qty,
          stockAfter: newStock,
          reason: StockReason.PURCHASE,
          ledgerRefId,
          note: note ?? `Tambah stok ${qty} unit`,
        },
      });

      return { product: { ...product, stock: newStock }, newStock };
    });
  },

  /**
   * Koreksi stok manual (adjustment).
   */
  async adjustStock(
    productId: string,
    userId: string,
    newStockTotal: number,
    note: string
  ) {
    const product = await prisma.product.findFirst({
      where: { id: productId, userId },
    });
    if (!product) throw new Error("Produk tidak ditemukan.");

    const changeQty = newStockTotal - product.stock;

    return await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { stock: newStockTotal },
      });

      await tx.stockLog.create({
        data: {
          productId,
          changeQty,
          stockAfter: newStockTotal,
          reason: StockReason.ADJUSTMENT,
          note: note || `Koreksi stok ke ${newStockTotal}`,
        },
      });

      return newStockTotal;
    });
  },

  async getUnitTypes(userId: string) {
    return prisma.unitType.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
  },

  async createUnitType(userId: string, name: string) {
    return prisma.unitType.create({
      data: { userId, name },
    });
  },

  async getCategories(userId: string) {
    const result = await prisma.product.findMany({
      where: { userId, categoryName: { not: null } },
      select: { categoryName: true },
      distinct: ["categoryName"],
    });
    return result.map((r) => r.categoryName).filter(Boolean);
  },
};

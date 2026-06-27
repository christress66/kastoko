// src/controllers/product.controller.ts
import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ProductService } from "../services/product.service";
import { prisma } from "../db/prisma";

const CreateProductSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  categoryName: z.string().max(50).optional(),
  unitTypeId: z.string().min(1),
  buyPrice: z.number().nonnegative(),
  sellPrice: z.number().positive(),
  initialStock: z.number().int().nonnegative().optional(),
});

const UpdateProductSchema = CreateProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const AddStockSchema = z.object({
  qty: z.number().int().positive(),
  buyPricePerUnit: z.number().positive(),
  deductFromBalance: z.boolean().default(false),
  debitCategoryId: z.string().optional(),
  note: z.string().max(200).optional(),
});

const AdjustStockSchema = z.object({
  newStockTotal: z.number().int().nonnegative(),
  note: z.string().max(200).default("Koreksi stok manual"),
});

export const ProductController = {

  async getAll(req: AuthRequest, res: Response) {
    const schema = z.object({
      search: z.string().optional(),
      categoryName: z.string().optional(),
      isActive: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { search, categoryName, isActive, page, limit } = parsed.data;
    const result = await ProductService.getAll(req.userId!, {
      search,
      categoryName,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      page,
      limit,
    });

    res.json({ success: true, ...result });
  },

  async getById(req: AuthRequest, res: Response) {
    const product = await ProductService.getById(req.params.id, req.userId!);
    if (!product) {
      res.status(404).json({ error: "Produk tidak ditemukan." });
      return;
    }
    res.json({ success: true, data: product });
  },

  async create(req: AuthRequest, res: Response) {
    const parsed = CreateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const product = await ProductService.create({
        userId: req.userId!,
        ...parsed.data,
        imageUrl: parsed.data.imageUrl || undefined,
      });
      res.status(201).json({ success: true, data: product });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  async update(req: AuthRequest, res: Response) {
    const parsed = UpdateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const product = await ProductService.update(
        req.params.id,
        req.userId!,
        parsed.data
      );
      res.json({ success: true, data: product });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      await ProductService.delete(req.params.id, req.userId!);
      res.json({ success: true, message: "Produk dinonaktifkan." });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },

  async addStock(req: AuthRequest, res: Response) {
    const parsed = AddStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (parsed.data.deductFromBalance && !parsed.data.debitCategoryId) {
      res.status(400).json({ error: "debitCategoryId wajib jika memotong saldo." });
      return;
    }

    try {
      const result = await ProductService.addStock({
        productId: req.params.id,
        userId: req.userId!,
        ...parsed.data,
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  async adjustStock(req: AuthRequest, res: Response) {
    const parsed = AdjustStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const newStock = await ProductService.adjustStock(
        req.params.id,
        req.userId!,
        parsed.data.newStockTotal,
        parsed.data.note
      );
      res.json({ success: true, data: { stock: newStock } });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  },

  async getUnitTypes(req: AuthRequest, res: Response) {
    const unitTypes = await ProductService.getUnitTypes(req.userId!);
    res.json({ success: true, data: unitTypes });
  },

  async createUnitType(req: AuthRequest, res: Response) {
    const schema = z.object({ name: z.string().min(1).max(30) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const unitType = await ProductService.createUnitType(req.userId!, parsed.data.name);
      res.status(201).json({ success: true, data: unitType });
    } catch {
      res.status(400).json({ error: "Satuan dengan nama ini sudah ada." });
    }
  },

  async getProductCategories(req: AuthRequest, res: Response) {
    const categories = await ProductService.getCategories(req.userId!);
    res.json({ success: true, data: categories });
  },
};

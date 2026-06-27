// src/controllers/pos.controller.ts
import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.middleware";
import { POSService } from "../services/pos.service";

const ProcessSaleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().positive(),
        priceOverride: z.number().positive().optional(),
      })
    )
    .min(1, "Minimal satu item."),
  categoryId: z.string().min(1),
  note: z.string().max(200).optional(),
});

const HistorySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const POSController = {

  async processSale(req: AuthRequest, res: Response) {
    const parsed = ProcessSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const result = await POSService.processSale({
        userId: req.userId!,
        ...parsed.data,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },

  async getSaleHistory(req: AuthRequest, res: Response) {
    const parsed = HistorySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { page, limit, from, to } = parsed.data;
    const result = await POSService.getSaleHistory(req.userId!, {
      page,
      limit,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    res.json({ success: true, ...result });
  },
};

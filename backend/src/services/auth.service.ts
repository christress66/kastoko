// src/services/auth.service.ts
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { LedgerService } from "./ledger.service";

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? "12");
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES = "24h";

export interface TelegramInitData {
  telegramId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
}

export const AuthService = {
  /**
   * Verifikasi user berdasarkan Telegram ID.
   * Return null jika tidak ditemukan atau sudah expired.
   */
  async findActiveUser(telegramId: string) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: {
        id: true,
        telegramId: true,
        name: true,
        username: true,
        avatarUrl: true,
        isActive: true,
        memberSince: true,
        expiredAt: true,
        pinHash: true,
      },
    });

    if (!user) return null;
    if (!user.isActive) return null;
    if (user.expiredAt < new Date()) return null;

    return user;
  },

  /**
   * Verifikasi PIN 6 digit dan issue JWT token.
   */
  async verifyPin(
    telegramId: string,
    pin: string
  ): Promise<{ token: string; user: any } | null> {
    if (!/^\d{6}$/.test(pin)) {
      throw new Error("PIN harus 6 digit angka.");
    }

    const user = await AuthService.findActiveUser(telegramId);
    if (!user) {
      throw new Error("Akun tidak ditemukan atau masa aktif habis.");
    }

    const isValid = await bcrypt.compare(pin, user.pinHash);
    if (!isValid) return null;

    // Issue JWT (tidak mengandung PIN)
    const token = jwt.sign(
      { userId: user.id, telegramId: user.telegramId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const { pinHash, ...safeUser } = user;
    return { token, user: safeUser };
  },

  /**
   * Verifikasi JWT middleware helper.
   */
  verifyToken(token: string): { userId: string; telegramId: string } {
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch {
      throw new Error("Token tidak valid atau kadaluarsa.");
    }
  },

  // ─── Admin Operations ─────────────────────────────────────

  /**
   * Tambah user baru (hanya Admin).
   */
  async createUser(data: {
    telegramId: string;
    name: string;
    username?: string;
    pin: string;
    durationDays: number;
  }) {
    if (!/^\d{6}$/.test(data.pin)) {
      throw new Error("PIN harus 6 digit angka.");
    }

    const existing = await prisma.user.findUnique({
      where: { telegramId: data.telegramId },
    });
    if (existing) throw new Error("Telegram ID sudah terdaftar.");

    const pinHash = await bcrypt.hash(data.pin, BCRYPT_ROUNDS);
    const expiredAt = new Date();
    expiredAt.setDate(expiredAt.getDate() + data.durationDays);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          telegramId: data.telegramId,
          name: data.name,
          username: data.username,
          pinHash,
          expiredAt,
        },
      });

      // Seed unit types default
      await tx.unitType.createMany({
        data: [
          { userId: newUser.id, name: "Pcs" },
          { userId: newUser.id, name: "Dus" },
          { userId: newUser.id, name: "Pak" },
          { userId: newUser.id, name: "Lusin" },
          { userId: newUser.id, name: "Kg" },
          { userId: newUser.id, name: "Liter" },
        ],
      });

      return newUser;
    });

    // Seed default categories (outside tx for cleanliness)
    await LedgerService.seedDefaultCategories(user.id);

    return user;
  },

  /**
   * Reset PIN user (hanya Admin).
   */
  async resetPin(telegramId: string, newPin: string): Promise<void> {
    if (!/^\d{6}$/.test(newPin)) {
      throw new Error("PIN harus 6 digit angka.");
    }
    const pinHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { telegramId },
      data: { pinHash },
    });
  },

  /**
   * Perpanjang masa aktif (hanya Admin).
   */
  async extendMembership(
    telegramId: string,
    days: number
  ): Promise<Date> {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) throw new Error("User tidak ditemukan.");

    // Jika sudah expired, hitung dari sekarang. Jika belum, tambahkan dari expiredAt
    const base = user.expiredAt > new Date() ? user.expiredAt : new Date();
    const newExpiredAt = new Date(base);
    newExpiredAt.setDate(newExpiredAt.getDate() + days);

    await prisma.user.update({
      where: { telegramId },
      data: { expiredAt: newExpiredAt, notifiedH3: false },
    });

    return newExpiredAt;
  },

  /**
   * Hapus user beserta semua datanya (cascade via Prisma).
   */
  async deleteUser(telegramId: string): Promise<void> {
    await prisma.user.delete({ where: { telegramId } });
  },
};

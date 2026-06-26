// src/bot/index.ts
// ============================================================
// TELEGRAM BOT — Telegraf v4
// Handles: /start, admin commands, expiry notifications
// ============================================================

import { Telegraf, Markup, session, Context } from "telegraf";
import cron from "node-cron";
import { prisma } from "../db/prisma";
import { AuthService } from "../services/auth.service";
import { ExcelService } from "../services/excel.service";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const ADMIN_TG_ID = process.env.ADMIN_TELEGRAM_ID!;
const WEBAPP_URL = process.env.WEBAPP_URL!;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN tidak ditemukan di environment!");
if (!ADMIN_TG_ID) throw new Error("ADMIN_TELEGRAM_ID tidak ditemukan!");

export const bot = new Telegraf(BOT_TOKEN);

// ─── Admin guard middleware ───────────────────────────────
function isAdmin(ctx: Context): boolean {
  return String(ctx.from?.id) === String(ADMIN_TG_ID);
}

function requireAdmin(ctx: Context, next: () => Promise<void>) {
  if (!isAdmin(ctx)) {
    ctx.reply("⛔ Akses ditolak. Perintah ini hanya untuk Admin.");
    return;
  }
  return next();
}

// ─── /start ──────────────────────────────────────────────
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);
  const firstName = ctx.from.first_name;

  try {
    const user = await AuthService.findActiveUser(telegramId);

    if (!user) {
      // Cek apakah user ada tapi expired
      const expiredUser = await prisma.user.findUnique({
        where: { telegramId },
        select: { name: true, expiredAt: true, isActive: true },
      });

      if (expiredUser) {
        await ctx.reply(
          `⏰ *Masa aktif akun Anda telah habis.*\n\n` +
          `📅 Expired: *${expiredUser.expiredAt.toLocaleDateString("id-ID")}*\n\n` +
          `Hubungi owner untuk perpanjangan masa aktif.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.url("💬 Hubungi Owner", `https://t.me/${process.env.ADMIN_USERNAME ?? "owner"}`)],
            ]),
          }
        );
      } else {
        await ctx.reply(
          `❌ *Akun tidak terdaftar.*\n\n` +
          `Halo *${firstName}*! Telegram ID Anda belum terdaftar di sistem kami.\n\n` +
          `Hubungi owner untuk mendaftarkan akun Anda.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.url("💬 Hubungi Owner", `https://t.me/${process.env.ADMIN_USERNAME ?? "owner"}`)],
            ]),
          }
        );
      }
      return;
    }

    // User aktif — tampilkan tombol buka Web App
    const daysLeft = Math.ceil(
      (user.expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    await ctx.reply(
      `👋 Halo, *${user.name}*!\n\n` +
      `✅ Akun Anda aktif.\n` +
      `📅 Sisa masa aktif: *${daysLeft} hari*\n\n` +
      `Klik tombol di bawah untuk membuka aplikasi Kasir:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("🏪 Buka Kasir App", WEBAPP_URL)],
          [Markup.button.callback("📊 Export Laporan", "export_today")],
        ]),
      }
    );
  } catch (err) {
    console.error("[Bot /start error]", err);
    await ctx.reply("❌ Terjadi kesalahan. Coba lagi nanti.");
  }
});

// ─── Callback: Export Laporan ────────────────────────────
bot.action("export_today", async (ctx) => {
  await ctx.answerCbQuery("⏳ Menyiapkan laporan...");
  const telegramId = String(ctx.from?.id);

  const user = await AuthService.findActiveUser(telegramId);
  if (!user) {
    await ctx.reply("❌ Akun tidak ditemukan.");
    return;
  }

  try {
    await ctx.reply("⏳ Sedang generate laporan, harap tunggu...");
    await ExcelService.generateAndSend(user.id, telegramId, {
      label: "All Time",
    });
  } catch (err) {
    console.error("[Export error]", err);
    await ctx.reply("❌ Gagal generate laporan. Coba lagi.");
  }
});

// ─── ADMIN COMMANDS ──────────────────────────────────────

// /adduser <telegram_id> <name> <pin> <days>
bot.command("adduser", requireAdmin, async (ctx) => {
  const parts = ctx.message.text.split(" ").slice(1);
  if (parts.length < 4) {
    return ctx.reply(
      "❌ Format: `/adduser <telegram_id> <nama> <pin_6_digit> <durasi_hari>`\n" +
      "Contoh: `/adduser 123456789 Budi 123456 30`",
      { parse_mode: "Markdown" }
    );
  }

  const [telegramId, ...rest] = parts;
  const durationDays = parseInt(rest.pop()!);
  const pin = rest.pop()!;
  const name = rest.join(" ");

  if (isNaN(durationDays) || durationDays <= 0) {
    return ctx.reply("❌ Durasi harus berupa angka positif.");
  }

  try {
    const user = await AuthService.createUser({
      telegramId,
      name,
      pin,
      durationDays,
    });

    const expiredAt = user.expiredAt.toLocaleDateString("id-ID");
    await ctx.reply(
      `✅ *User berhasil ditambahkan!*\n\n` +
      `👤 Nama: *${name}*\n` +
      `🆔 Telegram ID: \`${telegramId}\`\n` +
      `📅 Aktif hingga: *${expiredAt}*\n` +
      `🔐 PIN: \`${pin}\``,
      { parse_mode: "Markdown" }
    );

    // Notifikasi ke user baru
    try {
      await bot.telegram.sendMessage(
        telegramId,
        `🎉 *Selamat datang di Kasir SaaS, ${name}!*\n\n` +
        `Akun Anda telah aktif selama *${durationDays} hari*.\n` +
        `Ketik /start untuk mulai menggunakan aplikasi.`,
        { parse_mode: "Markdown" }
      );
    } catch {
      // User mungkin belum start bot — abaikan error
    }
  } catch (err: any) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

// /resetpin <telegram_id> <new_pin>
bot.command("resetpin", requireAdmin, async (ctx) => {
  const parts = ctx.message.text.split(" ").slice(1);
  if (parts.length !== 2) {
    return ctx.reply("❌ Format: `/resetpin <telegram_id> <pin_baru>`", {
      parse_mode: "Markdown",
    });
  }

  const [telegramId, newPin] = parts;

  try {
    await AuthService.resetPin(telegramId, newPin);
    await ctx.reply(
      `✅ PIN berhasil direset.\n🆔 Telegram ID: \`${telegramId}\`\n🔐 PIN Baru: \`${newPin}\``,
      { parse_mode: "Markdown" }
    );

    try {
      await bot.telegram.sendMessage(
        telegramId,
        `🔐 *PIN Anda telah direset oleh Admin.*\n\nPIN baru Anda adalah: \`${newPin}\`\n_Segera ganti PIN melalui menu Profil._`,
        { parse_mode: "Markdown" }
      );
    } catch {}
  } catch (err: any) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

// /extend <telegram_id> <days>
bot.command("extend", requireAdmin, async (ctx) => {
  const parts = ctx.message.text.split(" ").slice(1);
  if (parts.length !== 2) {
    return ctx.reply("❌ Format: `/extend <telegram_id> <hari>`", {
      parse_mode: "Markdown",
    });
  }

  const [telegramId, daysStr] = parts;
  const days = parseInt(daysStr);

  if (isNaN(days) || days <= 0) {
    return ctx.reply("❌ Hari harus berupa angka positif.");
  }

  try {
    const newExpiredAt = await AuthService.extendMembership(telegramId, days);
    await ctx.reply(
      `✅ Membership diperpanjang *${days} hari*.\n📅 Baru expired: *${newExpiredAt.toLocaleDateString("id-ID")}*`,
      { parse_mode: "Markdown" }
    );

    try {
      await bot.telegram.sendMessage(
        telegramId,
        `✅ *Masa aktif Anda telah diperpanjang!*\n\n📅 Aktif hingga: *${newExpiredAt.toLocaleDateString("id-ID")}*`,
        { parse_mode: "Markdown" }
      );
    } catch {}
  } catch (err: any) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

// /deleteuser <telegram_id>
bot.command("deleteuser", requireAdmin, async (ctx) => {
  const parts = ctx.message.text.split(" ").slice(1);
  if (parts.length !== 1) {
    return ctx.reply("❌ Format: `/deleteuser <telegram_id>`", {
      parse_mode: "Markdown",
    });
  }

  const [telegramId] = parts;

  try {
    await AuthService.deleteUser(telegramId);
    await ctx.reply(
      `🗑 User \`${telegramId}\` dan semua datanya telah dihapus.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

// /listusers
bot.command("listusers", requireAdmin, async (ctx) => {
  const users = await prisma.user.findMany({
    select: {
      name: true,
      telegramId: true,
      isActive: true,
      expiredAt: true,
    },
    orderBy: { expiredAt: "asc" },
  });

  if (users.length === 0) {
    return ctx.reply("📭 Belum ada user terdaftar.");
  }

  const now = new Date();
  const lines = users.map((u) => {
    const daysLeft = Math.ceil(
      (u.expiredAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    const status =
      daysLeft > 3 ? "✅" : daysLeft > 0 ? "⚠️" : "❌";
    return `${status} *${u.name}* (\`${u.telegramId}\`) — ${daysLeft}h lagi`;
  });

  await ctx.reply(
    `👥 *Daftar User (${users.length})*\n\n${lines.join("\n")}`,
    { parse_mode: "Markdown" }
  );
});

// ─── CRON: Notifikasi Expiry ──────────────────────────────
// Jalankan setiap hari jam 09:00 WIB (02:00 UTC)
export function startCronJobs() {
  cron.schedule("0 2 * * *", async () => {
    console.log("[Cron] Checking expiry notifications...");

    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // H-3: Belum dinotifikasi & expired dalam 3 hari ke depan
    const soonToExpire = await prisma.user.findMany({
      where: {
        isActive: true,
        notifiedH3: false,
        expiredAt: { lte: in3Days, gt: now },
      },
    });

    for (const user of soonToExpire) {
      const daysLeft = Math.ceil(
        (user.expiredAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          `⚠️ *Pengingat Masa Aktif*\n\n` +
          `Halo *${user.name}*! Masa aktif akun Anda akan berakhir dalam *${daysLeft} hari*.\n\n` +
          `📅 Expired: *${user.expiredAt.toLocaleDateString("id-ID")}*\n\n` +
          `Segera hubungi owner untuk perpanjangan.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.url("💬 Hubungi Owner", `https://t.me/${process.env.ADMIN_USERNAME ?? "owner"}`)],
            ]),
          }
        );

        await prisma.user.update({
          where: { id: user.id },
          data: { notifiedH3: true },
        });

        console.log(`[Cron] H-3 notif sent to ${user.name} (${user.telegramId})`);
      } catch (err) {
        console.error(`[Cron] Failed to notify ${user.telegramId}:`, err);
      }
    }

    // Sudah expired hari ini
    const justExpired = await prisma.user.findMany({
      where: {
        isActive: true,
        expiredAt: { lte: now },
      },
    });

    for (const user of justExpired) {
      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          `❌ *Masa aktif akun Anda telah habis.*\n\n` +
          `Akses ke aplikasi Kasir SaaS tidak lagi tersedia.\n` +
          `Hubungi owner untuk melakukan perpanjangan.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.url("💬 Hubungi Owner", `https://t.me/${process.env.ADMIN_USERNAME ?? "owner"}`)],
            ]),
          }
        );

        // Deaktivasi user
        await prisma.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });

        // Notifikasi admin
        await bot.telegram.sendMessage(
          ADMIN_TG_ID,
          `🔔 User *${user.name}* (\`${user.telegramId}\`) telah expired dan dinonaktifkan.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error(`[Cron] Failed expiry process for ${user.telegramId}:`, err);
      }
    }
  });

  console.log("[Bot] Cron jobs started ✅");
}

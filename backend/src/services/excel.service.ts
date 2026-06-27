// src/services/excel.service.ts
// ============================================================
// Generate file .xlsx Buku Kas + Stok, kirim via Telegram Bot
// ============================================================

import ExcelJS from "exceljs";
import { prisma } from "../db/prisma";
import { LedgerType } from "@prisma/client";
import { bot } from "../bot";

// Warna tema (hex tanpa #)
const COLORS = {
  headerBg: "FF059669",   // Emerald
  headerFg: "FFFFFFFF",
  creditRow: "FFD1FAE5",  // Emerald-100
  debitRow: "FFFEE2E2",   // Red-100
  altRow: "FFF4F4F5",
  border: "FFE4E4E7",
  title: "FF18181B",
};

function applyHeaderStyle(
  row: ExcelJS.Row,
  bgColor: string,
  fgColor: string = COLORS.headerFg
) {
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    cell.font = { bold: true, color: { argb: fgColor }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: COLORS.border } },
    };
  });
  row.height = 30;
}

function formatRupiah(val: number): string {
  return `Rp ${val.toLocaleString("id-ID")}`;
}

export const ExcelService = {
  /**
   * Generate & kirim laporan lengkap ke Telegram user.
   */
  async generateAndSend(
    userId: string,
    telegramId: string,
    options: {
      from?: Date;
      to?: Date;
      label?: string; // e.g. "7 Hari Terakhir"
    } = {}
  ): Promise<void> {
    const { from, to, label = "All Time" } = options;
    const dateWhere =
      from || to
        ? {
            recordedAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {};

    // Ambil data secara paralel
    const [user, ledgerEntries, products, stockLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, memberSince: true, expiredAt: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { userId, ...dateWhere },
        orderBy: { recordedAt: "asc" },
        include: {
          category: { select: { name: true } },
          saleItems: {
            include: { product: { select: { name: true } } },
          },
        },
      }),
      prisma.product.findMany({
        where: { userId },
        include: { unitType: { select: { name: true } } },
      }),
      prisma.stockLog.findMany({
        where: {
          product: { userId },
          ...(from || to
            ? {
                recordedAt: {
                  ...(from && { gte: from }),
                  ...(to && { lte: to }),
                },
              }
            : {}),
        },
        orderBy: { recordedAt: "asc" },
        include: { product: { select: { name: true } } },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Kasir SaaS";
    wb.created = new Date();

    // ── Sheet 1: Info & Ringkasan ─────────────────────────
    const wsInfo = wb.addWorksheet("📊 Ringkasan", {
      properties: { tabColor: { argb: "FF059669" } },
    });
    wsInfo.columns = [
      { width: 30 },
      { width: 40 },
    ];

    const titleRow = wsInfo.addRow(["LAPORAN KEUANGAN KASIR SAAS", ""]);
    wsInfo.mergeCells("A1:B1");
    titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: COLORS.title } };
    titleRow.getCell(1).alignment = { horizontal: "center" };
    titleRow.height = 40;

    wsInfo.addRow(["Nama Toko", user?.name ?? "-"]);
    wsInfo.addRow(["Periode", label]);
    wsInfo.addRow(["Dari", from ? from.toLocaleDateString("id-ID") : "Semua"]);
    wsInfo.addRow(["Sampai", to ? to.toLocaleDateString("id-ID") : "Sekarang"]);
    wsInfo.addRow(["Digenerate", new Date().toLocaleString("id-ID")]);
    wsInfo.addRow([]); // spacer

    // Hitung ringkasan
    const totalCredit = ledgerEntries
      .filter((e) => e.type === LedgerType.CREDIT)
      .reduce((s, e) => s + e.amount.toNumber(), 0);
    const totalDebit = ledgerEntries
      .filter((e) => e.type === LedgerType.DEBIT)
      .reduce((s, e) => s + e.amount.toNumber(), 0);
    const lastBalance = ledgerEntries.at(-1)?.balanceAfter.toNumber() ?? 0;

    const summaryHeader = wsInfo.addRow(["RINGKASAN", ""]);
    wsInfo.mergeCells(`A${summaryHeader.number}:B${summaryHeader.number}`);
    applyHeaderStyle(summaryHeader, COLORS.headerBg);

    wsInfo.addRow(["Total Pemasukan (Credit)", formatRupiah(totalCredit)]);
    wsInfo.addRow(["Total Pengeluaran (Debit)", formatRupiah(totalDebit)]);
    wsInfo.addRow(["Saldo Akhir", formatRupiah(lastBalance)]);
    wsInfo.addRow(["Total Transaksi", ledgerEntries.length]);
    wsInfo.addRow(["Total Produk Aktif", products.filter((p) => p.isActive).length]);

    // ── Sheet 2: Buku Kas ─────────────────────────────────
    const wsKas = wb.addWorksheet("📒 Buku Kas", {
      properties: { tabColor: { argb: "FF059669" } },
    });
    wsKas.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Tanggal & Waktu", key: "date", width: 22 },
      { header: "Jenis", key: "type", width: 10 },
      { header: "Kategori", key: "category", width: 25 },
      { header: "Keterangan", key: "desc", width: 35 },
      { header: "Masuk (Rp)", key: "credit", width: 18 },
      { header: "Keluar (Rp)", key: "debit", width: 18 },
      { header: "Saldo (Rp)", key: "balance", width: 18 },
    ];

    applyHeaderStyle(wsKas.getRow(1), COLORS.headerBg);

    ledgerEntries.forEach((entry, i) => {
      const isCredit = entry.type === LedgerType.CREDIT;
      const row = wsKas.addRow({
        no: i + 1,
        date: entry.recordedAt.toLocaleString("id-ID", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        type: isCredit ? "MASUK ✅" : "KELUAR ❌",
        category: entry.category.name,
        desc: entry.description ?? (entry.saleItems.length > 0
          ? entry.saleItems.map((si) => `${si.product.name} x${si.qty}`).join(", ")
          : "-"),
        credit: isCredit ? entry.amount.toNumber() : 0,
        debit: !isCredit ? entry.amount.toNumber() : 0,
        balance: entry.balanceAfter.toNumber(),
      });

      // Row color coding
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isCredit ? COLORS.creditRow : COLORS.debitRow },
        };
        cell.alignment = { vertical: "middle" };
      });

      // Format angka sebagai currency
      ["credit", "debit", "balance"].forEach((key) => {
        const cell = row.getCell(key);
        cell.numFmt = '#,##0;[Red]-#,##0';
      });
    });

    wsKas.autoFilter = { from: "A1", to: "H1" };
    wsKas.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // ── Sheet 3: Inventaris Produk ────────────────────────
    const wsProd = wb.addWorksheet("📦 Produk", {
      properties: { tabColor: { argb: "FF3B82F6" } },
    });
    wsProd.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Nama Produk", key: "name", width: 30 },
      { header: "Kategori", key: "cat", width: 20 },
      { header: "Satuan", key: "unit", width: 10 },
      { header: "Harga Modal (Rp)", key: "buy", width: 18 },
      { header: "Harga Jual (Rp)", key: "sell", width: 18 },
      { header: "Profit/Unit (Rp)", key: "profit", width: 18 },
      { header: "Margin (%)", key: "margin", width: 12 },
      { header: "Stok", key: "stock", width: 8 },
      { header: "Status", key: "status", width: 10 },
    ];

    applyHeaderStyle(wsProd.getRow(1), "FF3B82F6");

    products.forEach((p, i) => {
      const buyPrice = p.buyPrice.toNumber();
      const sellPrice = p.sellPrice.toNumber();
      const profit = sellPrice - buyPrice;
      const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

      const row = wsProd.addRow({
        no: i + 1,
        name: p.name,
        cat: p.categoryName ?? "-",
        unit: p.unitType.name,
        buy: buyPrice,
        sell: sellPrice,
        profit,
        margin: parseFloat(margin.toFixed(2)),
        stock: p.stock,
        status: p.isActive ? "Aktif ✅" : "Non-Aktif",
      });

      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : COLORS.altRow },
        };
        cell.alignment = { vertical: "middle" };
      });

      ["buy", "sell", "profit"].forEach((k) => {
        row.getCell(k).numFmt = '#,##0;[Red]-#,##0';
      });
      row.getCell("margin").numFmt = "0.00%";
    });

    wsProd.autoFilter = { from: "A1", to: "J1" };
    wsProd.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // ── Sheet 4: Log Stok ─────────────────────────────────
    const wsStock = wb.addWorksheet("🔄 Log Stok", {
      properties: { tabColor: { argb: "FFF59E0B" } },
    });
    wsStock.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "Tanggal & Waktu", key: "date", width: 22 },
      { header: "Produk", key: "product", width: 30 },
      { header: "Perubahan Qty", key: "change", width: 15 },
      { header: "Stok Setelah", key: "after", width: 12 },
      { header: "Alasan", key: "reason", width: 18 },
      { header: "Catatan", key: "note", width: 30 },
    ];

    applyHeaderStyle(wsStock.getRow(1), "FFF59E0B", "FF000000");

    stockLogs.forEach((log, i) => {
      const row = wsStock.addRow({
        no: i + 1,
        date: log.recordedAt.toLocaleString("id-ID"),
        product: log.product.name,
        change: log.changeQty > 0 ? `+${log.changeQty}` : log.changeQty,
        after: log.stockAfter,
        reason: log.reason,
        note: log.note ?? "-",
      });

      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : COLORS.altRow },
        };
        cell.alignment = { vertical: "middle" };
      });
    });

    wsStock.autoFilter = { from: "A1", to: "G1" };
    wsStock.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // ── Kirim ke Telegram ─────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const now = new Date();
    const filename = `Laporan_Keuangan_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;

    await bot.telegram.sendDocument(
      telegramId,
      {
        source: Buffer.from(buffer),
        filename,
      },
      {
        caption:
          `📊 *Laporan Keuangan Kasir SaaS*\n` +
          `📅 Periode: *${label}*\n` +
          `🏪 Toko: *${user?.name ?? "-"}*\n` +
          `⏰ Generated: ${now.toLocaleString("id-ID")}\n\n` +
          `_File berisi 4 sheet: Ringkasan, Buku Kas, Produk, dan Log Stok._`,
        parse_mode: "Markdown",
      }
    );
  },
};

"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, TrendingUp, TrendingDown, Wallet,
  ChevronDown, Search, Filter, Send, X,
  ArrowUpRight, ArrowDownLeft, Clock, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { LedgerAPI, formatRupiah } from "@/lib/api";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────
interface LedgerEntry {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  balanceAfter: number;
  description?: string;
  recordedAt: string;
  category: { name: string; type: string };
  saleItems: { product: { name: string }; qty: number }[];
}

interface Category {
  id: string;
  name: string;
  type: "CREDIT" | "DEBIT";
}

// ─── Filter options ────────────────────────────────────────
const TIME_FILTERS = [
  { label: "Hari Ini", days: 0 },
  { label: "3 Hari", days: 3 },
  { label: "7 Hari", days: 7 },
  { label: "1 Bulan", days: 30 },
  { label: "Semua", days: -1 },
];

// ─── Balance Card ──────────────────────────────────────────
function BalanceCard({
  balance,
  isLoading,
}: {
  balance: number;
  isLoading: boolean;
}) {
  return (
    <div className="mx-4 mt-4 card p-5 bg-gradient-to-br from-bg-card to-bg-elevated relative overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-accent/5 blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between mb-1">
        <p className="text-text-muted text-xs font-medium uppercase tracking-wider">
          Saldo Toko
        </p>
        <Wallet className="w-4 h-4 text-text-muted" />
      </div>

      {isLoading ? (
        <div className="skeleton h-9 w-44 rounded-lg mt-2" />
      ) : (
        <p className="text-3xl font-bold text-text-primary mt-2 font-mono">
          {formatRupiah(balance)}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <p className="text-text-muted text-xs">Real-time · Update otomatis</p>
      </div>
    </div>
  );
}

// ─── Transaction Item ──────────────────────────────────────
function TransactionItem({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.type === "CREDIT";
  const desc =
    entry.description ||
    (entry.saleItems.length > 0
      ? entry.saleItems.map((si) => `${si.product.name} ×${si.qty}`).join(", ")
      : entry.category.name);

  const date = new Date(entry.recordedAt);

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-bg-elevated transition-colors">
      {/* Icon */}
      <div
        className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${isCredit ? "bg-success-bg" : "bg-danger-bg"}
        `}
      >
        {isCredit ? (
          <ArrowDownLeft className="w-5 h-5 text-success-text" />
        ) : (
          <ArrowUpRight className="w-5 h-5 text-danger-text" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {desc}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-muted truncate">
            {entry.category.name}
          </span>
          <span className="text-text-disabled text-xs">·</span>
          <span className="text-xs text-text-disabled flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {format(date, "HH:mm", { locale: localeId })}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold font-mono ${isCredit ? "amount-credit" : "amount-debit"}`}>
          {isCredit ? "+" : "-"}
          {formatRupiah(entry.amount, true)}
        </p>
        <p className="text-xs text-text-disabled font-mono mt-0.5">
          {formatRupiah(entry.balanceAfter, true)}
        </p>
      </div>
    </div>
  );
}

// ─── Add Transaction Sheet ─────────────────────────────────
function AddTransactionSheet({
  onClose,
  categories,
  onSuccess,
}: {
  onClose: () => void;
  categories: Category[];
  onSuccess: () => void;
}) {
  const [txType, setTxType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const filteredCategories = categories.filter((c) => c.type === txType);

  const mutation = useMutation({
    mutationFn: (data: any) => LedgerAPI.createEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      toast.success("Transaksi berhasil dicatat!");
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? "Gagal mencatat transaksi.");
    },
  });

  const handleSubmit = () => {
    const amountNum = parseFloat(amount.replace(/\D/g, ""));
    if (!amountNum || amountNum <= 0) {
      toast.error("Masukkan jumlah yang valid.");
      return;
    }
    if (!categoryId) {
      toast.error("Pilih kategori transaksi.");
      return;
    }
    mutation.mutate({
      type: txType,
      amount: amountNum,
      categoryId,
      description,
      refType: "MANUAL_INCOME",
    });
  };

  // Format angka saat input
  const handleAmountChange = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    if (!numeric) { setAmount(""); return; }
    setAmount(parseInt(numeric).toLocaleString("id-ID"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full bg-bg-card border-t border-border rounded-t-2xl animate-slide-up safe-bottom">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">Catat Transaksi</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="px-4 pb-6 space-y-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-bg-base rounded-xl">
            {(["CREDIT", "DEBIT"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTxType(t); setCategoryId(""); }}
                className={`
                  py-2.5 rounded-lg text-sm font-semibold transition-all duration-200
                  ${txType === t
                    ? t === "CREDIT"
                      ? "bg-success-bg text-success-text shadow-sm"
                      : "bg-danger-bg text-danger-text shadow-sm"
                    : "text-text-muted"
                  }
                `}
              >
                {t === "CREDIT" ? "💰 Pemasukan" : "💸 Pengeluaran"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5">
              Jumlah (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm font-medium">
                Rp
              </span>
              <input
                type="tel"
                placeholder="0"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="input-field pl-10 text-lg font-bold font-mono"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5">
              Kategori
            </label>
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input-field appearance-none pr-10 cursor-pointer"
              >
                <option value="">Pilih kategori...</option>
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5">
              Keterangan (opsional)
            </label>
            <input
              type="text"
              placeholder="Tambahkan catatan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Simpan Transaksi
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function BukuKasPage() {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState(0);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [page, setPage] = useState(1);

  // Build date range from active filter
  const getDateRange = useCallback(() => {
    const days = TIME_FILTERS[activeFilter].days;
    if (days === -1) return {};
    if (days === 0)
      return {
        from: startOfDay(new Date()).toISOString(),
        to: endOfDay(new Date()).toISOString(),
      };
    return {
      from: startOfDay(subDays(new Date(), days)).toISOString(),
      to: endOfDay(new Date()).toISOString(),
    };
  }, [activeFilter]);

  // ── Queries ──────────────────────────────────────────────
  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: () => LedgerAPI.getBalance().then((r) => r.data.data.balance),
    refetchInterval: 30000, // Refresh tiap 30 detik
  });

  const ledgerQuery = useQuery({
    queryKey: ["ledger", activeFilter, page],
    queryFn: () =>
      LedgerAPI.getHistory({ ...getDateRange(), page, limit: 20 }).then(
        (r) => r.data
      ),
    staleTime: 10000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => LedgerAPI.getCategories().then((r) => r.data.data),
    staleTime: 60000,
  });

  const entries: LedgerEntry[] = ledgerQuery.data?.data ?? [];
  const meta = ledgerQuery.data?.meta;

  // ── Export ───────────────────────────────────────────────
  const handleExport = async () => {
    toast.loading("Menyiapkan laporan...", { id: "export" });
    try {
      const range = getDateRange();
      await LedgerAPI.exportExcel({
        ...range,
        label: TIME_FILTERS[activeFilter].label,
      });
      toast.success("Laporan dikirim ke Telegram Anda!", { id: "export" });
    } catch {
      toast.error("Gagal export laporan.", { id: "export" });
    }
  };

  // Group entries by date
  const groupedEntries = entries.reduce<Record<string, LedgerEntry[]>>(
    (acc, entry) => {
      const dateKey = format(new Date(entry.recordedAt), "dd MMMM yyyy", {
        locale: localeId,
      });
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(entry);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-full">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-bg-base/95 backdrop-blur-sm border-b border-border px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Buku Kas</h1>
            <p className="text-xs text-text-muted">Arus Kas Toko</p>
          </div>
          <button
            onClick={handleExport}
            className="w-9 h-9 rounded-xl bg-bg-card border border-border flex items-center justify-center hover:bg-bg-elevated transition-colors"
          >
            <Download className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* ── Balance Card ──────────────────────────────────── */}
      <BalanceCard
        balance={balanceQuery.data ?? 0}
        isLoading={balanceQuery.isLoading}
      />

      {/* ── Quick Stats ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-3">
        <div className="card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-success-bg flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-success-text" />
            </div>
            <p className="text-xs text-text-muted font-medium">Pemasukan</p>
          </div>
          {ledgerQuery.isLoading ? (
            <div className="skeleton h-5 w-24 rounded" />
          ) : (
            <p className="text-sm font-bold font-mono text-success-text">
              {formatRupiah(
                entries
                  .filter((e) => e.type === "CREDIT")
                  .reduce((s, e) => s + Number(e.amount), 0),
                true
              )}
            </p>
          )}
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-danger-bg flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5 text-danger-text" />
            </div>
            <p className="text-xs text-text-muted font-medium">Pengeluaran</p>
          </div>
          {ledgerQuery.isLoading ? (
            <div className="skeleton h-5 w-24 rounded" />
          ) : (
            <p className="text-sm font-bold font-mono text-danger-text">
              {formatRupiah(
                entries
                  .filter((e) => e.type === "DEBIT")
                  .reduce((s, e) => s + Number(e.amount), 0),
                true
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Time Filter ───────────────────────────────────── */}
      <div className="flex gap-2 px-4 mt-4 overflow-x-auto scrollbar-none pb-1">
        {TIME_FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => { setActiveFilter(i); setPage(1); }}
            className={`
              flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium
              transition-all duration-150
              ${activeFilter === i
                ? "bg-accent text-white"
                : "bg-bg-card border border-border text-text-muted hover:text-text-secondary"
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Transaction List ──────────────────────────────── */}
      <div className="mx-4 mt-4 card overflow-hidden">
        {ledgerQuery.isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="skeleton h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-border flex items-center justify-center mb-3">
              <BookOpenIcon />
            </div>
            <p className="text-text-secondary font-medium mb-1">
              Belum ada transaksi
            </p>
            <p className="text-text-muted text-sm">
              Tap tombol + untuk mencatat transaksi pertama
            </p>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, items]) => (
            <div key={date}>
              {/* Date group header */}
              <div className="px-4 py-2 bg-bg-elevated border-b border-border">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {date}
                </p>
              </div>
              {items.map((entry) => (
                <TransactionItem key={entry.id} entry={entry} />
              ))}
            </div>
          ))
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs text-text-muted disabled:opacity-40 hover:text-text-secondary transition-colors"
            >
              ← Sebelumnya
            </button>
            <span className="text-xs text-text-muted">
              {page} / {meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="text-xs text-text-muted disabled:opacity-40 hover:text-text-secondary transition-colors"
            >
              Berikutnya →
            </button>
          </div>
        )}
      </div>

      {/* Spacing for FAB */}
      <div className="h-6" />

      {/* ── FAB ──────────────────────────────────────────── */}
      <button
        onClick={() => setShowAddSheet(true)}
        className="
          fixed right-4 bottom-24 z-40
          w-14 h-14 rounded-2xl bg-accent
          flex items-center justify-center
          shadow-glow transition-all duration-200
          active:scale-95 hover:bg-accent-hover
        "
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </button>

      {/* ── Add Transaction Sheet ─────────────────────────── */}
      {showAddSheet && (
        <AddTransactionSheet
          onClose={() => setShowAddSheet(false)}
          categories={categoriesQuery.data ?? []}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["balance"] });
          }}
        />
      )}
    </div>
  );
}

// Inline SVG to avoid extra import
function BookOpenIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

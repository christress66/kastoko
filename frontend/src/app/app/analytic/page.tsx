"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Package, Wallet,
  BarChart3, Percent, Download, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { LedgerAPI, formatRupiah } from "@/lib/api";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { useAuthStore } from "@/store/auth.store";

const TIME_PRESETS = [
  { label: "1H", days: 1 },
  { label: "3H", days: 3 },
  { label: "7H", days: 7 },
  { label: "1B", days: 30 },
  { label: "ALL", days: -1 },
];

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warning";
  isLoading?: boolean;
}

function MetricCard({ label, value, sub, icon, variant = "default", isLoading }: MetricCardProps) {
  const variantClasses = {
    default: "bg-bg-card border-border",
    success: "bg-success-bg border-success-DEFAULT/20",
    danger: "bg-danger-bg border-danger-DEFAULT/20",
    warning: "bg-warning-bg border-warning-DEFAULT/20",
  };

  const textClasses = {
    default: "text-text-primary",
    success: "text-success-text",
    danger: "text-danger-text",
    warning: "text-warning-text",
  };

  return (
    <div className={`card p-4 ${variantClasses[variant]}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center">
          {icon}
        </div>
      </div>
      {isLoading ? (
        <div className="skeleton h-6 w-28 rounded" />
      ) : (
        <p className={`text-xl font-bold font-mono ${textClasses[variant]}`}>
          {value}
        </p>
      )}
      {sub && !isLoading && (
        <p className="text-xs text-text-muted mt-1">{sub}</p>
      )}
    </div>
  );
}

export default function AnalyticPage() {
  const user = useAuthStore((s) => s.user);
  const [activePreset, setActivePreset] = useState(4); // ALL default

  const getDateRange = () => {
    const days = TIME_PRESETS[activePreset].days;
    if (days === -1) return {};
    return {
      from: startOfDay(subDays(new Date(), days)).toISOString(),
      to: endOfDay(new Date()).toISOString(),
    };
  };

  const analyticsQuery = useQuery({
    queryKey: ["analytics", activePreset],
    queryFn: () =>
      LedgerAPI.getAnalytics(getDateRange()).then((r) => r.data.data),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const data = analyticsQuery.data;
  const isLoading = analyticsQuery.isLoading;

  const handleExport = async () => {
    toast.loading("Menyiapkan laporan...", { id: "export" });
    try {
      await LedgerAPI.exportExcel({
        ...getDateRange(),
        label: TIME_PRESETS[activePreset].label,
      });
      toast.success("Laporan dikirim ke Telegram!", { id: "export" });
    } catch {
      toast.error("Gagal export.", { id: "export" });
    }
  };

  // Membership info
  const daysLeft = user?.daysLeft ?? 0;
  const memberBadgeColor = daysLeft > 7 ? "text-success-text bg-success-bg" : daysLeft > 0 ? "text-warning-text bg-warning-bg" : "text-danger-text bg-danger-bg";

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-base/95 backdrop-blur-sm border-b border-border px-4 py-3 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Analytic</h1>
            <p className="text-xs text-text-muted">Performa Toko Real-time</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Time filter */}
      <div className="flex gap-1.5 px-4 mt-4">
        {TIME_PRESETS.map((preset, i) => (
          <button
            key={preset.label}
            onClick={() => setActivePreset(i)}
            className={`
              flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150
              ${activePreset === i
                ? "bg-accent text-white"
                : "bg-bg-card border border-border text-text-muted"
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 px-4 mt-4">
        <MetricCard
          label="Saldo Saat Ini"
          value={data ? formatRupiah(data.currentBalance, true) : "—"}
          icon={<Wallet className="w-3.5 h-3.5 text-text-muted" />}
          isLoading={isLoading}
        />

        <MetricCard
          label="Total Omset"
          value={data ? formatRupiah(data.totalRevenue, true) : "—"}
          sub={`${data?.totalItemsSold ?? 0} item terjual`}
          variant="success"
          icon={<TrendingUp className="w-3.5 h-3.5 text-success-text" />}
          isLoading={isLoading}
        />

        <MetricCard
          label="Total Pengeluaran"
          value={data ? formatRupiah(data.totalExpense, true) : "—"}
          variant="danger"
          icon={<TrendingDown className="w-3.5 h-3.5 text-danger-text" />}
          isLoading={isLoading}
        />

        <MetricCard
          label="Profit Bersih"
          value={data ? formatRupiah(data.netProfit, true) : "—"}
          variant={data && data.netProfit >= 0 ? "success" : "danger"}
          icon={<BarChart3 className="w-3.5 h-3.5 text-success-text" />}
          isLoading={isLoading}
        />
      </div>

      {/* Margin bar */}
      <div className="mx-4 mt-3 card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-accent" />
            <p className="text-sm font-semibold text-text-primary">Margin Kotor</p>
          </div>
          <p className="text-sm font-bold font-mono text-accent">
            {isLoading ? "..." : `${data?.margin?.toFixed(1) ?? 0}%`}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-bg-base rounded-full overflow-hidden">
          {!isLoading && (
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${Math.min(data?.margin ?? 0, 100)}%` }}
            />
          )}
        </div>

        <div className="flex justify-between mt-2">
          <p className="text-xs text-text-muted">0%</p>
          <p className="text-xs text-text-muted">100%</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="mx-4 mt-3 card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-text-primary">Rincian Keuangan</p>
        </div>

        {[
          {
            label: "Total Pemasukan",
            value: data?.totalRevenue ?? 0,
            color: "text-success-text",
            bg: "bg-success-bg",
          },
          {
            label: "Modal Produk Terjual (COGS)",
            value: data?.totalCogs ?? 0,
            color: "text-text-secondary",
            bg: "bg-bg-elevated",
          },
          {
            label: "Laba Kotor",
            value: data?.grossProfit ?? 0,
            color: "text-accent",
            bg: "bg-accent/10",
          },
          {
            label: "Biaya Operasional",
            value: data?.totalExpense ?? 0,
            color: "text-danger-text",
            bg: "bg-danger-bg",
          },
          {
            label: "Laba Bersih",
            value: data?.netProfit ?? 0,
            color: (data?.netProfit ?? 0) >= 0 ? "text-success-text" : "text-danger-text",
            bg: (data?.netProfit ?? 0) >= 0 ? "bg-success-bg" : "bg-danger-bg",
          },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
            <p className="text-sm text-text-secondary">{label}</p>
            {isLoading ? (
              <div className="skeleton h-4 w-20 rounded" />
            ) : (
              <p className={`text-sm font-semibold font-mono ${color}`}>
                {formatRupiah(value, true)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Profile / Membership */}
      <div className="mx-4 mt-3 card p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Info Membership</p>
            <p className="text-xs text-text-muted mt-0.5">
              Bergabung:{" "}
              {user?.memberSince
                ? new Date(user.memberSince).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${memberBadgeColor}`}>
            {daysLeft > 0 ? `${daysLeft} hari` : "Habis"}
          </span>
        </div>

        <div className="divider" />

        <a
          href={`https://t.me/${process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "owner"}`}
          className="flex items-center justify-between text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>Ubah PIN</span>
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

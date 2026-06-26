"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, MessageCircle, ChevronRight, AlertCircle, CheckCircle } from "lucide-react";
import { AuthAPI } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

// ─── Types ────────────────────────────────────────────────
type AccountStatus = "loading" | "NOT_REGISTERED" | "EXPIRED" | "ACTIVE" | "error";

interface TelegramUserInfo {
  id?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  daysLeft?: number;
  expiredAt?: string;
}

// ─── Numpad keys layout ───────────────────────────────────
const NUMPAD: (string | null)[] = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  null, "0", "⌫",
];

// ─── Component ────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [status, setStatus] = useState<AccountStatus>("loading");
  const [tgUser, setTgUser] = useState<TelegramUserInfo>({});
  const [pin, setPin] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [shakePin, setShakePin] = useState(false);
  const [initDataRaw, setInitDataRaw] = useState<string>("");

  const ADMIN_TG_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "owner";

  // ── Init Telegram Web App ────────────────────────────────
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#09090b");
      tg.setBackgroundColor("#09090b");
    }

    const rawData = tg?.initData ?? "";
    setInitDataRaw(rawData);

    // Di development tanpa Telegram, gunakan mock data
    if (!rawData && process.env.NODE_ENV === "development") {
      setStatus("ACTIVE");
      setTgUser({
        name: "Developer Mode",
        username: "dev",
        avatarUrl: undefined,
        daysLeft: 30,
      });
      return;
    }

    if (!rawData) {
      setStatus("error");
      return;
    }

    // Check account status
    AuthAPI.checkStatus(rawData)
      .then((res) => {
        const data = res.data;
        setStatus(data.status);
        if (data.telegramUser) {
          setTgUser({
            id: data.telegramUser.id,
            name: data.telegramUser.name ?? data.telegramUser.first_name,
            username: data.telegramUser.username,
            avatarUrl: data.telegramUser.avatarUrl ?? data.telegramUser.photo_url,
            daysLeft: data.telegramUser.daysLeft,
            expiredAt: data.telegramUser.expiredAt,
          });
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  // ── PIN logic ─────────────────────────────────────────────
  const handleNumpad = useCallback(
    (key: string) => {
      if (isVerifying) return;
      setErrorMsg("");

      if (key === "⌫") {
        setPin((p) => p.slice(0, -1));
        return;
      }

      if (pin.length >= 6) return;
      const next = pin + key;
      setPin(next);

      // Auto-submit pada 6 digit
      if (next.length === 6) {
        submitPin(next);
      }
    },
    [pin, isVerifying] // eslint-disable-line
  );

  const submitPin = async (pinValue: string) => {
    setIsVerifying(true);
    try {
      const res = await AuthAPI.login(initDataRaw, pinValue);
      const { token, user } = res.data.data;

      setAuth(token, {
        id: String(user.telegramId),
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        daysLeft: tgUser.daysLeft,
        memberSince: user.memberSince,
        expiredAt: user.expiredAt,
      });

      router.replace("/app/kas");
    } catch (err: any) {
      const msg =
        err.response?.data?.error ?? "PIN salah. Coba lagi.";
      setErrorMsg(msg);
      setPin("");
      setShakePin(true);
      setTimeout(() => setShakePin(false), 600);
    } finally {
      setIsVerifying(false);
    }
  };

  // ─── Render: Loading ──────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-text-muted text-sm">Memuat...</p>
        </div>
      </div>
    );
  }

  // ─── Render: Not Registered / Expired / Error ─────────────
  if (status === "NOT_REGISTERED" || status === "EXPIRED" || status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-bg-base px-6 gap-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-danger-bg border border-danger/30 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-danger-text" />
        </div>

        <div className="text-center">
          <h1 className="text-xl font-bold text-text-primary mb-2">
            {status === "NOT_REGISTERED"
              ? "Akun Tidak Terdaftar"
              : status === "EXPIRED"
              ? "Masa Aktif Habis"
              : "Tidak Dapat Terhubung"}
          </h1>
          <p className="text-text-muted text-sm leading-relaxed">
            {status === "NOT_REGISTERED"
              ? `Telegram ID Anda belum terdaftar di sistem Kasir SaaS.`
              : status === "EXPIRED"
              ? `Masa aktif akun Anda telah berakhir. Hubungi owner untuk perpanjangan.`
              : "Pastikan Anda membuka aplikasi melalui bot Telegram."}
          </p>
          {status === "EXPIRED" && tgUser.expiredAt && (
            <p className="text-danger-text text-xs mt-2">
              Expired:{" "}
              {new Date(tgUser.expiredAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        {status !== "error" && (
          <a
            href={`https://t.me/${ADMIN_TG_USERNAME}`}
            className="btn-primary w-full max-w-xs flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Hubungi Owner
          </a>
        )}
      </div>
    );
  }

  // ─── Render: Active — PIN Input ───────────────────────────
  return (
    <div className="flex flex-col min-h-dvh bg-bg-base animate-fade-in">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-14 pb-8 px-6">
        {/* Avatar */}
        <div className="relative mb-4">
          {tgUser.avatarUrl ? (
            <img
              src={tgUser.avatarUrl}
              alt={tgUser.name}
              className="w-20 h-20 rounded-full border-2 border-border object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center">
              <span className="text-2xl font-bold text-accent">
                {tgUser.name?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
          )}
          {/* Online indicator */}
          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-accent rounded-full border-2 border-bg-base" />
        </div>

        {/* Name & username */}
        <h1 className="text-xl font-bold text-text-primary">
          {tgUser.name ?? "Pengguna"}
        </h1>
        {tgUser.username && (
          <p className="text-text-muted text-sm mt-0.5">@{tgUser.username}</p>
        )}

        {/* Membership badge */}
        {tgUser.daysLeft !== undefined && (
          <div className="mt-3 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-medium text-accent">
              Aktif · {tgUser.daysLeft} hari tersisa
            </span>
          </div>
        )}
      </div>

      {/* ── PIN Section ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-6">
        <div className="flex items-center gap-1.5 mb-2">
          <Lock className="w-4 h-4 text-text-muted" />
          <p className="text-text-muted text-sm font-medium">Masukkan PIN 6 Digit</p>
        </div>

        {/* PIN Dots */}
        <div
          className={`flex gap-3 my-6 transition-transform ${
            shakePin ? "animate-[shake_0.5s_ease-in-out]" : ""
          }`}
          style={
            shakePin
              ? {
                  animation:
                    "shake 0.5s cubic-bezier(.36,.07,.19,.97) both",
                }
              : {}
          }
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`pin-dot ${i < pin.length ? "filled" : ""} ${
                isVerifying && i < pin.length
                  ? "bg-warning-DEFAULT border-warning-DEFAULT"
                  : ""
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-6 flex items-center justify-center mb-4">
          {errorMsg && (
            <p className="text-danger-text text-sm flex items-center gap-1.5 animate-fade-in">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {errorMsg}
            </p>
          )}
          {isVerifying && (
            <p className="text-text-muted text-sm animate-pulse">
              Memverifikasi...
            </p>
          )}
        </div>

        {/* Numpad */}
        <div className="w-full max-w-xs grid grid-cols-3 gap-2">
          {NUMPAD.map((key, i) => {
            if (key === null) {
              return <div key={i} />;
            }

            const isBackspace = key === "⌫";

            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleNumpad(key);
                }}
                disabled={isVerifying}
                className={`
                  relative h-16 rounded-xl font-medium text-xl
                  flex items-center justify-center
                  transition-all duration-100 select-none
                  active:scale-95 disabled:opacity-50
                  ${isBackspace
                    ? "bg-bg-card border border-border text-text-muted hover:bg-bg-elevated"
                    : "bg-bg-card border border-border text-text-primary hover:bg-bg-elevated hover:border-border-subtle"
                  }
                `}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Forgot PIN */}
        <a
          href={`https://t.me/${ADMIN_TG_USERNAME}`}
          className="mt-8 flex items-center gap-1.5 text-text-muted text-sm hover:text-text-secondary transition-colors"
        >
          Lupa PIN? Hubungi Admin
          <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="pb-8 safe-bottom text-center">
        <p className="text-text-disabled text-xs">Kasir SaaS · v1.0</p>
      </div>

      {/* Shake keyframe */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

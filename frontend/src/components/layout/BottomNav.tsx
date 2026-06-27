"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Package, Zap, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/app/kas",
    label: "Buku Kas",
    icon: BookOpen,
  },
  {
    href: "/app/produk",
    label: "Produk",
    icon: Package,
  },
  {
    href: "/app/pos",
    label: "Cepat",
    icon: Zap,
    highlight: true,
  },
  {
    href: "/app/analytic",
    label: "Analytic",
    icon: BarChart3,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-card border-t border-border safe-bottom">
      <div className="grid grid-cols-4 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
          const isActive = pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`bottom-nav-item ${isActive ? "active" : ""}`}
            >
              {/* POS button gets special treatment */}
              {highlight ? (
                <div
                  className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center
                    transition-all duration-200
                    ${isActive
                      ? "bg-accent shadow-glow"
                      : "bg-bg-elevated border border-border"
                    }
                  `}
                >
                  <Icon
                    className={`w-5 h-5 ${isActive ? "text-white" : "text-text-muted"}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
              ) : (
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive ? "text-accent" : "text-text-muted"
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              )}
              <span
                className={`text-[10px] font-medium transition-colors leading-none ${
                  isActive ? "text-accent" : "text-text-muted"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

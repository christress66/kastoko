"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, ShoppingCart, Plus, Minus, Trash2,
  Zap, Package, CheckCircle, X, ChevronDown,
  Receipt,
} from "lucide-react";
import toast from "react-hot-toast";
import { ProductAPI, POSAPI, LedgerAPI, formatRupiah } from "@/lib/api";
import { EmptyState, SkeletonList } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  imageUrl?: string;
  categoryName?: string;
  unitType: { id: string; name: string };
  sellPrice: number;
  buyPrice: number;
  stock: number;
}

interface CartItem {
  product: Product;
  qty: number;
  priceOverride: number; // allows per-item price edit
}

// ─── Product Card for POS ─────────────────────────────────
function POSProductCard({
  product,
  qtyInCart,
  onAdd,
}: {
  product: Product;
  qtyInCart: number;
  onAdd: (product: Product) => void;
}) {
  const isOutOfStock = product.stock === 0;
  const isMaxed = qtyInCart >= product.stock;

  return (
    <button
      onClick={() => !isMaxed && !isOutOfStock && onAdd(product)}
      disabled={isMaxed || isOutOfStock}
      className={`
        card p-3 text-left transition-all duration-150 w-full
        ${qtyInCart > 0 ? "border-accent/40 bg-accent/5 shadow-glow/50" : ""}
        ${isMaxed || isOutOfStock ? "opacity-50 cursor-not-allowed" : "active:scale-95 hover:border-border-subtle"}
      `}
    >
      {/* Product image */}
      <div className="relative mb-2">
        <div className="w-full aspect-square rounded-lg bg-bg-elevated border border-border flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-8 h-8 text-text-muted" />
          )}
        </div>
        {/* Cart badge */}
        {qtyInCart > 0 && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{qtyInCart}</span>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight mb-1">
        {product.name}
      </p>
      <p className="text-sm font-bold font-mono text-accent">
        {formatRupiah(product.sellPrice, true)}
      </p>
      <p className="text-[10px] text-text-muted mt-0.5">
        {isOutOfStock ? "Habis" : `Stok: ${product.stock}`}
      </p>
    </button>
  );
}

// ─── Cart Item Row ─────────────────────────────────────────
function CartItemRow({
  item,
  onQtyChange,
  onRemove,
  onPriceChange,
}: {
  item: CartItem;
  onQtyChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onPriceChange: (productId: string, price: number) => void;
}) {
  const [editPrice, setEditPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(String(item.priceOverride));

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
        {item.product.imageUrl ? (
          <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="w-5 h-5 text-text-muted" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{item.product.name}</p>
        {editPrice ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="tel"
              inputMode="numeric"
              className="input-field py-1 px-2 text-xs font-mono w-28"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => {
                const p = parseInt(priceInput || "0");
                onPriceChange(item.product.id, p);
                setEditPrice(false);
              }}
              autoFocus
            />
            <span className="text-xs text-text-muted">/ unit</span>
          </div>
        ) : (
          <button
            onClick={() => setEditPrice(true)}
            className="text-xs text-text-muted hover:text-accent transition-colors mt-0.5 flex items-center gap-1"
          >
            <span className="font-mono">{formatRupiah(item.priceOverride, true)}</span>
            <span className="text-[10px]">✏️</span>
          </button>
        )}
      </div>

      {/* Qty controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onQtyChange(item.product.id, item.qty - 1)}
          className="w-7 h-7 rounded-lg bg-bg-elevated border border-border flex items-center justify-center active:scale-95"
        >
          <Minus className="w-3 h-3 text-text-muted" />
        </button>
        <span className="w-6 text-center text-sm font-bold font-mono text-text-primary">
          {item.qty}
        </span>
        <button
          onClick={() => onQtyChange(item.product.id, item.qty + 1)}
          disabled={item.qty >= item.product.stock}
          className="w-7 h-7 rounded-lg bg-bg-elevated border border-border flex items-center justify-center active:scale-95 disabled:opacity-40"
        >
          <Plus className="w-3 h-3 text-text-muted" />
        </button>
        <button
          onClick={() => onRemove(item.product.id)}
          className="w-7 h-7 rounded-lg bg-danger-bg border border-danger/20 flex items-center justify-center active:scale-95 ml-0.5"
        >
          <Trash2 className="w-3 h-3 text-danger-text" />
        </button>
      </div>
    </div>
  );
}

// ─── Success Overlay ──────────────────────────────────────
function SuccessOverlay({
  result,
  onClose,
}: {
  result: { totalRevenue: number; itemCount: number; newBalance: number };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-xs text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-success-bg border border-success-DEFAULT/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-success-text" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1">Transaksi Berhasil!</h2>
        <p className="text-text-muted text-sm mb-4">
          {result.itemCount} item · {formatRupiah(result.totalRevenue)}
        </p>

        <div className="bg-bg-base rounded-xl p-3 mb-5">
          <p className="text-xs text-text-muted mb-1">Saldo Toko Sekarang</p>
          <p className="text-xl font-bold font-mono text-accent">
            {formatRupiah(result.newBalance)}
          </p>
        </div>

        <button onClick={onClose} className="btn-primary w-full flex items-center justify-center gap-2">
          <Zap className="w-4 h-4" />
          Transaksi Berikutnya
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function POSPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [note, setNote] = useState("");
  const [successResult, setSuccessResult] = useState<any>(null);

  // ── Data ─────────────────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ["products-pos"],
    queryFn: () =>
      ProductAPI.getAll({ isActive: "true", limit: 100 }).then((r) => r.data.data as Product[]),
    staleTime: 15000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => LedgerAPI.getCategories().then((r) => r.data.data),
    staleTime: 60000,
  });

  // POS sale category id (first CREDIT category that matches "Penjualan")
  const posCategoryId = useMemo(() => {
    const cats = categoriesQuery.data ?? [];
    return (
      cats.find((c: any) => c.type === "CREDIT" && c.name.toLowerCase().includes("penjualan"))?.id ??
      cats.find((c: any) => c.type === "CREDIT")?.id ??
      ""
    );
  }, [categoriesQuery.data]);

  const products = productsQuery.data ?? [];
  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Cart logic ────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product, qty: 1, priceOverride: product.sellPrice }];
    });
  };

  const changeQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((i) =>
          i.product.id === productId
            ? { ...i, qty: Math.min(qty, i.product.stock) }
            : i
        )
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const changePriceOverride = (productId: string, price: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, priceOverride: price } : i
      )
    );
  };

  const clearCart = () => setCart([]);

  // Computed totals
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalRevenue = cart.reduce((s, i) => s + i.qty * i.priceOverride, 0);

  // ── Process sale ──────────────────────────────────────────
  const saleMutation = useMutation({
    mutationFn: (data: any) => POSAPI.processSale(data),
    onSuccess: (res) => {
      const result = res.data.data;
      queryClient.invalidateQueries({ queryKey: ["products-pos"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setSuccessResult(result);
      setCart([]);
      setNote("");
      setShowCart(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error ?? "Gagal memproses transaksi.");
    },
  });

  const handleCheckout = () => {
    if (!cart.length) return;
    if (!posCategoryId) {
      toast.error("Kategori penjualan tidak ditemukan. Tambahkan kategori CREDIT dulu.");
      return;
    }

    saleMutation.mutate({
      items: cart.map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        priceOverride: i.priceOverride,
      })),
      categoryId: posCategoryId,
      note: note || undefined,
    });
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-base/95 backdrop-blur-sm border-b border-border safe-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">Kasir Cepat</h1>
              <p className="text-xs text-text-muted">Point of Sale</p>
            </div>
          </div>

          {/* Cart button */}
          <button
            onClick={() => cart.length > 0 && setShowCart(true)}
            disabled={cart.length === 0}
            className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all
              ${cart.length > 0
                ? "bg-accent text-white border-transparent shadow-glow active:scale-95"
                : "bg-bg-card border-border text-text-muted cursor-not-allowed opacity-60"
              }`}
          >
            <ShoppingCart className="w-4 h-4" />
            {cart.length > 0 && (
              <span>{totalItems} · {formatRupiah(totalRevenue, true)}</span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Cari produk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
        </div>
      </div>

      {/* Product grid */}
      <div className="p-4">
        {productsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton rounded-xl h-44" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={<Package className="w-7 h-7" />}
            title={search ? "Produk tidak ditemukan" : "Belum ada produk"}
            description={search ? `Tidak ada hasil untuk "${search}"` : "Tambahkan produk di menu Produk terlebih dahulu."}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => (
              <POSProductCard
                key={p.id}
                product={p}
                qtyInCart={cart.find((i) => i.product.id === p.id)?.qty ?? 0}
                onAdd={addToCart}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart Sheet ─────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative w-full bg-bg-card border-t border-border rounded-t-2xl animate-slide-up safe-bottom max-h-[85dvh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-text-primary" />
                <h2 className="text-base font-bold text-text-primary">
                  Keranjang ({totalItems} item)
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={clearCart}
                  className="px-2.5 py-1.5 rounded-lg bg-danger-bg border border-danger/20 text-danger-text text-xs font-medium"
                >
                  Kosongkan
                </button>
                <button
                  onClick={() => setShowCart(false)}
                  className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-4">
              {cart.map((item) => (
                <CartItemRow
                  key={item.product.id}
                  item={item}
                  onQtyChange={changeQty}
                  onRemove={removeFromCart}
                  onPriceChange={changePriceOverride}
                />
              ))}
            </div>

            {/* Note */}
            <div className="px-4 pt-3 flex-shrink-0">
              <input
                type="text"
                placeholder="Catatan transaksi (opsional)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input-field text-sm"
              />
            </div>

            {/* Total + Checkout */}
            <div className="px-4 pt-3 pb-5 flex-shrink-0 border-t border-border mt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-muted font-medium">Total</p>
                <p className="text-xl font-bold font-mono text-text-primary">
                  {formatRupiah(totalRevenue)}
                </p>
              </div>

              <button
                onClick={handleCheckout}
                disabled={saleMutation.isPending || !posCategoryId}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3.5"
              >
                {saleMutation.isPending ? (
                  <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Memproses...</>
                ) : (
                  <><Receipt className="w-5 h-5" />Proses Pembayaran</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Overlay ────────────────────────────────── */}
      {successResult && (
        <SuccessOverlay
          result={successResult}
          onClose={() => setSuccessResult(null)}
        />
      )}
    </div>
  );
}

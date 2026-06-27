"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Package, Edit3, Trash2,
  TrendingUp, AlertCircle, ChevronDown, Check,
  BarChart2, Layers, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { ProductAPI, UnitTypeAPI, LedgerAPI, formatRupiah, formatThousands, parseRupiahInput } from "@/lib/api";
import { BottomSheet, ConfirmDialog, EmptyState, SkeletonList, Badge, InputField } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryName?: string;
  unitType: { id: string; name: string };
  buyPrice: number;
  sellPrice: number;
  profit: number;
  margin: number;
  stock: number;
  isActive: boolean;
}

interface UnitType { id: string; name: string; }
interface Category { id: string; name: string; type: string; }

// ─── Product Form ─────────────────────────────────────────
function ProductForm({
  initial,
  unitTypes,
  onSubmit,
  isLoading,
}: {
  initial?: Partial<Product>;
  unitTypes: UnitType[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    categoryName: initial?.categoryName ?? "",
    unitTypeId: initial?.unitType?.id ?? (unitTypes[0]?.id ?? ""),
    buyPrice: initial?.buyPrice ? String(initial.buyPrice) : "",
    sellPrice: initial?.sellPrice ? String(initial.sellPrice) : "",
    initialStock: "",
    imageUrl: initial?.imageUrl ?? "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const buy = parseRupiahInput(form.buyPrice);
  const sell = parseRupiahInput(form.sellPrice);
  const profit = sell - buy;
  const margin = sell > 0 ? ((profit / sell) * 100).toFixed(1) : "0";

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Nama produk wajib diisi."); return; }
    if (!form.unitTypeId) { toast.error("Pilih satuan."); return; }
    if (sell <= 0) { toast.error("Harga jual harus lebih dari 0."); return; }

    onSubmit({
      name: form.name.trim(),
      description: form.description || undefined,
      categoryName: form.categoryName || undefined,
      unitTypeId: form.unitTypeId,
      buyPrice: buy,
      sellPrice: sell,
      imageUrl: form.imageUrl || undefined,
      ...(!isEdit && { initialStock: parseInt(form.initialStock || "0") }),
    });
  };

  return (
    <div className="space-y-4 pb-2">
      <InputField
        label="Nama Produk *"
        placeholder="contoh: Kopi Arabika 250gr"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
      />

      <InputField
        label="Kategori"
        placeholder="contoh: Minuman, Makanan..."
        value={form.categoryName}
        onChange={(e) => set("categoryName", e.target.value)}
      />

      {/* Satuan */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-muted block">Satuan *</label>
        <div className="relative">
          <select
            value={form.unitTypeId}
            onChange={(e) => set("unitTypeId", e.target.value)}
            className="input-field appearance-none pr-8 cursor-pointer"
          >
            {unitTypes.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Harga */}
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Harga Modal (Rp)"
          placeholder="0"
          type="tel"
          inputMode="numeric"
          value={formatThousands(form.buyPrice)}
          onChange={(e) => set("buyPrice", e.target.value)}
          prefix="Rp"
        />
        <InputField
          label="Harga Jual (Rp) *"
          placeholder="0"
          type="tel"
          inputMode="numeric"
          value={formatThousands(form.sellPrice)}
          onChange={(e) => set("sellPrice", e.target.value)}
          prefix="Rp"
        />
      </div>

      {/* Profit preview */}
      {sell > 0 && (
        <div className={`flex items-center justify-between p-3 rounded-xl border ${profit >= 0 ? "bg-success-bg border-success-DEFAULT/20" : "bg-danger-bg border-danger-DEFAULT/20"}`}>
          <span className="text-xs font-medium text-text-muted">Profit / Margin</span>
          <span className={`text-sm font-bold font-mono ${profit >= 0 ? "text-success-text" : "text-danger-text"}`}>
            {formatRupiah(profit, true)} · {margin}%
          </span>
        </div>
      )}

      {/* Initial stock (create only) */}
      {!isEdit && (
        <InputField
          label="Stok Awal"
          type="tel"
          inputMode="numeric"
          placeholder="0"
          value={form.initialStock}
          onChange={(e) => set("initialStock", e.target.value.replace(/\D/g, ""))}
          hint="Kosongkan jika belum ada stok"
        />
      )}

      <InputField
        label="URL Foto (opsional)"
        placeholder="https://..."
        value={form.imageUrl}
        onChange={(e) => set("imageUrl", e.target.value)}
      />

      <textarea
        placeholder="Deskripsi produk (opsional)..."
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        rows={2}
        className="input-field resize-none"
      />

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Menyimpan...</>
        ) : (
          <><Check className="w-4 h-4" />{isEdit ? "Simpan Perubahan" : "Tambah Produk"}</>
        )}
      </button>
    </div>
  );
}

// ─── Add Stock Sheet ──────────────────────────────────────
function AddStockSheet({
  product,
  categories,
  onClose,
}: {
  product: Product;
  categories: Category[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState("");
  const [buyPrice, setBuyPrice] = useState(String(product.buyPrice));
  const [deduct, setDeduct] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const debitCategories = categories.filter((c) => c.type === "DEBIT");
  const qtyNum = parseInt(qty || "0");
  const priceNum = parseRupiahInput(buyPrice);
  const totalCost = qtyNum * priceNum;

  const mutation = useMutation({
    mutationFn: (data: any) => ProductAPI.addStock(product.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      toast.success("Stok berhasil ditambahkan!");
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? "Gagal menambah stok."),
  });

  const handleSubmit = () => {
    if (qtyNum <= 0) { toast.error("Masukkan jumlah stok."); return; }
    if (deduct && !categoryId) { toast.error("Pilih kategori pengeluaran."); return; }

    mutation.mutate({
      qty: qtyNum,
      buyPricePerUnit: priceNum,
      deductFromBalance: deduct,
      debitCategoryId: deduct ? categoryId : undefined,
      note: note || undefined,
    });
  };

  return (
    <div className="space-y-4 pb-2">
      {/* Product info */}
      <div className="flex items-center gap-3 p-3 bg-bg-base rounded-xl">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{product.name}</p>
          <p className="text-xs text-text-muted">Stok saat ini: <span className="font-mono font-semibold text-text-secondary">{product.stock} {product.unitType.name}</span></p>
        </div>
      </div>

      <InputField
        label="Jumlah Stok Ditambahkan *"
        type="tel"
        inputMode="numeric"
        placeholder="0"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
        suffix={product.unitType.name}
      />

      <InputField
        label="Harga Beli per Unit (Rp)"
        type="tel"
        inputMode="numeric"
        value={formatThousands(buyPrice)}
        onChange={(e) => setBuyPrice(e.target.value)}
        prefix="Rp"
        hint={`Total modal: ${formatRupiah(totalCost)}`}
      />

      {/* Deduct from balance toggle */}
      <button
        onClick={() => setDeduct((d) => !d)}
        className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${deduct ? "bg-accent/10 border-accent/30" : "bg-bg-base border-border"}`}
      >
        <div className="text-left">
          <p className="text-sm font-medium text-text-primary">Potong dari Saldo Toko?</p>
          <p className="text-xs text-text-muted mt-0.5">Otomatis catat pengeluaran di Buku Kas</p>
        </div>
        <div className={`w-12 h-6 rounded-full transition-all relative ${deduct ? "bg-accent" : "bg-bg-elevated border border-border"}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${deduct ? "left-6" : "left-0.5"}`} />
        </div>
      </button>

      {/* Debit category (conditional) */}
      {deduct && (
        <div className="space-y-1.5 animate-fade-in">
          <label className="text-xs font-medium text-text-muted block">Kategori Pengeluaran *</label>
          <div className="relative">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input-field appearance-none pr-8 cursor-pointer"
            >
              <option value="">Pilih kategori...</option>
              {debitCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          </div>
        </div>
      )}

      <InputField
        label="Catatan (opsional)"
        placeholder="Beli dari supplier X..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={mutation.isPending}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {mutation.isPending ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Menyimpan...</>
        ) : (
          <><Layers className="w-4 h-4" />Tambah Stok</>
        )}
      </button>
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────
function ProductCard({
  product,
  onEdit,
  onAddStock,
  onDelete,
}: {
  product: Product;
  onEdit: (p: Product) => void;
  onAddStock: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  const lowStock = product.stock <= 5;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        {/* Image / placeholder */}
        <div className="w-12 h-12 rounded-xl bg-bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-text-muted" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{product.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {product.categoryName && (
                  <Badge variant="muted">{product.categoryName}</Badge>
                )}
                <Badge variant="muted">{product.unitType.name}</Badge>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => onEdit(product)}
                className="w-7 h-7 rounded-lg bg-bg-elevated border border-border flex items-center justify-center hover:border-accent/40 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-text-muted" />
              </button>
              <button
                onClick={() => onDelete(product)}
                className="w-7 h-7 rounded-lg bg-bg-elevated border border-border flex items-center justify-center hover:border-danger/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-text-muted" />
              </button>
            </div>
          </div>

          {/* Prices */}
          <div className="flex items-center gap-3 mt-2.5">
            <div>
              <p className="text-[10px] text-text-muted">Jual</p>
              <p className="text-sm font-bold font-mono text-text-primary">
                {formatRupiah(product.sellPrice, true)}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-[10px] text-text-muted">Modal</p>
              <p className="text-xs font-mono text-text-secondary">
                {formatRupiah(product.buyPrice, true)}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-[10px] text-text-muted">Profit</p>
              <p className={`text-xs font-bold font-mono ${product.profit >= 0 ? "text-success-text" : "text-danger-text"}`}>
                {product.margin}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stock bar & add stock button */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          {lowStock ? (
            <AlertCircle className="w-3.5 h-3.5 text-warning-DEFAULT" />
          ) : (
            <BarChart2 className="w-3.5 h-3.5 text-text-muted" />
          )}
          <span className={`text-xs font-medium ${lowStock ? "text-warning-DEFAULT" : "text-text-muted"}`}>
            Stok:{" "}
            <span className="font-mono font-bold text-text-secondary">
              {product.stock} {product.unitType.name}
            </span>
            {lowStock && " · Hampir habis"}
          </span>
        </div>

        <button
          onClick={() => onAddStock(product)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Stok
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function ProdukPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [addStockProduct, setAddStockProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Debounce search
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as any)._t);
    (handleSearch as any)._t = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  // ── Queries ──────────────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ["products", debouncedSearch],
    queryFn: () =>
      ProductAPI.getAll({ search: debouncedSearch || undefined, isActive: "true", limit: 50 })
        .then((r) => r.data.data as Product[]),
    staleTime: 10000,
  });

  const unitTypesQuery = useQuery({
    queryKey: ["unit-types"],
    queryFn: () => UnitTypeAPI.getAll().then((r) => r.data.data as UnitType[]),
    staleTime: 60000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => LedgerAPI.getCategories().then((r) => r.data.data as Category[]),
    staleTime: 60000,
  });

  const products = productsQuery.data ?? [];

  // ── Mutations ────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: any) => ProductAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produk berhasil ditambahkan!");
      setShowAdd(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? "Gagal menambah produk."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ProductAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produk berhasil diperbarui!");
      setEditProduct(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? "Gagal memperbarui produk."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ProductAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produk dihapus.");
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? "Gagal menghapus."),
  });

  // Summary stats
  const totalProducts = products.length;
  const totalStock = products.reduce((s, p) => s + p.stock, 0);
  const lowStockCount = products.filter((p) => p.stock <= 5).length;

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-base/95 backdrop-blur-sm border-b border-border safe-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-text-primary">Produk</h1>
            <p className="text-xs text-text-muted">{totalProducts} produk · {totalStock} total stok</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-sm font-semibold active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Tambah
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
              onChange={(e) => handleSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {lowStockCount > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-warning-bg border border-warning-DEFAULT/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-warning-DEFAULT flex-shrink-0" />
          <p className="text-xs text-warning-text font-medium">
            {lowStockCount} produk hampir habis stoknya
          </p>
        </div>
      )}

      {/* Product list */}
      <div className="px-4 mt-4 space-y-3">
        {productsQuery.isLoading ? (
          <div className="card overflow-hidden">
            <SkeletonList rows={4} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="w-7 h-7" />}
            title={debouncedSearch ? "Produk tidak ditemukan" : "Belum ada produk"}
            description={
              debouncedSearch
                ? `Tidak ada hasil untuk "${debouncedSearch}"`
                : "Tap tombol Tambah untuk menambahkan produk pertama Anda."
            }
            action={
              !debouncedSearch ? (
                <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />Tambah Produk
                </button>
              ) : undefined
            }
          />
        ) : (
          products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={setEditProduct}
              onAddStock={setAddStockProduct}
              onDelete={setDeleteTarget}
            />
          ))
        )}
      </div>

      <div className="h-8" />

      {/* ── Sheets & Dialogs ─────────────────────────────── */}

      {/* Add Product */}
      <BottomSheet open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Produk Baru">
        <ProductForm
          unitTypes={unitTypesQuery.data ?? []}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      </BottomSheet>

      {/* Edit Product */}
      <BottomSheet
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        title="Edit Produk"
      >
        {editProduct && (
          <ProductForm
            initial={editProduct}
            unitTypes={unitTypesQuery.data ?? []}
            onSubmit={(data) => updateMutation.mutate({ id: editProduct.id, data })}
            isLoading={updateMutation.isPending}
          />
        )}
      </BottomSheet>

      {/* Add Stock */}
      <BottomSheet
        open={!!addStockProduct}
        onClose={() => setAddStockProduct(null)}
        title="Tambah Stok"
      >
        {addStockProduct && (
          <AddStockSheet
            product={addStockProduct}
            categories={categoriesQuery.data ?? []}
            onClose={() => setAddStockProduct(null)}
          />
        )}
      </BottomSheet>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Produk?"
        message={`Produk "${deleteTarget?.name}" akan dinonaktifkan. Data transaksi tidak akan terhapus.`}
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("kasir-auth");
      if (stored) {
        const token = JSON.parse(stored)?.state?.token;
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("kasir-auth");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export const AuthAPI = {
  checkStatus: (initData: string) => api.get("/api/auth/check", { params: { initData } }),
  login: (initData: string, pin: string) => api.post("/api/auth/login", { initData, pin }),
};

export const LedgerAPI = {
  getBalance: () => api.get("/api/ledger/balance"),
  getHistory: (params?: Record<string, any>) => api.get("/api/ledger", { params }),
  createEntry: (data: any) => api.post("/api/ledger", data),
  getCategories: () => api.get("/api/ledger/categories"),
  createCategory: (data: any) => api.post("/api/ledger/categories", data),
  getAnalytics: (params?: Record<string, any>) => api.get("/api/ledger/analytics", { params }),
  exportExcel: (params?: Record<string, any>) => api.get("/api/ledger/export", { params }),
};

export const ProductAPI = {
  getAll: (params?: Record<string, any>) => api.get("/api/products", { params }),
  getById: (id: string) => api.get(`/api/products/${id}`),
  create: (data: any) => api.post("/api/products", data),
  update: (id: string, data: any) => api.put(`/api/products/${id}`, data),
  delete: (id: string) => api.delete(`/api/products/${id}`),
  addStock: (id: string, data: any) => api.post(`/api/products/${id}/stock/add`, data),
  adjustStock: (id: string, data: any) => api.post(`/api/products/${id}/stock/adjust`, data),
  getCategories: () => api.get("/api/products/categories"),
};

export const UnitTypeAPI = {
  getAll: () => api.get("/api/unit-types"),
  create: (name: string) => api.post("/api/unit-types", { name }),
};

export const POSAPI = {
  processSale: (data: any) => api.post("/api/pos/sale", data),
  getHistory: (params?: Record<string, any>) => api.get("/api/pos/history", { params }),
};

export const formatRupiah = (amount: number, short = false): string => {
  if (short) {
    if (Math.abs(amount) >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    if (Math.abs(amount) >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
};

export const parseRupiahInput = (val: string): number =>
  parseInt(val.replace(/\D/g, "") || "0", 10);

export const formatThousands = (val: string): string => {
  const num = val.replace(/\D/g, "");
  if (!num) return "";
  return parseInt(num).toLocaleString("id-ID");
};

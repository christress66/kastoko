// src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { bot, startCronJobs } from "./bot";
import { authMiddleware } from "./middlewares/auth.middleware";
import { AuthController } from "./controllers/auth.controller";
import { LedgerController } from "./controllers/ledger.controller";
import { ProductController } from "./controllers/product.controller";
import { POSController } from "./controllers/pos.controller";
import { prisma } from "./db/prisma";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet());
app.use(cors({ origin: process.env.WEBAPP_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 10, skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam 5 menit." },
});
app.use(globalLimiter);

app.get("/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Public
app.post("/api/auth/login", loginLimiter, AuthController.login);
app.get("/api/auth/check", AuthController.checkStatus);

// Protected
const api = express.Router();
api.use(authMiddleware);

// Ledger
api.get("/ledger", LedgerController.getHistory);
api.post("/ledger", LedgerController.createEntry);
api.get("/ledger/balance", LedgerController.getBalance);
api.get("/ledger/analytics", LedgerController.getAnalytics);
api.get("/ledger/categories", LedgerController.getCategories);
api.post("/ledger/categories", LedgerController.createCategory);
api.get("/ledger/export", LedgerController.exportExcel);

// Products
api.get("/products", ProductController.getAll);
api.post("/products", ProductController.create);
api.get("/products/categories", ProductController.getProductCategories);
api.get("/products/:id", ProductController.getById);
api.put("/products/:id", ProductController.update);
api.delete("/products/:id", ProductController.delete);
api.post("/products/:id/stock/add", ProductController.addStock);
api.post("/products/:id/stock/adjust", ProductController.adjustStock);

// Unit Types
api.get("/unit-types", ProductController.getUnitTypes);
api.post("/unit-types", ProductController.createUnitType);

// POS
api.post("/pos/sale", POSController.processSale);
api.get("/pos/history", POSController.getSaleHistory);

app.use("/api", api);

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Error]", err);
  res.status(500).json({ error: "Internal server error." });
});

async function main() {
  await prisma.$connect();
  console.log("✅ Database connected");
  bot.launch({ dropPendingUpdates: true });
  console.log("✅ Bot started");
  startCronJobs();
  app.listen(PORT, () => console.log(`✅ API on http://localhost:${PORT}`));
  const shutdown = async () => { bot.stop(); await prisma.$disconnect(); process.exit(0); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });

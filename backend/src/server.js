import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { createServer } from "http";
import mongoose from "mongoose";
import { initSocket } from "./services/socket.service.js";
import { initAssignmentScheduler } from "./services/assignmentService.js";
import { initLogisticsListeners } from "./events/index.js";

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Please terminate the process running on port ${PORT} or change the PORT environment variable.`);
    process.exit(1);
  } else {
    console.error("❌ Server error:", error);
  }
});

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    // Initialize logistics event bus
    try {
      initLogisticsListeners();
      const { initializeEventRegistry } = await import("./events/eventRegistry.js");
      initializeEventRegistry();
    } catch (err) {
      console.error("📦 Failed to initialize event registry:", err.message);
    }

    if (mongoose.connection.readyState === 1) {
      // Idempotent migration for existing brands
      try {
        const Brand = (await import("./models/Brand.model.js")).default;
        const updatedCount = await Brand.updateMany(
          { visibility: { $exists: false } },
          { $set: { visibility: "global", createdBy: "admin" } }
        );
        if (updatedCount.modifiedCount > 0) {
          console.log(`📦 Migrated ${updatedCount.modifiedCount} existing brands to default global settings.`);
        }
      } catch (err) {
        console.error("📦 Failed to run brand migration:", err.message);
      }

      // Seed default homepage sections
      try {
        const { seedHomepageSections } = await import("./scripts/seedHomeSections.js");
        await seedHomepageSections();
      } catch (err) {
        console.error("📦 Failed to run homepage sections seeding:", err.message);
      }
    }

    try {
      initAssignmentScheduler();
    } catch (err) {
      console.error("📦 Failed to init assignment scheduler:", err.message);
    }

    // Auto-release escrow scanner
    try {
      const { releaseEscrowPayments } = await import("./cron/escrowCron.js");
      releaseEscrowPayments().catch(err => console.error("Escrow release scan error:", err));
      setInterval(() => {
        releaseEscrowPayments().catch(err => console.error("Escrow release scan error:", err));
      }, 24 * 60 * 60 * 1000);
    } catch (err) {
      console.error("📦 Failed to init escrow cron:", err.message);
    }

    // Auto-expire promotional balances scanner
    try {
      const { expirePromotionalBalances } = await import("./cron/walletCron.js");
      expirePromotionalBalances().catch(err => console.error("Wallet balance expiry scan error:", err));
      setInterval(() => {
        expirePromotionalBalances().catch(err => console.error("Wallet balance expiry scan error:", err));
      }, 24 * 60 * 60 * 1000);
    } catch (err) {
      console.error("📦 Failed to init wallet cron:", err.message);
    }

    if (!httpServer.listening) {
      httpServer.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🔌 Socket.io initialized`);
      });
    }
  } catch (error) {
    console.error("📦 Server startup notice:", error.message);
    if (!httpServer.listening) {
      httpServer.listen(PORT, () => {
        console.log(`Server running in fallback mode on http://localhost:${PORT}`);
      });
    }
  }
};

startServer();

// Server initialized

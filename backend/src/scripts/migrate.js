import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDB from "../config/db.js";

const __dirname = path.resolve();
const migrationsDir = path.join(__dirname, "migrations");

const runAllMigrations = async () => {
  await connectDB();

  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".migration.js"));

  console.log(`\n🚀 Running ${migrationFiles.length} migration(s)...\n`);

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const migrationModule = await import(`file://${filePath}`);

    if (typeof migrationModule.runMigration === "function") {
      console.log(`📦 Running migration: ${file}`);
      await migrationModule.runMigration();
    } else {
      console.log(`⚠️  Skipping ${file} (no runMigration() found)`);
    }
  }

  console.log("\n🎉 All migrations completed!\n");
  mongoose.connection.close();
};

runAllMigrations().catch((err) => {
  console.error("❌ Migration error:", err);
  mongoose.connection.close();
});

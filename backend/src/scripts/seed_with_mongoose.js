// // src/scripts/seed_with_mongoose.js
// import fs from 'node:fs';
// import path from 'node:path';
// import connectDB from '../config/db.js';
// import Institution from '../models/institution.model.js';

// await connectDB();

// // Make sure indexes (e.g., unique email) are built before inserting
// await Institution.init();

// const jsonPath = path.join(process.cwd(), 'src', 'scripts', 'data', 'institutions.json');
// const docs = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// // Fast bulk insert; continue on errors like duplicate key
// const result = await Institution.insertMany(docs, { ordered: false });
// console.log('Inserted documents:', result.length);
// process.exit(0);

// src/scripts/seed_with_mongoose.js
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import mongoose from "mongoose";
import Institution from "../models/institution.model.js";

dotenv.config(); // ✅ load .env

await connectDB();

// Ensure indexes are created before inserting (for unique fields)
await Institution.init();

const jsonPath = path.join(process.cwd(), "src", "scripts", "data", "institutions.json");
const docs = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

try {
  const result = await Institution.insertMany(docs, { ordered: false });
  console.log(`✅ Inserted documents: ${result.length}`);
} catch (err) {
  console.error("❌ Error during seeding:", err.message);
}

mongoose.connection.close();
process.exit(0);

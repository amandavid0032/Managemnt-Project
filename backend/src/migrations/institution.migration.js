// src/migrations/institution.migration.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import connectDB from "../config/db.js";

await connectDB();

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  country: { type: String },
  state: { type: String },
  city: { type: String },
  address: { type: String },
  imageUrls: [{ type: String }],

  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: function () {
      return (Math.random() * 2 + 3).toFixed(1); // random 3.0–5.0
    },
  },

  description: { type: String },

  awards: [
    {
      title: { type: String },
      year: { type: Number },
      issuedBy: { type: String },
    },
  ],

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

const runMigration = async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const exists = collections.some((col) => col.name === "institutions");

  if (exists) {
    console.log("⚠️ Recreating institution collection with updated schema...");
    await mongoose.connection.db.dropCollection("institutions");
  }

  await mongoose.model("Institution", institutionSchema).createCollection();
  console.log("✅ Institution collection created successfully with all fields.");

  mongoose.connection.close();
};

runMigration();

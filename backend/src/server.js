import express from "express";
import dotenv from "dotenv";
import cors from "cors"; 
import connectDB from "./config/db.js";
import institutionRoutes from "./routes/institution.routes.js";

dotenv.config();
const app = express();

// ✅ Enable CORS before routes
app.use(cors({
  origin:  [
  "http://localhost:3000",
  "https://mycampushub.vercel.app"
],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// ✅ Connect to database
connectDB();

// ✅ Routes
app.use("/api/institutions", institutionRoutes);

// ✅ Default route
app.get("/", (req, res) => {
  res.send("🚀 API is running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

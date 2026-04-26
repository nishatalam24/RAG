import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectLanceDB } from "./config/lancedb.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  try {
    await connectDB();
    await connectLanceDB();

    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Server start error:", error.message);
    process.exit(1);
  }
};

startServer();

import express from "express";
import cors from "cors";
import path from "path";
import authRoutes from "./routes/auth.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import learningRoutes from "./routes/learning.routes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Classroom RAG API is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "okay"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/learning", learningRoutes);

export default app;
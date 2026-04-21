import express from "express";
import auth from "../middleware/auth.js";
import { askQuestion, getHistory } from "../controllers/chat.controller.js";

const router = express.Router();

router.post("/ask", auth, askQuestion);
router.get("/history", auth, getHistory);

export default router;

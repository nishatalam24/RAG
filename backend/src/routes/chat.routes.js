import express from "express";
import auth from "../middleware/auth.js";
import { askQuestion, generateQuiz, getHistory, submitQuiz } from "../controllers/chat.controller.js";

const router = express.Router();

router.post("/ask", auth, askQuestion);
router.post("/quiz", auth, generateQuiz);
router.post("/quiz/submit", auth, submitQuiz);
router.get("/history", auth, getHistory);

export default router;

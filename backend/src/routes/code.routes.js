import express from "express";
import { analyzeCode, runCode } from "../controllers/code.controller.js";

const router = express.Router();

router.post("/run", runCode);
router.post("/analyze", analyzeCode);

export default router;


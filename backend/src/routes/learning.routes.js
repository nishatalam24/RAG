import express from "express";
import auth from "../middleware/auth.js";
import {
  listSubjectDates,
  listSubjects
} from "../controllers/learning.controller.js";

const router = express.Router();

router.get("/subjects", auth, listSubjects);
router.get("/subjects/:subject/dates", auth, listSubjectDates);

export default router;

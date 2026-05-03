import express from "express";
import fs from "fs";
import multer from "multer";
import auth from "../middleware/auth.js";
import {
  getTeacherDocumentFile,
  listTeacherDocuments,
  uploadPdf
} from "../controllers/pdf.controller.js";

const router = express.Router();

fs.mkdirSync("uploads", { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  }
});

router.post("/upload", auth, upload.single("file"), uploadPdf);
router.get("/documents", auth, listTeacherDocuments);
router.get("/documents/:id/file", auth, getTeacherDocumentFile);

export default router;

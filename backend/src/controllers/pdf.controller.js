import Document from "../models/Document.js";
import { createEmbedding } from "../config/gemini.js";
import { getPdfChunksTable } from "../config/lancedb.js";
import pdfExtract from "../services/pdfExtract.js";
import chunkText from "../services/chunkText.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

const parseTags = (tags) => {
  if (!tags) return [];

  return tags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
};

export const uploadPdf = async (req, res) => {
  logControllerStart("pdf.uploadPdf", {
    userId: req.user?._id?.toString(),
    fileName: req.file?.filename
  });

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required"
      });
    }

    const tags = parseTags(req.body.tags);
    const text = await pdfExtract(req.file.path);
    const chunks = chunkText(text, 800);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No text found in PDF"
      });
    }

    const document = await Document.create({
      userId: req.user._id,
      fileName: req.file.filename,
      tags
    });

    const table = getPdfChunksTable();
    const rows = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await createEmbedding(chunk);

      rows.push({
        id: `${document._id}-${i}`,
        vector,
        text: chunk,
        userId: req.user._id.toString(),
        userid: req.user._id.toString(),
        documentId: document._id.toString(),
        fileName: req.file.filename,
        tags: tags.join(",")
      });
    }

    await table.add(rows);

    logControllerSuccess("pdf.uploadPdf", {
      userId: req.user._id.toString(),
      documentId: document._id.toString(),
      fileName: document.fileName,
      chunkCount: chunks.length
    });

    res.status(201).json({
      success: true,
      message: "PDF uploaded and trained successfully",
      document: {
        id: document._id,
        fileName: document.fileName,
        tags: document.tags,
        chunks: chunks.length
      }
    });
  } catch (error) {
    logControllerError("pdf.uploadPdf", error, {
      userId: req.user?._id?.toString(),
      fileName: req.file?.filename
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

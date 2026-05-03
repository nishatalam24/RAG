import Document from "../models/Document.js";
import { createEmbedding, generateAnswer } from "../config/gemini.js";
import { insertPdfChunks } from "../config/vectorStore.js";
import pdfExtract from "../services/pdfExtract.js";
import chunkText from "../services/chunkText.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";
import path from "path";

const buildFileUrl = (req, storedFileName) => {
  if (!storedFileName) return "";

  return `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(storedFileName)}`;
};

const getUploadsDir = () => {
  return path.resolve(process.cwd(), "uploads");
};

const normalizeSubject = (subject = "") => {
  return subject.trim().replace(/\s+/g, " ");
};

const getSubjectKey = (subject = "") => {
  return normalizeSubject(subject).toLowerCase();
};

const getDayBounds = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const summarizeClassText = async (subject, classDate, text) => {
  const prompt = `
Create a concise study summary for a class PDF.
Subject: ${subject}
Class date: ${classDate}

Text:
${text.slice(0, 6000)}

Write:
1. A 2-3 sentence summary.
2. 3 to 5 key learning points.
`;

  return generateAnswer(prompt);
};

export const uploadPdf = async (req, res) => {
  logControllerStart("pdf.uploadPdf", {
    userId: req.user?._id?.toString(),
    fileName: req.file?.filename
  });

  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can upload class PDFs"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required"
      });
    }

    const requestedSubject = normalizeSubject(req.body.subject);
    const subject = requestedSubject || normalizeSubject(req.user.primarySubject);
    const subjectKey = getSubjectKey(subject);
    const classDate = req.body.classDate;

    if (!subject || !classDate) {
      return res.status(400).json({
        success: false,
        message: "Subject and classDate are required"
      });
    }

    const bounds = getDayBounds(classDate);

    if (!bounds) {
      return res.status(400).json({
        success: false,
        message: "classDate must be a valid date"
      });
    }

    const text = await pdfExtract(req.file.path);
    const chunks = chunkText(text, 800);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No text found in PDF"
      });
    }

    const summary = await summarizeClassText(subject, classDate, text);

    const document = await Document.create({
      teacherId: req.user._id,
      teacherName: req.user.name,
      subject,
      subjectKey,
      classDate: bounds.start,
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      summary,
      totalChunks: chunks.length
    });

    const rows = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const vector = await createEmbedding(chunk);

      rows.push({
        id: `${document._id}-${index}`,
        teacherId: req.user._id.toString(),
        documentId: document._id.toString(),
        subject,
        subjectKey,
        classDate: bounds.start.toISOString().slice(0, 10),
        fileName: req.file.originalname,
        chunkIndex: index,
        text: chunk,
        vector
      });
    }

    await insertPdfChunks(rows);

    logControllerSuccess("pdf.uploadPdf", {
      teacherId: req.user._id.toString(),
      documentId: document._id.toString(),
      subject,
      classDate: bounds.start.toISOString(),
      chunkCount: chunks.length
    });

    res.status(201).json({
      success: true,
      message: "Class PDF uploaded and indexed successfully",
      document: {
        id: document._id,
        teacherName: document.teacherName,
        subject: document.subject,
        classDate: document.classDate,
        originalFileName: document.originalFileName,
        storedFileName: document.storedFileName,
        fileUrl: buildFileUrl(req, document.storedFileName),
        summary: document.summary,
        chunks: document.totalChunks
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

export const listTeacherDocuments = async (req, res) => {
  logControllerStart("pdf.listTeacherDocuments", {
    userId: req.user?._id?.toString()
  });

  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can view uploaded class PDFs"
      });
    }

    const documents = await Document.find({ teacherId: req.user._id })
      .sort({ classDate: -1, createdAt: -1 })
      .lean();

    const documentsWithUrls = documents.map((document) => ({
      ...document,
      fileUrl: buildFileUrl(req, document.storedFileName)
    }));

    logControllerSuccess("pdf.listTeacherDocuments", {
      teacherId: req.user._id.toString(),
      documentCount: documents.length
    });

    res.json({
      success: true,
      documents: documentsWithUrls
    });
  } catch (error) {
    logControllerError("pdf.listTeacherDocuments", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getTeacherDocumentFile = async (req, res) => {
  logControllerStart("pdf.getTeacherDocumentFile", {
    userId: req.user?._id?.toString(),
    documentId: req.params?.id
  });

  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can view uploaded PDFs"
      });
    }

    const document = await Document.findOne({
      _id: req.params.id,
      teacherId: req.user._id
    }).lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const filePath = path.join(getUploadsDir(), document.storedFileName);

    logControllerSuccess("pdf.getTeacherDocumentFile", {
      teacherId: req.user._id.toString(),
      documentId: document._id.toString(),
      storedFileName: document.storedFileName
    });

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.originalFileName)}"`
    );
    return res.sendFile(filePath);
  } catch (error) {
    logControllerError("pdf.getTeacherDocumentFile", error, {
      userId: req.user?._id?.toString(),
      documentId: req.params?.id
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

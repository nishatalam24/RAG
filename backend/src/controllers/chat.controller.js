import Chat from "../models/Chat.js";
import Document from "../models/Document.js";
import { createEmbedding, generateAnswer } from "../config/gemini.js";
import { searchPdfChunks } from "../config/vectorStore.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

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

const formatPreviousChats = (chats) => {
  if (chats.length === 0) {
    return "No previous chats for this class yet.";
  }

  return chats
    .map((chat, index) => {
      return `${index + 1}. Student/Teacher: ${chat.question}\nAssistant: ${chat.answer}`;
    })
    .join("\n\n");
};

const formatPdfContext = (chunks) => {
  if (chunks.length === 0) {
    return "No matching class notes were found.";
  }

  return chunks.map((chunk) => chunk.text).join("\n\n");
};

export const askQuestion = async (req, res) => {
  logControllerStart("chat.askQuestion", {
    userId: req.user?._id?.toString(),
    questionLength: req.body?.question?.length
  });

  try {
    const { question, subject, classDate } = req.body;

    if (!question || !subject || !classDate) {
      return res.status(400).json({
        success: false,
        message: "Question, subject, and classDate are required"
      });
    }

    const normalizedSubject = normalizeSubject(subject);
    const subjectKey = getSubjectKey(normalizedSubject);
    const bounds = getDayBounds(classDate);

    if (!bounds) {
      return res.status(400).json({
        success: false,
        message: "classDate must be a valid date"
      });
    }

    const documents = await Document.find({
      subjectKey,
      classDate: {
        $gte: bounds.start,
        $lte: bounds.end
      }
    }).lean();

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No class notes were found for that subject and date"
      });
    }

    const questionVector = await createEmbedding(question);
    const pdfChunks = await searchPdfChunks({
      subjectKey,
      classDate: bounds.start.toISOString().slice(0, 10),
      questionVector,
      limit: 6
    });

    const lastChats = await Chat.find({
      userId: req.user._id,
      subjectKey,
      classDate: {
        $gte: bounds.start,
        $lte: bounds.end
      }
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const summaries = documents
      .map((document, index) => `${index + 1}. ${document.summary}`)
      .join("\n");

    const prompt = `
You are a study assistant for classroom RAG.
Answer only from the provided class context for the selected subject and date.
If the answer is not supported by the class notes, say that clearly.
Keep the answer easy for a student to learn from.

Subject: ${documents[0].subject}
Class date: ${bounds.start.toISOString().slice(0, 10)}

Teacher summaries:
${summaries}

Previous conversation:
${formatPreviousChats(lastChats)}

Class note chunks:
${formatPdfContext(pdfChunks)}

Question:
${question}

Answer:
`;

    const answer = await generateAnswer(prompt);

    const savedChat = await Chat.create({
      userId: req.user._id,
      subject: documents[0].subject,
      subjectKey,
      classDate: bounds.start,
      question,
      answer
    });

    logControllerSuccess("chat.askQuestion", {
      userId: req.user._id.toString(),
      chatId: savedChat._id.toString(),
      subjectKey,
      chunkCount: pdfChunks.length
    });

    res.json({
      success: true,
      answer,
      chatId: savedChat._id
    });
  } catch (error) {
    logControllerError("chat.askQuestion", error, {
      userId: req.user?._id?.toString(),
      questionLength: req.body?.question?.length
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getHistory = async (req, res) => {
  logControllerStart("chat.getHistory", {
    userId: req.user?._id?.toString()
  });

  try {
    const filters = {
      userId: req.user._id
    };

    if (req.query.subject) {
      filters.subjectKey = getSubjectKey(req.query.subject);
    }

    if (req.query.classDate) {
      const bounds = getDayBounds(req.query.classDate);

      if (bounds) {
        filters.classDate = {
          $gte: bounds.start,
          $lte: bounds.end
        };
      }
    }

    const chats = await Chat.find(filters).sort({
      createdAt: -1
    });

    logControllerSuccess("chat.getHistory", {
      userId: req.user._id.toString(),
      chatCount: chats.length
    });

    res.json({
      success: true,
      chats
    });
  } catch (error) {
    logControllerError("chat.getHistory", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

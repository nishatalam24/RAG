import Chat from "../models/Chat.js";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import crypto from "node:crypto";
import { createEmbedding, generateAnswer } from "../config/gemini.js";
import {
  insertSemanticAnswerCache,
  listPdfChunksForClass,
  searchPdfChunks,
  searchSemanticAnswerCache,
  searchSemanticAnswerCacheByQuestion
} from "../config/vectorStore.js";
import { getCachedValue, setCachedValue } from "../config/cache.js";
import { toLocalDateKey } from "../utils/dateKey.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

const color = {
  blue: (msg) => `\x1b[34m${msg}\x1b[0m`
};

const getIntentKey = (question = "") => {
  const first = question.trim().toLowerCase().split(/\s+/)[0] || "";
  if (["what", "define", "definition"].includes(first)) return "define";
  if (["how"].includes(first)) return "how";
  if (["why"].includes(first)) return "why";
  if (["when"].includes(first)) return "when";
  if (["where"].includes(first)) return "where";
  if (["who"].includes(first)) return "who";
  if (["which"].includes(first)) return "which";
  return "other";
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

    const chatModelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const classDateKey = toLocalDateKey(bounds.start);
    const intentKey = getIntentKey(question);

    const exactQuestionHit = await searchSemanticAnswerCacheByQuestion({
      subjectKey,
      classDate: classDateKey,
      model: chatModelName,
      intentKey,
      question
    });

    if (exactQuestionHit) {
      console.log(color.blue(`[cache hit] semantic.answer_exact model=${chatModelName}`));

      const savedChat = await Chat.create({
        userId: req.user._id,
        subject: documents[0].subject,
        subjectKey,
        classDate: bounds.start,
        question,
        answer: exactQuestionHit.answer
      });

      logControllerSuccess("chat.askQuestion", {
        userId: req.user._id.toString(),
        chatId: savedChat._id.toString(),
        subjectKey,
        chunkCount: 0,
        semanticCacheHit: true,
        semanticExactHit: true
      });

      return res.json({
        success: true,
        answer: exactQuestionHit.answer,
        chatId: savedChat._id,
        semanticCacheHit: true,
        semanticExactHit: true
      });
    }

    const questionVector = await createEmbedding(question);
    const semanticHit = await searchSemanticAnswerCache({
      subjectKey,
      classDate: classDateKey,
      model: chatModelName,
      intentKey,
      questionVector
    });

    if (semanticHit) {
      console.log(
        color.blue(
          `[cache hit] semantic.answer model=${chatModelName} distance=${semanticHit.distance.toFixed(
            4
          )}`
        )
      );

      const savedChat = await Chat.create({
        userId: req.user._id,
        subject: documents[0].subject,
        subjectKey,
        classDate: bounds.start,
        question,
        answer: semanticHit.answer
      });

      logControllerSuccess("chat.askQuestion", {
        userId: req.user._id.toString(),
        chatId: savedChat._id.toString(),
        subjectKey,
        chunkCount: 0,
        semanticCacheHit: true
      });

      return res.json({
        success: true,
        answer: semanticHit.answer,
        chatId: savedChat._id,
        semanticCacheHit: true,
        semanticDistance: semanticHit.distance
      });
    }

    const pdfChunks = await searchPdfChunks({
      subjectKey,
      classDate: classDateKey,
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
Class date: ${classDateKey}

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

    const answerCacheKey = {
      chatModelName,
      subjectKey,
      classDate: classDateKey,
      question,
      documentIds: documents.map((d) => d._id?.toString()).filter(Boolean),
      chunkIds: pdfChunks.map((c) => c.id)
    };

    const cachedAnswer = await getCachedValue({
      namespace: "answers_chat",
      keyParts: answerCacheKey
    });

    const answer =
      cachedAnswer ??
      (await (async () => {
        const fresh = await generateAnswer(prompt);
        await setCachedValue({
          namespace: "answers_chat",
          keyParts: answerCacheKey,
          value: fresh
        });
        return fresh;
      })());

    if (cachedAnswer) {
      console.log(color.blue(`[cache hit] chat.answer model=${chatModelName}`));
    }

    await insertSemanticAnswerCache({
      id: crypto.randomUUID(),
      subjectKey,
      classDate: classDateKey,
      model: chatModelName,
      intentKey,
      question,
      questionVector,
      answer
    });

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

export const generateQuiz = async (req, res) => {
  logControllerStart("chat.generateQuiz", {
    userId: req.user?._id?.toString(),
    subject: req.body?.subject,
    classDate: req.body?.classDate
  });

  try {
    const { subject, classDate, difficulty = "medium" } = req.body;

    if (!subject || !classDate) {
      return res.status(400).json({
        success: false,
        message: "Subject and classDate are required"
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

    const classDateKey = toLocalDateKey(bounds.start);
    const quizContextChunks = await listPdfChunksForClass({
      subjectKey,
      classDate: classDateKey
    });

    const summaries = documents
      .map((document, index) => `${index + 1}. ${document.summary}`)
      .join("\n");

    const quizPrompt = `
You are a classroom quiz generator for a single class session.
Generate a quiz ONLY from the provided class context. Do not use outside knowledge.
If something is not supported by the context, do not ask it.

Return STRICT JSON ONLY (no markdown, no code fences) that matches this schema:
{
  "title": "string",
  "difficulty": "easy|medium|hard",
  "questions": [
    {
      "id": "q1",
      "question": "string",
      "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
      "answer": "A|B|C|D",
      "explanation": "string"
    }
  ]
}

Rules:
- Exactly 8 questions total.
- Questions must be MCQ only (A-D).
- Keep explanations short (1-2 lines).
- Use ids q1..q8.

Difficulty: ${String(difficulty || "medium")}
Subject: ${documents[0].subject}
Class date: ${classDateKey}

Teacher summaries:
${summaries}

Class note chunks:
${formatPdfContext(quizContextChunks)}
`;

    const raw = await generateAnswer(quizPrompt);
    let quizJson;
    try {
      quizJson = JSON.parse(raw);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: "Quiz generation failed (invalid JSON). Try again."
      });
    }

    const title = String(quizJson?.title || `Quiz: ${documents[0].subject}`).slice(0, 160);
    const normalizedDifficulty = ["easy", "medium", "hard"].includes(String(quizJson?.difficulty))
      ? String(quizJson.difficulty)
      : String(difficulty || "medium");
    const questions = Array.isArray(quizJson?.questions) ? quizJson.questions : [];

    if (questions.length !== 8) {
      return res.status(502).json({
        success: false,
        message: "Quiz generation failed (expected 8 questions). Try again."
      });
    }

    const quizDoc = await Quiz.create({
      userId: req.user._id,
      subject: documents[0].subject,
      subjectKey,
      classDate: bounds.start,
      title,
      difficulty: normalizedDifficulty,
      questions: questions.map((q) => ({
        id: String(q.id),
        question: String(q.question),
        options: {
          A: String(q?.options?.A || ""),
          B: String(q?.options?.B || ""),
          C: String(q?.options?.C || ""),
          D: String(q?.options?.D || "")
        },
        answer: String(q.answer),
        explanation: String(q.explanation || "")
      }))
    });

    const quizForClient = {
      id: quizDoc._id,
      title: quizDoc.title,
      difficulty: quizDoc.difficulty,
      questions: quizDoc.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options
      }))
    };

    const answer = JSON.stringify({ quizId: quizDoc._id.toString(), quiz: quizForClient });

    const savedChat = await Chat.create({
      userId: req.user._id,
      subject: documents[0].subject,
      subjectKey,
      classDate: bounds.start,
      question: `Quiz: ${title}`,
      answer
    });

    logControllerSuccess("chat.generateQuiz", {
      userId: req.user._id.toString(),
      chatId: savedChat._id.toString(),
      subjectKey,
      chunkCount: quizContextChunks.length
    });

    res.json({
      success: true,
      quizId: quizDoc._id,
      quiz: quizForClient,
      chatId: savedChat._id
    });
  } catch (error) {
    logControllerError("chat.generateQuiz", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const submitQuiz = async (req, res) => {
  logControllerStart("chat.submitQuiz", {
    userId: req.user?._id?.toString(),
    quizId: req.body?.quizId
  });

  try {
    const { quizId, answers } = req.body;

    if (!quizId || !answers || typeof answers !== "object") {
      return res.status(400).json({
        success: false,
        message: "quizId and answers are required"
      });
    }

    const quiz = await Quiz.findOne({ _id: quizId, userId: req.user._id }).lean();
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }

    const scoreByQuestion = quiz.questions.map((q) => {
      const selected = String(answers[q.id] || "").toUpperCase();
      const correct = String(q.answer || "").toUpperCase();
      const isCorrect = selected && selected === correct;
      return {
        id: q.id,
        selected: selected || null,
        correct,
        isCorrect,
        explanation: q.explanation || ""
      };
    });

    const correctCount = scoreByQuestion.filter((row) => row.isCorrect).length;
    const total = quiz.questions.length;
    const percent = total ? Math.round((correctCount / total) * 100) : 0;

    const savedChat = await Chat.create({
      userId: req.user._id,
      subject: quiz.subject,
      subjectKey: quiz.subjectKey,
      classDate: quiz.classDate,
      question: `Quiz submitted: ${quiz.title}`,
      answer: `Score: ${correctCount}/${total} (${percent}%)`
    });

    logControllerSuccess("chat.submitQuiz", {
      userId: req.user._id.toString(),
      quizId: quizId.toString?.() || String(quizId),
      score: `${correctCount}/${total}`
    });

    res.json({
      success: true,
      score: { correct: correctCount, total, percent },
      breakdown: scoreByQuestion,
      chatId: savedChat._id
    });
  } catch (error) {
    logControllerError("chat.submitQuiz", error, {
      userId: req.user?._id?.toString()
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

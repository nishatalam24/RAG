import Chat from "../models/Chat.js";
import Document from "../models/Document.js";
import { createEmbedding, generateAnswer } from "../config/gemini.js";
import { getPdfChunksTable } from "../config/lancedb.js";

const findTagFromQuestion = (question, userTags) => {
  const lowerQuestion = question.toLowerCase();
  return userTags.find((tag) => {
    const lowerTag = tag.toLowerCase();
    const shortTag = lowerTag
      .split(/\s+/)
      .map((word) => word[0])
      .join("");

    return lowerQuestion.includes(lowerTag) || lowerQuestion.includes(shortTag);
  });
};

const formatPreviousChats = (chats) => {
  if (chats.length === 0) {
    return "No previous chats.";
  }

  return chats
    .map((chat, index) => {
      return `${index + 1}. User: ${chat.question}\nAI: ${chat.answer}`;
    })
    .join("\n\n");
};

const formatPdfContext = (chunks) => {
  if (chunks.length === 0) {
    return "No matching PDF content found.";
  }

  return chunks.map((chunk) => chunk.text).join("\n\n");
};

const filterChunksByTag = (chunks, tag) => {
  if (!tag) return chunks;

  return chunks.filter((chunk) => {
    const chunkTags = chunk.tags
      .split(",")
      .map((item) => item.trim().toLowerCase());

    return chunkTags.includes(tag.toLowerCase());
  });
};

export const askQuestion = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required"
      });
    }

    const userDocuments = await Document.find({ userId: req.user._id });
    const userTags = [...new Set(userDocuments.flatMap((doc) => doc.tags))];
    const foundTag = findTagFromQuestion(question, userTags);

    const questionVector = await createEmbedding(question);
    const table = getPdfChunksTable();

    const userFilter = `userid = '${req.user._id.toString()}'`;

    const query = table
      .search(questionVector)
      .where(userFilter)
      .limit(20);

    const searchedChunks = await query.toArray();
    const taggedChunks = filterChunksByTag(searchedChunks, foundTag);
    const pdfChunks = (taggedChunks.length > 0 ? taggedChunks : searchedChunks).slice(0, 5);

    const lastChats = await Chat.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const prompt = `
You are a helpful AI assistant. Answer the user's question using the PDF context and previous chats.

Previous chats:
${formatPreviousChats(lastChats)}

Context from PDF:
${formatPdfContext(pdfChunks)}

Current Question:
${question}

Answer:
`;

    const answer = await generateAnswer(prompt);

    const savedChat = await Chat.create({
      userId: req.user._id,
      question,
      answer
    });

    res.json({
      success: true,
      answer,
      chatId: savedChat._id
    });
  } catch (error) {
    if (error.message?.includes("No vector column found")) {
      return res.status(500).json({
        success: false,
        message:
          "Embedding size mismatch. Rebuild LanceDB vectors with the current Gemini embedding model."
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getHistory = async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user._id }).sort({
      createdAt: -1
    });

    res.json({
      success: true,
      chats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

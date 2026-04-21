import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const isNetworkError = (error) => {
  return (
    error.message?.includes("fetch failed") ||
    error.cause?.code === "ENOTFOUND" ||
    error.cause?.code === "ECONNRESET" ||
    error.cause?.code === "ETIMEDOUT"
  );
};

const handleGeminiError = (error) => {
  if (isNetworkError(error)) {
    throw new Error(
      "Gemini API is unreachable. Check your internet connection, DNS, VPN/proxy, or firewall, then try again."
    );
  }

  throw error;
};

export const chatModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
});

export const embeddingModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004"
});

export const createEmbedding = async (text) => {
  try {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    handleGeminiError(error);
  }
};

export const generateAnswer = async (prompt) => {
  try {
    const result = await chatModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    handleGeminiError(error);
  }
};

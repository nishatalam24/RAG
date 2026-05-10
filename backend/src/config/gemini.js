import dotenv from 'dotenv';
dotenv.config();
import crypto from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getCachedValue, setCachedValue } from "./cache.js";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const LOG_CACHE =
  (process.env.LANGCACHE_LOGS || process.env.CACHE_LOGS || "true").toLowerCase() !== "false";

const color = {
  red: (msg) => `\x1b[31m${msg}\x1b[0m`,
  blue: (msg) => `\x1b[34m${msg}\x1b[0m`
};

const shortHash = (text) =>
  crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 10);

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
  const embeddingModelName = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
  const dimensions = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 3072);
  const reqId = shortHash(`${embeddingModelName}:${dimensions}:${text}`);

  const cached = await getCachedValue({
    namespace: "embeddings",
    keyParts: { embeddingModelName, dimensions, text }
  });
  if (cached) {
    if (LOG_CACHE) {
      console.log(color.blue(`[cache hit] embeddings model=${embeddingModelName} id=${reqId}`));
    }
    return cached;
  }

  try {
    if (LOG_CACHE) {
      console.log(color.red(`[llm call] embeddings model=${embeddingModelName} id=${reqId}`));
    }
    const result = await embeddingModel.embedContent(text);
    const values = result.embedding.values;
    await setCachedValue({
      namespace: "embeddings",
      keyParts: { embeddingModelName, dimensions, text },
      value: values
    });
    return values;
  } catch (error) {
    handleGeminiError(error);
  }
};

export const generateAnswer = async (prompt) => {
  const chatModelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const reqId = shortHash(`${chatModelName}:${prompt}`);

  const cached = await getCachedValue({
    namespace: "answers",
    keyParts: { chatModelName, prompt }
  });
  if (cached) {
    if (LOG_CACHE) {
      console.log(color.blue(`[cache hit] answers model=${chatModelName} id=${reqId}`));
    }
    return cached;
  }

  try {
    if (LOG_CACHE) {
      console.log(color.red(`[llm call] answers model=${chatModelName} id=${reqId}`));
    }
    const result = await chatModel.generateContent(prompt);
    const text = result.response.text();
    await setCachedValue({
      namespace: "answers",
      keyParts: { chatModelName, prompt },
      value: text
    });
    return text;
  } catch (error) {
    handleGeminiError(error);
  }
};

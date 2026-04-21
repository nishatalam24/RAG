import dotenv from "dotenv";
import { createEmbedding, generateAnswer } from "../src/config/gemini.js";

dotenv.config();

const testGemini = async () => {
  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY is missing in .env");
    return;
  }

  console.log("Testing Gemini chat model:", process.env.GEMINI_MODEL);
  const answer = await generateAnswer("Reply with exactly: Gemini chat is working");
  console.log("Chat response:", answer);

  console.log("Testing Gemini embedding model:", process.env.GEMINI_EMBEDDING_MODEL);
  const embedding = await createEmbedding("hello world");
  console.log("Embedding vector length:", embedding.length);
};

testGemini().catch((error) => {
  console.error("Gemini test failed:");
  console.error(error.message);
  process.exit(1);
});

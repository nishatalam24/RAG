import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error("❌ Error: GEMINI_API_KEY is missing in .env file.");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        // 1. Testing Text Generation (Chat)
        console.log("--- Testing Text Model (gemini-3-flash) ---");
        const textModel = genAI.getGenerativeModel({ model: "gemini-3-flash" });
        const textResponse = await textModel.generateContent("Say 'Hi, your API is working!'");
        console.log("Response:", textResponse.response.text());

        // 2. Testing Embeddings (for your RAG project)
        console.log("\n--- Testing Embedding Model ---");
        const embedModel = genAI.getGenerativeModel({
            model: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004"
        });
        const embedResponse = await embedModel.embedContent("Hello world");
        console.log("Vector length:", embedResponse.embedding.values.length);
        console.log("✅ API Test Successful!");

    } catch (error) {
        console.error("❌ API Test Failed!");
        console.error("Error Message:", error.message);
    }
}

testGemini();

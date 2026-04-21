import dotenv from "dotenv";
import * as lancedb from "@lancedb/lancedb";
import { createEmbedding } from "../src/config/gemini.js";

dotenv.config();

const SOURCE_TABLE = process.env.LANCEDB_SOURCE_TABLE || "pdf_chunks";
const TARGET_TABLE = process.env.LANCEDB_TABLE || "pdf_chunks_3072";
const DB_PATH = process.env.LANCEDB_PATH || "./lancedb_data";

const cleanRow = (row, vector) => {
  return {
    id: row.id,
    vector,
    text: row.text,
    userId: row.userId,
    userid: row.userid || row.userId,
    documentId: row.documentId,
    fileName: row.fileName,
    tags: row.tags
  };
};

const rebuildVectors = async () => {
  const db = await lancedb.connect(DB_PATH);
  const sourceTable = await db.openTable(SOURCE_TABLE);
  const oldRows = await sourceTable.query().limit(100000).toArray();
  const rowsToRebuild = oldRows.filter((row) => row.id !== "sample" && row.text);

  if (rowsToRebuild.length === 0) {
    console.log("No PDF chunks found to rebuild.");
    return;
  }

  try {
    await db.dropTable(TARGET_TABLE);
    console.log(`Old ${TARGET_TABLE} table removed.`);
  } catch (error) {
    console.log(`${TARGET_TABLE} table does not exist yet.`);
  }

  const rebuiltRows = [];

  for (let i = 0; i < rowsToRebuild.length; i++) {
    const row = rowsToRebuild[i];
    const vector = await createEmbedding(row.text);
    rebuiltRows.push(cleanRow(row, vector));
    console.log(`Rebuilt ${i + 1}/${rowsToRebuild.length}`);
  }

  await db.createTable(TARGET_TABLE, rebuiltRows);
  console.log(`Done. Created ${TARGET_TABLE} with ${rebuiltRows.length} chunks.`);
};

rebuildVectors().catch((error) => {
  console.error("Vector rebuild failed:", error.message);
  process.exit(1);
});

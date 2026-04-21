import * as lancedb from "@lancedb/lancedb";

let db;
let table;

const TABLE_NAME = process.env.LANCEDB_TABLE || "pdf_chunks";
const VECTOR_SIZE = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 3072);

export const connectLanceDB = async () => {
  const dbPath = process.env.LANCEDB_PATH || "./lancedb_data";
  db = await lancedb.connect(dbPath);

  try {
    table = await db.openTable(TABLE_NAME);
  } catch (error) {
    // LanceDB needs one row to create a new table.
    table = await db.createTable(TABLE_NAME, [
      {
        id: "sample",
        vector: Array(VECTOR_SIZE).fill(0),
        text: "sample",
        userId: "sample",
        userid: "sample",
        documentId: "sample",
        fileName: "sample.pdf",
        tags: "sample"
      }
    ]);
  }

  console.log("LanceDB connected");
};

export const getPdfChunksTable = () => {
  if (!table) {
    throw new Error("LanceDB table is not connected");
  }

  return table;
};

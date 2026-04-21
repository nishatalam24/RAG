const chunkText = (text, chunkSize = 800) => {
  const chunks = [];
  const cleanText = text.replace(/\s+/g, " ").trim();

  for (let i = 0; i < cleanText.length; i += chunkSize) {
    chunks.push(cleanText.slice(i, i + chunkSize));
  }

  return chunks;
};

export default chunkText;

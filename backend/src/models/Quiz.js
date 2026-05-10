import mongoose from "mongoose";

const quizQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    options: {
      A: { type: String, required: true },
      B: { type: String, required: true },
      C: { type: String, required: true },
      D: { type: String, required: true }
    },
    answer: { type: String, required: true, enum: ["A", "B", "C", "D"] },
    explanation: { type: String, default: "" }
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true },
    subjectKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    classDate: { type: Date, required: true, index: true },
    title: { type: String, required: true, trim: true },
    difficulty: { type: String, default: "medium", trim: true },
    questions: { type: [quizQuestionSchema], default: [] }
  },
  { timestamps: true }
);

quizSchema.index({ userId: 1, subjectKey: 1, classDate: -1, createdAt: -1 });

export default mongoose.model("Quiz", quizSchema);


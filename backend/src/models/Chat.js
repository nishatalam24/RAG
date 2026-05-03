import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    subjectKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    classDate: {
      type: Date,
      required: true
    },
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, subjectKey: 1, classDate: -1, createdAt: -1 });

export default mongoose.model("Chat", chatSchema);

import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    teacherName: {
      type: String,
      required: true,
      trim: true
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
      trim: true,
      index: true
    },
    classDate: {
      type: Date,
      required: true,
      index: true
    },
    originalFileName: {
      type: String,
      required: true
    },
    storedFileName: {
      type: String,
      required: true
    },
    summary: {
      type: String,
      default: ""
    },
    totalChunks: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

documentSchema.index({ teacherId: 1, subjectKey: 1, classDate: -1 });
documentSchema.index({ subjectKey: 1, classDate: -1 });

export default mongoose.model("Document", documentSchema);

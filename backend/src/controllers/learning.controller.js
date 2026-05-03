import Document from "../models/Document.js";
import {
  logControllerError,
  logControllerStart,
  logControllerSuccess
} from "../utils/controllerLogger.js";

const normalizeSubject = (subject = "") => {
  return subject.trim().replace(/\s+/g, " ");
};

const getSubjectKey = (subject = "") => {
  return normalizeSubject(subject).toLowerCase();
};

export const listSubjects = async (req, res) => {
  logControllerStart("learning.listSubjects", {
    userId: req.user?._id?.toString()
  });

  try {
    const subjects = await Document.aggregate([
      {
        $match: {
          subjectKey: {
            $exists: true,
            $nin: ["", null]
          },
          subject: {
            $exists: true,
            $nin: ["", null]
          },
          classDate: {
            $ne: null
          }
        }
      },
      {
        $sort: {
          classDate: -1
        }
      },
      {
        $group: {
          _id: "$subjectKey",
          subject: { $first: "$subject" },
          latestClassDate: { $first: "$classDate" },
          totalClasses: { $sum: 1 }
        }
      },
      {
        $sort: {
          latestClassDate: -1,
          subject: 1
        }
      }
    ]);

    logControllerSuccess("learning.listSubjects", {
      userId: req.user._id.toString(),
      subjectCount: subjects.length
    });

    res.json({
      success: true,
      subjects
    });
  } catch (error) {
    logControllerError("learning.listSubjects", error, {
      userId: req.user?._id?.toString()
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const listSubjectDates = async (req, res) => {
  logControllerStart("learning.listSubjectDates", {
    userId: req.user?._id?.toString(),
    subject: req.params?.subject
  });

  try {
    const subject = normalizeSubject(req.params.subject || "");
    const subjectKey = getSubjectKey(subject);

    if (!subjectKey) {
      return res.status(400).json({
        success: false,
        message: "Subject is required"
      });
    }

    const documents = await Document.find({
      subjectKey,
      subject: {
        $nin: ["", null]
      },
      classDate: {
        $ne: null
      }
    })
      .sort({ classDate: -1, createdAt: -1 })
      .lean();

    logControllerSuccess("learning.listSubjectDates", {
      userId: req.user._id.toString(),
      subjectKey,
      documentCount: documents.length
    });

    res.json({
      success: true,
      subject: documents[0]?.subject || subject,
      dates: documents.map((document) => ({
        id: document._id,
        teacherId: document.teacherId,
        classDate: document.classDate,
        summary: document.summary,
        fileName: document.originalFileName,
        chunks: document.totalChunks,
        teacherName: document.teacherName || ""
      }))
    });
  } catch (error) {
    logControllerError("learning.listSubjectDates", error, {
      userId: req.user?._id?.toString(),
      subject: req.params?.subject
    });

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

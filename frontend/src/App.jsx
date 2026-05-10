import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Frontend render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="error-panel">
            <p className="eyebrow">Frontend Error</p>
            <h2>The page crashed while rendering.</h2>
            <p>{this.state.error.message || "Unknown error"}</p>
            <pre>{String(this.state.error.stack || "")}</pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const ATTENDANCE_API_URL =
  import.meta.env.VITE_ATTENDANCE_API_URL || "http://158.180.17.208:3000";

const SUBJECT_PALETTES = [
  {
    "--book-top": "#58743c",
    "--book-bottom": "#30451a",
    "--book-accent": "#a2c16f",
    "--ink-soft": "#edf5d9"
  },
  {
    "--book-top": "#9b4738",
    "--book-bottom": "#602117",
    "--book-accent": "#f0b182",
    "--ink-soft": "#fff0e2"
  },
  {
    "--book-top": "#365e88",
    "--book-bottom": "#18344f",
    "--book-accent": "#9bc4ef",
    "--ink-soft": "#e7f4ff"
  },
  {
    "--book-top": "#8c6b2f",
    "--book-bottom": "#5b4210",
    "--book-accent": "#d8bf76",
    "--ink-soft": "#fff7dc"
  },
  {
    "--book-top": "#6c4f8f",
    "--book-bottom": "#3e245d",
    "--book-accent": "#c5ade8",
    "--ink-soft": "#f2eaff"
  }
];

const getSavedUser = () => {
  try {
    const saved = localStorage.getItem("chatpdf_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    localStorage.removeItem("chatpdf_user");
    localStorage.removeItem("chatpdf_token");
    return null;
  }
};

const ENROLMENT_STORAGE_KEY = "chatpdf_enrolment_by_email";
const ATTENDANCE_CACHE_KEY = "chatpdf_attendance_cache_by_enrol";
const ATTENDANCE_CACHE_TTL_MS = 5 * 60 * 1000;

const readEnrolmentByEmail = () => {
  try {
    const raw = localStorage.getItem(ENROLMENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(ENROLMENT_STORAGE_KEY);
    return {};
  }
};

const writeEnrolmentForEmail = (email, enrolmentNumber) => {
  if (!email) return;
  const trimmed = String(enrolmentNumber || "").trim();
  const mapping = readEnrolmentByEmail();

  if (!trimmed) {
    delete mapping[email];
  } else {
    mapping[email] = trimmed;
  }

  localStorage.setItem(ENROLMENT_STORAGE_KEY, JSON.stringify(mapping));
};

const readAttendanceCache = () => {
  try {
    const raw = localStorage.getItem(ATTENDANCE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localStorage.removeItem(ATTENDANCE_CACHE_KEY);
    return {};
  }
};

const writeAttendanceCache = (enrolmentNumber, data) => {
  const safeEnrol = String(enrolmentNumber || "").trim().toUpperCase();
  if (!safeEnrol) return;
  const cache = readAttendanceCache();
  cache[safeEnrol] = { savedAt: Date.now(), data };
  localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(cache));
};

const getCachedAttendance = (enrolmentNumber) => {
  const safeEnrol = String(enrolmentNumber || "").trim().toUpperCase();
  if (!safeEnrol) return null;
  const cache = readAttendanceCache();
  const entry = cache?.[safeEnrol];
  if (!entry?.savedAt || !entry?.data) return null;
  if (Date.now() - entry.savedAt > ATTENDANCE_CACHE_TTL_MS) return null;
  return entry.data;
};

const fetchAttendanceByEnrolment = async (enrolmentNumber) => {
  const safeEnrol = String(enrolmentNumber || "").trim();
  if (!safeEnrol) {
    throw new Error("Enrolment number is required");
  }

  const response = await fetch(
    `${ATTENDANCE_API_URL}/api/attendance/student/${encodeURIComponent(
      safeEnrol.toUpperCase()
    )}`
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Unable to fetch attendance");
  }

  return data;
};

const formatDate = (value) => {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const normalizeSubject = (value = "") => {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }

  if (value && typeof value === "object") {
    return String(value.subject || value.name || value._id || "").trim().replace(/\s+/g, " ");
  }

  return String(value || "").trim().replace(/\s+/g, " ");
};

const slugifySubject = (value = "") => {
  return normalizeSubject(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const getSubjectPalette = (subject) => {
  const safeSubject = normalizeSubject(subject) || "subject";
  const seed = [...safeSubject].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return SUBJECT_PALETTES[seed % SUBJECT_PALETTES.length];
};

const renderRichText = (text = "") => {
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  const renderInline = (value) => {
    const normalized = String(value).replace(/\*\*\*/g, "**");
    const chunks = normalized.split("**");
    if (chunks.length === 1) return value;

    return chunks.map((chunk, index) => {
      const isBold = index % 2 === 1;
      if (!chunk) return null;
      return isBold ? <strong key={`${chunk}-${index}`}>{chunk}</strong> : chunk;
    });
  };

  const elements = [];
  let listItems = [];
  let listType = null; // "ul" | "ol"

  const flushList = () => {
    if (listItems.length === 0 || !listType) return;

    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag className="rich-list" key={`list-${elements.length}`}>
        {listItems.map((item, index) => (
          <li key={`${index}-${String(item).slice(0, 12)}`}>{renderInline(item)}</li>
        ))}
      </Tag>
    );

    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const headingMatch = line.replace(/^\*+\s*/, "").match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const content = headingMatch[2].trim();
      elements.push(
        <h4 className="rich-heading" key={`h-${elements.length}`}>
          {renderInline(content)}
        </h4>
      );
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(ulMatch[1].trim());
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(olMatch[1].trim());
      continue;
    }

    flushList();
    elements.push(
      <p className="rich-paragraph" key={`p-${elements.length}`}>
        {renderInline(line)}
      </p>
    );
  }

  flushList();
  return elements;
};

const parseQuizPayload = (value) => {
  if (!value) return null;

  // Stored as JSON string in chat.answer (or server might return markdown/plain).
  try {
    const parsed = JSON.parse(value);
    if (parsed?.quiz?.questions && (parsed.quizId || parsed.quiz?.id)) {
      return {
        quizId: parsed.quizId || parsed.quiz.id,
        quiz: parsed.quiz
      };
    }
  } catch {
    // ignore
  }

  return null;
};

const fetchPdfObjectUrl = async ({ documentId, authHeaders }) => {
  if (!documentId) {
    throw new Error("Document id is required");
  }

  const response = await fetch(`${API_URL}/api/pdf/documents/${documentId}/file`, {
    headers: authHeaders
  });

  if (!response.ok) {
    let message = "Unable to load PDF";
    try {
      const data = await response.json();
      message = data?.message || data?.error || message;
    } catch {
      // ignore (likely a non-JSON error)
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

const SubjectShelf = ({ subjects }) => {
  const safeSubjects = (Array.isArray(subjects) ? subjects : []).filter((subject) => {
    return Boolean(normalizeSubject(subject?.subject));
  });

  return (
    <section className="student-shell">
      <div className="page-intro">
        <p className="eyebrow">Library Shelf</p>
        <h2>Pick a subject to open its class archive.</h2>
        <p>
          Each subject works like a shelf. Open one, choose a class date, and revise from the
          uploaded PDF notes.
        </p>
      </div>

      {safeSubjects.length === 0 ? (
        <section className="empty-panel">
          <h3>No subjects yet</h3>
          <p>Once teachers upload class PDFs, subjects will appear here automatically.</p>
        </section>
      ) : (
        <section className="shelf-grid">
          {safeSubjects.map((subject) => (
            <Link
              key={subject._id}
              className="book-card"
              style={getSubjectPalette(subject.subject)}
              to={`/subjects/${slugifySubject(subject.subject)}`}
            >
              <span className="book-shine" />
              <span className="book-label">{subject.subject}</span>
              <span className="book-meta">{subject.totalClasses} classes</span>
              <span className="book-date">Latest: {formatDate(subject.latestClassDate)}</span>
            </Link>
          ))}
        </section>
      )}
    </section>
  );
};

const SubjectWorkspace = ({ authHeaders, subjects, onError }) => {
  const navigate = useNavigate();
  const { subjectSlug, classId } = useParams();
  const [classDates, setClassDates] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [chats, setChats] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const chatScrollRef = useRef(null);
  const [quizState, setQuizState] = useState({}); // quizId -> {answers, submitted, result}
  const safeSubjects = Array.isArray(subjects) ? subjects : [];

  const subjectRecord = useMemo(() => {
    return safeSubjects.find((item) => slugifySubject(item.subject) === subjectSlug) || null;
  }, [subjectSlug, safeSubjects]);

  const subjectName = subjectRecord?.subject || "";

  useEffect(() => {
    const loadDates = async () => {
      if (!subjectName) {
        setPageLoading(false);
        return;
      }

      setPageLoading(true);

      try {
        const response = await fetch(
          `${API_URL}/api/learning/subjects/${encodeURIComponent(subjectName)}/dates`,
          {
            headers: authHeaders
          }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message);
        }

        setClassDates(data.dates);

        if (data.dates.length === 0) {
          setSelectedClass(null);
          setChats([]);
          return;
        }

        const activeClass =
          data.dates.find((item) => item.id === classId) || data.dates[0];

        setSelectedClass(activeClass);

        if (!classId || activeClass.id !== classId) {
          navigate(`/subjects/${subjectSlug}/${activeClass.id}`, { replace: true });
        }
      } catch (error) {
        onError(error);
      } finally {
        setPageLoading(false);
      }
    };

    loadDates();
  }, [authHeaders, classId, navigate, onError, subjectName, subjectSlug]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!subjectName || !selectedClass?.classDate) {
        setChats([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          subject: subjectName,
          classDate: selectedClass.classDate
        });

        const response = await fetch(`${API_URL}/api/chat/history?${params.toString()}`, {
          headers: authHeaders
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message);
        }

        // API returns newest-first; render as oldest->newest for a ChatGPT-style thread.
        setChats(Array.isArray(data.chats) ? [...data.chats].reverse() : []);
      } catch (error) {
        onError(error);
      }
    };

    loadHistory();
  }, [authHeaders, onError, selectedClass, subjectName]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    // Keep newest messages visible after send/receive.
    chatScrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chats.length, loading]);

  const handleDateSelect = (entry) => {
    setSelectedClass(entry);
    navigate(`/subjects/${subjectSlug}/${entry.id}`);
  };

  const handleLoadPdf = useCallback(async () => {
    if (!selectedClass?.id) return;

    setPdfLoading(true);
    setPdfError("");

    try {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }

      const url = await fetchPdfObjectUrl({
        documentId: selectedClass.id,
        authHeaders
      });
      setPdfUrl(url);
    } catch (error) {
      setPdfUrl("");
      setPdfError(error.message || "Unable to load PDF");
    } finally {
      setPdfLoading(false);
    }
  }, [authHeaders, pdfUrl, selectedClass?.id]);

  useEffect(() => {
    setPdfError("");
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl("");
    setPdfLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass?.id]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handleAskQuestion = async (event) => {
    event.preventDefault();

    const trimmed = question.trim();
    if (!trimmed || !selectedClass || !subjectName) {
      onError(new Error("Choose a class date and enter a question"));
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticTurn = {
      _id: tempId,
      question: trimmed,
      answer: "",
      pending: true
    };

    setLoading(true);
    setQuestion("");
    setChats((prev) => [...prev, optimisticTurn]);

    try {
      const response = await fetch(`${API_URL}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          question: trimmed,
          subject: subjectName,
          classDate: selectedClass.classDate
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      // Update the optimistic turn immediately for snappy UI.
      setChats((prev) =>
        prev.map((chat) =>
          chat._id === tempId
            ? { ...chat, answer: data.answer || "", pending: false }
            : chat
        )
      );

      const params = new URLSearchParams({
        subject: subjectName,
        classDate: selectedClass.classDate
      });

      const historyResponse = await fetch(`${API_URL}/api/chat/history?${params.toString()}`, {
        headers: authHeaders
      });
      const historyData = await historyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(historyData.message);
      }

      setChats(Array.isArray(historyData.chats) ? [...historyData.chats].reverse() : []);
    } catch (error) {
      setChats((prev) => prev.filter((chat) => chat._id !== tempId));
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!selectedClass || !subjectName) {
      onError(new Error("Choose a class date first"));
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticTurn = {
      _id: tempId,
      question: "Generate a quiz for this class",
      answer: "",
      pending: true
    };

    setLoading(true);
    setChats((prev) => [...prev, optimisticTurn]);

    try {
      const response = await fetch(`${API_URL}/api/chat/quiz`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          subject: subjectName,
          classDate: selectedClass.classDate
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      if (data?.quizId && data?.quiz) {
        setQuizState((prev) => ({
          ...prev,
          [String(data.quizId)]: { answers: {}, submitted: false, result: null }
        }));
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat._id === tempId
            ? { ...chat, answer: data.answer || JSON.stringify({ quizId: data.quizId, quiz: data.quiz }), pending: false }
            : chat
        )
      );

      const params = new URLSearchParams({
        subject: subjectName,
        classDate: selectedClass.classDate
      });

      const historyResponse = await fetch(`${API_URL}/api/chat/history?${params.toString()}`, {
        headers: authHeaders
      });
      const historyData = await historyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(historyData.message);
      }

      setChats(Array.isArray(historyData.chats) ? [...historyData.chats].reverse() : []);
    } catch (error) {
      setChats((prev) => prev.filter((chat) => chat._id !== tempId));
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuizSelect = (quizId, questionId, optionKey) => {
    setQuizState((prev) => {
      const current = prev[String(quizId)] || { answers: {}, submitted: false, result: null };
      if (current.submitted) return prev;
      return {
        ...prev,
        [String(quizId)]: {
          ...current,
          answers: { ...current.answers, [questionId]: optionKey }
        }
      };
    });
  };

  const handleQuizSubmit = async (quizId) => {
    const state = quizState[String(quizId)] || { answers: {} };
    setLoading(true);

    try {
      const tempId = `temp-${Date.now()}`;
      setChats((prev) => [
        ...prev,
        { _id: tempId, question: "Submitting quiz...", answer: "", pending: true }
      ]);

      const response = await fetch(`${API_URL}/api/chat/quiz/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          quizId,
          answers: state.answers || {}
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setQuizState((prev) => ({
        ...prev,
        [String(quizId)]: {
          ...(prev[String(quizId)] || { answers: {} }),
          submitted: true,
          result: data
        }
      }));

      // Replace the temporary typing message with the saved score text immediately.
      setChats((prev) =>
        prev.map((chat) =>
          chat._id === tempId
            ? { ...chat, question: "Quiz submitted", answer: data?.score ? `Score: ${data.score.correct}/${data.score.total} (${data.score.percent}%)` : "Submitted", pending: false }
            : chat
        )
      );

      const params = new URLSearchParams({
        subject: subjectName,
        classDate: selectedClass.classDate
      });

      const historyResponse = await fetch(`${API_URL}/api/chat/history?${params.toString()}`, {
        headers: authHeaders
      });
      const historyData = await historyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(historyData.message);
      }

      setChats(Array.isArray(historyData.chats) ? [...historyData.chats].reverse() : []);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  if (!subjectRecord && safeSubjects.length > 0) {
    return <Navigate to="/subjects" replace />;
  }

  return (
    <section className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="sidebar-header">
          <Link className="back-link" to="/subjects">
            Back to shelf
          </Link>
          <p className="eyebrow">Subject Archive</p>
          <h2>{subjectName || "Loading subject"}</h2>
        </div>

        <div className="date-list">
          {pageLoading ? (
            <p className="empty-text">Loading class dates...</p>
          ) : classDates.length === 0 ? (
            <p className="empty-text">No class uploads for this subject yet.</p>
          ) : (
            classDates.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`date-pill ${selectedClass?.id === entry.id ? "date-pill-active" : ""}`}
                onClick={() => handleDateSelect(entry)}
              >
                <strong>{formatDate(entry.classDate)}</strong>
                <span>{entry.chunks} chunks</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="workspace-main">
        {!selectedClass ? (
          <section className="empty-panel">
            <h3>Select a date</h3>
            <p>The class notes, summary, uploaded PDF name, and chat will appear here.</p>
          </section>
        ) : (
          <>
            <article className="class-card">
              <div className="class-card-top">
                <div>
                  <p className="card-date">{formatDate(selectedClass.classDate)}</p>
                  <h3>{subjectName}</h3>
                </div>
                <strong className="chunk-badge">{selectedClass.chunks} chunks</strong>
              </div>

              <div className="class-meta">
                <span>Class date: {selectedClass.classDate.slice(0, 10)}</span>
                <span>Document: {selectedClass.fileName}</span>
                {selectedClass.teacherName ? <span>Teacher: {selectedClass.teacherName}</span> : null}
              </div>

              <div className="pdf-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={handleLoadPdf}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? "Loading PDF..." : "View PDF"}
                </button>
                {pdfError ? <p className="empty-text">{pdfError}</p> : null}
              </div>

              {pdfUrl ? (
                <div className="pdf-frame">
                  <iframe title="Class PDF" src={pdfUrl} />
                </div>
              ) : null}

              <div className="summary-content">{renderRichText(selectedClass.summary)}</div>
            </article>

            <section className="chat-shell">
              <section className="chat-thread">
                <div className="section-title">
                  <p className="eyebrow">Revision Memory</p>
                  <h3>Chat</h3>
                </div>

                {chats.length === 0 ? (
                  <p className="empty-text">No questions asked for this class yet.</p>
                ) : (
                  <div className="chat-messages">
                    {chats.map((chat) => (
                      <div className="chat-turn" key={chat._id}>
                        <div className="chat-row chat-row-user">
                          <div className="chat-bubble chat-bubble-user">
                            {renderRichText(chat.question)}
                          </div>
                        </div>
                        <div className="chat-row chat-row-assistant">
                          <div className="chat-bubble chat-bubble-assistant">
                            {chat.pending ? (
                              <div className="typing" aria-label="Assistant is typing">
                                <span />
                                <span />
                                <span />
                              </div>
                            ) : (() => {
                              const quizPayload = parseQuizPayload(chat.answer);
                              if (!quizPayload) return renderRichText(chat.answer);

                              const quizId = String(quizPayload.quizId);
                              const quiz = quizPayload.quiz;
                              const state = quizState[quizId] || { answers: {}, submitted: false, result: null };
                              const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
                              const breakdown = Array.isArray(state.result?.breakdown) ? state.result.breakdown : [];
                              const breakdownById = breakdown.reduce((acc, row) => {
                                if (row?.id) acc[row.id] = row;
                                return acc;
                              }, {});

                              const answered = Object.keys(state.answers || {}).length;
                              const total = questions.length;

                              return (
                                <div className="quiz-card">
                                  <div className="quiz-card-top">
                                    <div>
                                      <p className="eyebrow">Quiz</p>
                                      <h4 className="quiz-title">{quiz.title || "Class Quiz"}</h4>
                                      <p className="quiz-subtitle">
                                        {quiz.difficulty ? `Difficulty: ${quiz.difficulty}` : null}
                                        {total ? ` • ${answered}/${total} answered` : null}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="quiz-questions">
                                    {questions.map((q, idx) => {
                                      const selected = state.answers?.[q.id] || "";
                                      const options = q.options || {};
                                      const resultRow = breakdownById[q.id];
                                      const correct = resultRow?.correct || "";
                                      const isSubmitted = Boolean(state.submitted);
                                      return (
                                        <div className="quiz-q" key={q.id || idx}>
                                          <p className="quiz-qtext">
                                            <strong>{q.id || `Q${idx + 1}`}</strong>: {q.question}
                                          </p>
                                          <div className="quiz-options">
                                            {["A", "B", "C", "D"].map((key) => (
                                              <button
                                                key={key}
                                                type="button"
                                                className={[
                                                  "quiz-option",
                                                  selected === key ? "quiz-option-active" : "",
                                                  isSubmitted && correct === key ? "quiz-option-correct" : "",
                                                  isSubmitted && selected === key && correct && correct !== key ? "quiz-option-wrong" : ""
                                                ]
                                                  .filter(Boolean)
                                                  .join(" ")}
                                                onClick={() => handleQuizSelect(quizId, q.id, key)}
                                                disabled={loading || state.submitted}
                                              >
                                                <span className="quiz-option-key">{key}</span>
                                                <span className="quiz-option-text">{options?.[key] || ""}</span>
                                              </button>
                                            ))}
                                          </div>
                                          {state.submitted && resultRow ? (
                                            <div className="quiz-feedback">
                                              <p className="quiz-feedback-line">
                                                Correct: <strong>{resultRow.correct}</strong>
                                                {resultRow.selected ? (
                                                  <>
                                                    {" "}• You picked: <strong>{resultRow.selected}</strong>
                                                  </>
                                                ) : null}
                                              </p>
                                              {resultRow.explanation ? (
                                                <p className="quiz-explanation">{resultRow.explanation}</p>
                                              ) : null}
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="quiz-actions">
                                    <button
                                      className="primary-button"
                                      type="button"
                                      onClick={() => handleQuizSubmit(quizId)}
                                      disabled={loading || state.submitted || total === 0 || answered < total}
                                    >
                                      {state.submitted ? "Submitted" : "Submit quiz"}
                                    </button>
                                    {!state.submitted && total > 0 && answered < total ? (
                                      <p className="empty-text">Answer all questions to submit.</p>
                                    ) : null}
                                  </div>

                                  {state.result?.score ? (
                                    <div className="quiz-result">
                                      <p className="eyebrow">Score</p>
                                      <strong>
                                        {state.result.score.correct}/{state.result.score.total} ({state.result.score.percent}%)
                                      </strong>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={chatScrollRef} />
                  </div>
                )}
              </section>

              <form className="chat-composer chat-composer-sticky" onSubmit={handleAskQuestion}>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleAskQuestion(event);
                    }
                  }}
                  placeholder="Ask anything about this class..."
                  rows="3"
                />

                <div className="chat-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleGenerateQuiz}
                    disabled={loading || !selectedClass}
                  >
                    Quiz
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={loading || !question.trim()}
                  >
                    {loading ? "Thinking..." : "Send"}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </section>
    </section>
  );
};

const AttendanceViewer = ({ enrolmentNumber, setEnrolmentNumber, setNotice }) => {
  const [loading, setLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setNotice("");

    try {
      const data = await fetchAttendanceByEnrolment(enrolmentNumber);
      setAttendanceData(data);
      writeAttendanceCache(enrolmentNumber, data);
      setNotice("Attendance fetched");
    } catch (error) {
      setAttendanceData(null);
      setNotice(error.message || "Unable to fetch attendance");
    } finally {
      setLoading(false);
    }
  }, [enrolmentNumber, setNotice]);

  useEffect(() => {
    if (!enrolmentNumber) {
      setAttendanceData(null);
      return;
    }

    const cached = getCachedAttendance(enrolmentNumber);
    if (cached) {
      setAttendanceData(cached);
      return;
    }

    if (loading) return;
    handleFetch();
  }, [enrolmentNumber, handleFetch, loading]);

  const attends = Array.isArray(attendanceData?.attends) ? attendanceData.attends : [];
  const sortedAttends = useMemo(() => {
    return [...attends].sort((a, b) => {
      const aTime = a?.date ? new Date(a.date).getTime() : 0;
      const bTime = b?.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });
  }, [attends]);

  const attendanceStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unknown = 0;

    for (const entry of attends) {
      const status = String(entry?.status || "").toUpperCase();
      if (status === "P" || entry?.present === true) present += 1;
      else if (status === "A" || entry?.present === false) absent += 1;
      else unknown += 1;
    }

    const total = present + absent + unknown;
    const pct = total ? Math.round((present / total) * 100) : 0;

    return { present, absent, unknown, total, pct };
  }, [attends]);

  const getStatusBadge = (entry) => {
    const raw = String(entry?.status || "").toUpperCase();
    if (raw === "P") return { label: "Present", variant: "present" };
    if (raw === "A") return { label: "Absent", variant: "absent" };
    if (entry?.present === true) return { label: "Present", variant: "present" };
    if (entry?.present === false) return { label: "Absent", variant: "absent" };
    if (raw) return { label: raw, variant: "unknown" };
    return { label: "Unknown", variant: "unknown" };
  };

  return (
    <section className="student-shell">
      <div className="page-intro">
        <p className="eyebrow">Attendance</p>
        <h2>Fetch attendance by enrolment number.</h2>
        <p>Uses the attendance microservice configured in `VITE_ATTENDANCE_API_URL`.</p>
      </div>

      <section className="panel attendance-panel">
        <label>
          Enrolment number
          <input
            type="text"
            value={enrolmentNumber}
            onChange={(event) => setEnrolmentNumber(event.target.value.toUpperCase())}
            placeholder="ENR001"
          />
        </label>

        <button className="primary-button" type="button" onClick={handleFetch} disabled={loading}>
          {loading ? "Fetching..." : "Fetch attendance"}
        </button>

        {attendanceData?.student ? (
          <div className="attendance-student">
            <h3>{attendanceData.student?.name || "Student"}</h3>
            <p>
              {attendanceData.student?.enrolmentNumber
                ? `Enrolment: ${attendanceData.student.enrolmentNumber}`
                : null}
              {attendanceData.student?.course ? ` • Course: ${attendanceData.student.course}` : null}
            </p>
          </div>
        ) : null}

        {attendanceData ? (
          attends.length === 0 ? (
            <p className="empty-text">No attendance records found.</p>
          ) : (
            <>
              <div className="attendance-summary">
                <div className="attendance-summary-card">
                  <p className="eyebrow">Total</p>
                  <strong>{attendanceStats.total}</strong>
                </div>
                <div className="attendance-summary-card">
                  <p className="eyebrow">Present</p>
                  <strong>{attendanceStats.present}</strong>
                </div>
                <div className="attendance-summary-card">
                  <p className="eyebrow">Absent</p>
                  <strong>{attendanceStats.absent}</strong>
                </div>
                <div className="attendance-summary-card">
                  <p className="eyebrow">Attendance</p>
                  <strong>{attendanceStats.pct}%</strong>
                </div>
              </div>

              <div className="attendance-list">
                {sortedAttends.map((entry, index) => {
                  const badge = getStatusBadge(entry);
                  return (
                    <article
                      className="attendance-card"
                      key={entry?._id || `${entry?.date}-${index}`}
                    >
                      <div className="attendance-card-top">
                        <div>
                          <strong>{entry?.date ? formatDate(entry.date) : "Attendance"}</strong>
                          <p className="attendance-subtitle">
                            {entry?.enrolmentNumber ? `Enrolment: ${entry.enrolmentNumber}` : null}
                          </p>
                        </div>
                        <span className={`status-badge status-badge-${badge.variant}`}>
                          {badge.label}
                        </span>
                      </div>

                      <details className="attendance-details">
                        <summary>Details</summary>
                        <pre className="attendance-meta">{JSON.stringify(entry, null, 2)}</pre>
                      </details>
                    </article>
                  );
                })}
              </div>
            </>
          )
        ) : (
          <p className="empty-text">
            Enter an enrolment number and fetch to see attendance.
          </p>
        )}
      </section>

    </section>
  );
};

const TeacherDashboard = ({ authHeaders, user, onError, notice, setNotice }) => {
  const [pdfFile, setPdfFile] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    subject: user?.primarySubject || "",
    classDate: ""
  });
  const [teacherDocuments, setTeacherDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openingPdfId, setOpeningPdfId] = useState("");

  const fetchTeacherDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/pdf/documents`, {
        headers: authHeaders
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setTeacherDocuments(data.documents);
    } catch (error) {
      onError(error);
    }
  };

  useEffect(() => {
    fetchTeacherDocuments();
  }, []);

  useEffect(() => {
    setUploadForm((current) => ({
      ...current,
      subject: current.subject || user?.primarySubject || ""
    }));
  }, [user]);

  const handlePdfUpload = async (event) => {
    event.preventDefault();

    if (!pdfFile) {
      onError(new Error("Please select a PDF file"));
      return;
    }

    if (!uploadForm.subject || !uploadForm.classDate) {
      onError(new Error("Subject and class date are required"));
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("subject", uploadForm.subject);
      formData.append("classDate", uploadForm.classDate);

      const response = await fetch(`${API_URL}/api/pdf/upload`, {
        method: "POST",
        headers: authHeaders,
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setNotice(`${data.document.subject} uploaded for ${formatDate(data.document.classDate)}.`);
      setPdfFile(null);
      setUploadForm({
        subject: user?.primarySubject || uploadForm.subject,
        classDate: ""
      });
      event.target.reset();
      await fetchTeacherDocuments();
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTeacherPdf = useCallback(
    async (documentId) => {
      if (!documentId) return;
      setOpeningPdfId(String(documentId));
      setNotice("");

      try {
        const url = await fetchPdfObjectUrl({ documentId, authHeaders });
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        onError(error);
      } finally {
        setOpeningPdfId("");
      }
    },
    [authHeaders, onError, setNotice]
  );

  return (
    <section className="teacher-shell">
      <section className="teacher-hero panel">
        <div>
          <p className="eyebrow">Teacher Workspace</p>
          <h2>Upload class notes for your students.</h2>
          <p>
            Every PDF is indexed by subject and date, so students can later open the right class
            and chat with that day&apos;s content.
          </p>
        </div>
        <div className="teacher-badge">
          <span>Main subject</span>
          <strong>{user?.primarySubject || "Not set"}</strong>
        </div>
      </section>

      <section className="teacher-layout">
        <form className="panel upload-panel" onSubmit={handlePdfUpload}>
          <div className="section-title">
            <p className="eyebrow">Upload Notes</p>
            <h3>Add a class PDF</h3>
          </div>

          <label>
            Subject
            <input
              type="text"
              value={uploadForm.subject}
              onChange={(event) =>
                setUploadForm({ ...uploadForm, subject: event.target.value })
              }
              placeholder="DBMS"
            />
          </label>

          <label>
            Class date
            <input
              type="date"
              value={uploadForm.classDate}
              onChange={(event) =>
                setUploadForm({ ...uploadForm, classDate: event.target.value })
              }
            />
          </label>

          <label>
            PDF file
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setPdfFile(event.target.files[0])}
            />
          </label>

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Uploading..." : "Upload and index"}
          </button>
        </form>

        <section className="panel upload-history">
          <div className="section-title">
            <p className="eyebrow">Archive</p>
            <h3>Uploaded classes</h3>
          </div>

          {teacherDocuments.length === 0 ? (
            <p className="empty-text">No PDFs uploaded yet.</p>
          ) : (
            <div className="teacher-cards">
              {teacherDocuments.map((document) => (
                <article className="teacher-doc-card" key={document._id}>
                  <div className="class-card-top">
                    <div>
                      <p className="card-date">{formatDate(document.classDate)}</p>
                      <h4>{document.subject}</h4>
                    </div>
                    <strong className="chunk-badge">{document.totalChunks} chunks</strong>
                  </div>
                  <p className="doc-file">{document.originalFileName}</p>
                  {document._id ? (
                    <button
                      className="file-link"
                      type="button"
                      onClick={() => handleOpenTeacherPdf(document._id)}
                      disabled={openingPdfId === String(document._id)}
                    >
                      {openingPdfId === String(document._id) ? "Opening..." : "View PDF"}
                    </button>
                  ) : null}
                  <div className="summary-content">{renderRichText(document.summary)}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </section>
  );
};

const AuthScreen = ({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  onSubmit,
  loading,
  onPreviewAttendance,
  previewLoading,
  attendancePreview
}) => {
  return (
    <section className="auth-layout">
      <div className="info-panel">
        <p className="eyebrow">Classroom RAG</p>
        <h2>Build a digital class library where every subject has its own shelf and every date has its own learning memory.</h2>
        <p>
          Teachers upload PDFs by subject and class date. Students walk through a subject shelf,
          open a date, read the class summary, and chat to revise the lesson.
        </p>
      </div>

      <form className="panel auth-panel" onSubmit={onSubmit}>
        <div className="mode-switch">
          <button
            type="button"
            className={authMode === "login" ? "active" : ""}
            onClick={() => setAuthMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={authMode === "signup" ? "active" : ""}
            onClick={() => setAuthMode("signup")}
          >
            Signup
          </button>
        </div>

        {authMode === "signup" ? (
          <>
            <label>
              Name
              <input
                type="text"
                value={authForm.name}
                onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                placeholder="Your name"
              />
            </label>

            <label>
              Account role
              <select
                value={authForm.role}
                onChange={(event) => {
                  const role = event.target.value;
                  setAuthForm({
                    ...authForm,
                    role,
                    primarySubject: role === "teacher" ? authForm.primarySubject : ""
                  });
                }}
              >
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
            </label>

            {authForm.role === "teacher" ? (
              <label>
                Main subject
                <input
                  type="text"
                  value={authForm.primarySubject}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, primarySubject: event.target.value })
                  }
                  placeholder="DBMS"
                />
              </label>
            ) : (
              <>
                <label>
                  Enrolment number
                  <input
                    type="text"
                    value={authForm.enrolmentNumber}
                    onChange={(event) =>
                      setAuthForm({
                        ...authForm,
                        enrolmentNumber: event.target.value.toUpperCase()
                      })
                    }
                    placeholder="ENR001"
                  />
                </label>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={onPreviewAttendance}
                  disabled={previewLoading}
                >
                  {previewLoading ? "Checking..." : "Preview attendance"}
                </button>

                {attendancePreview ? (
                  <section className="preview-panel">
                    <p className="eyebrow">Attendance preview</p>
                    {attendancePreview?.student ? (
                      <p>
                        {attendancePreview.student?.name || "Student"}{" "}
                        {attendancePreview.student?.course
                          ? `• ${attendancePreview.student.course}`
                          : ""}
                      </p>
                    ) : null}
                    <p>
                      Records:{" "}
                      {Array.isArray(attendancePreview?.attends)
                        ? attendancePreview.attends.length
                        : 0}
                    </p>
                  </section>
                ) : null}
              </>
            )}
          </>
        ) : null}

        <label>
          Email
          <input
            type="email"
            value={authForm.email}
            onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={authForm.password}
            onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
            placeholder="Minimum 6 characters"
          />
        </label>

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Please wait..." : authMode === "signup" ? "Create account" : "Login"}
        </button>
      </form>
    </section>
  );
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("chatpdf_token") || "");
  const [user, setUser] = useState(getSavedUser);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "teacher",
    primarySubject: "",
    enrolmentNumber: ""
  });
  const [subjects, setSubjects] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [attendancePreview, setAttendancePreview] = useState(null);
  const [studentEnrolmentNumber, setStudentEnrolmentNumber] = useState("");

  const isLoggedIn = Boolean(token);
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const safeSubjects = Array.isArray(subjects) ? subjects : [];

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const showError = (error) => {
    setNotice(error.message || "Something went wrong");
  };

  const saveLogin = (data) => {
    localStorage.setItem("chatpdf_token", data.token);
    localStorage.setItem("chatpdf_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const hydrateStudentEnrolment = (email, enrolmentFromServer) => {
    if (enrolmentFromServer) {
      setStudentEnrolmentNumber(String(enrolmentFromServer));
      return;
    }

    if (user?.enrolmentNumber) {
      setStudentEnrolmentNumber(String(user.enrolmentNumber));
      return;
    }

    const mapping = readEnrolmentByEmail();
    const stored = mapping?.[email] ? String(mapping[email]) : "";
    setStudentEnrolmentNumber(stored);
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/api/learning/subjects`, {
        headers: authHeaders
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
    } catch (error) {
      showError(error);
    }
  };

  const handlePreviewAttendance = async () => {
    setPreviewLoading(true);
    setAttendancePreview(null);
    setNotice("");

    try {
      const data = await fetchAttendanceByEnrolment(authForm.enrolmentNumber);
      setAttendancePreview(data);
      setNotice("Attendance preview fetched");
    } catch (error) {
      setAttendancePreview(null);
      setNotice(error.message || "Unable to fetch attendance preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setNotice("");

    try {
      const url = `${API_URL}/api/auth/${authMode}`;
      const body =
        authMode === "signup"
          ? authForm
          : { email: authForm.email, password: authForm.password };

      if (
        authMode === "signup" &&
        body?.role === "student" &&
        !String(body?.enrolmentNumber || "").trim()
      ) {
        throw new Error("Enrolment number is required for student signup");
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      saveLogin(data);
      if (authMode === "signup" && body?.role === "student") {
        writeEnrolmentForEmail(data?.user?.email || body?.email, body.enrolmentNumber);
      }
      hydrateStudentEnrolment(
        data?.user?.email || body?.email,
        data?.user?.enrolmentNumber || body?.enrolmentNumber
      );
      setNotice(authMode === "signup" ? "Account created successfully" : "Login successful");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("chatpdf_token");
    localStorage.removeItem("chatpdf_user");
    setToken("");
    setUser(null);
    setSubjects([]);
    setNotice("Logged out");
    setAttendancePreview(null);
    setStudentEnrolmentNumber("");
    navigate("/");
  };

  useEffect(() => {
    if (!token || !isStudent) return;
    fetchSubjects();
  }, [token, isStudent]);

  useEffect(() => {
    setAttendancePreview(null);
  }, [authMode, authForm.role]);

  useEffect(() => {
    if (!isLoggedIn || !isStudent) return;
    hydrateStudentEnrolment(user?.email);
  }, [isLoggedIn, isStudent, user?.email]);

  useEffect(() => {
    if (!isLoggedIn || !isStudent) return;
    writeEnrolmentForEmail(user?.email, studentEnrolmentNumber);
  }, [isLoggedIn, isStudent, studentEnrolmentNumber, user?.email]);

  useEffect(() => {
    if (!isLoggedIn || !isStudent) return;
    if (!studentEnrolmentNumber) return;
    if (getCachedAttendance(studentEnrolmentNumber)) return;

    fetchAttendanceByEnrolment(studentEnrolmentNumber)
      .then((data) => {
        writeAttendanceCache(studentEnrolmentNumber, data);
      })
      .catch(() => {});
  }, [isLoggedIn, isStudent, studentEnrolmentNumber]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (isTeacher && location.pathname !== "/teacher") {
      navigate("/teacher", { replace: true });
    }

    if (isStudent && (location.pathname === "/" || location.pathname === "")) {
      navigate("/subjects", { replace: true });
    }
  }, [isLoggedIn, isTeacher, isStudent, location.pathname, navigate]);

  return (
    <main className="app-shell">
      <header className="top-shell">
        <div>
          <p className="eyebrow">RAG Library</p>
          <h1>Study by subject shelf, then by class day.</h1>
        </div>

        {isLoggedIn ? (
          <div className="user-box">
            <div>
              <strong>{user?.name}</strong>
              <p>{user?.role}</p>
            </div>
            <nav className="top-nav">
              {isStudent ? (
                <>
                  <NavLink className="nav-chip" to="/subjects">
                    Subjects
                  </NavLink>
                  <NavLink className="nav-chip" to="/attendance">
                    Attendance
                  </NavLink>
                </>
              ) : (
                <NavLink className="nav-chip" to="/teacher">
                  Teacher
                </NavLink>
              )}
              <button className="nav-chip nav-chip-button" type="button" onClick={logout}>
                Logout
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      {notice ? <p className="status-message">{notice}</p> : null}

      {!isLoggedIn ? (
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          authForm={authForm}
          setAuthForm={setAuthForm}
          onSubmit={handleAuthSubmit}
          loading={loading}
          onPreviewAttendance={handlePreviewAttendance}
          previewLoading={previewLoading}
          attendancePreview={attendancePreview}
        />
      ) : isTeacher ? (
        <Routes>
          <Route
            path="/teacher"
            element={
              <TeacherDashboard
                authHeaders={authHeaders}
                user={user}
                onError={showError}
                notice={notice}
                setNotice={setNotice}
              />
            }
          />
          <Route path="*" element={<Navigate to="/teacher" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/subjects" element={<SubjectShelf subjects={subjects} />} />
          <Route
            path="/attendance"
            element={
              <AttendanceViewer
                enrolmentNumber={studentEnrolmentNumber}
                setEnrolmentNumber={setStudentEnrolmentNumber}
                setNotice={setNotice}
              />
            }
          />
          <Route
            path="/subjects/:subjectSlug"
            element={
              <SubjectWorkspace
                authHeaders={authHeaders}
                subjects={safeSubjects}
                onError={showError}
              />
            }
          />
          <Route
            path="/subjects/:subjectSlug/:classId"
            element={
              <SubjectWorkspace
                authHeaders={authHeaders}
                subjects={safeSubjects}
                onError={showError}
              />
            }
          />
          <Route path="*" element={<Navigate to="/subjects" replace />} />
        </Routes>
      )}
    </main>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}

export default App;

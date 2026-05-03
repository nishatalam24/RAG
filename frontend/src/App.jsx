import React, { useEffect, useMemo, useState } from "react";
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

const renderRichText = (text) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const elements = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length === 0) return;

    elements.push(
      <ul className="rich-list" key={`list-${elements.length}`}>
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line) => {
    const cleanLine = line.replace(/\*\*/g, "").replace(/^#+\s*/, "");

    if (/^[-*]\s+/.test(line)) {
      listItems.push(cleanLine.replace(/^[-*]\s+/, ""));
      return;
    }

    flushList();

    if (/^#{1,6}\s*/.test(line)) {
      elements.push(
        <h4 className="rich-heading" key={`${cleanLine}-${elements.length}`}>
          {cleanLine}
        </h4>
      );
      return;
    }

    elements.push(
      <p className="rich-paragraph" key={`${cleanLine}-${elements.length}`}>
        {cleanLine}
      </p>
    );
  });

  flushList();

  return elements;
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
  const [chats, setChats] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
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

        setChats(data.chats);
      } catch (error) {
        onError(error);
      }
    };

    loadHistory();
  }, [authHeaders, onError, selectedClass, subjectName]);

  const handleDateSelect = (entry) => {
    setSelectedClass(entry);
    setAnswer("");
    navigate(`/subjects/${subjectSlug}/${entry.id}`);
  };

  const handleAskQuestion = async (event) => {
    event.preventDefault();

    if (!question.trim() || !selectedClass || !subjectName) {
      onError(new Error("Choose a class date and enter a question"));
      return;
    }

    setLoading(true);
    setAnswer("");

    try {
      const response = await fetch(`${API_URL}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          question,
          subject: subjectName,
          classDate: selectedClass.classDate
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setAnswer(data.answer);
      setQuestion("");

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

      setChats(historyData.chats);
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

              <div className="summary-content">{renderRichText(selectedClass.summary)}</div>
            </article>

            <section className="chat-grid">
              <form className="chat-composer" onSubmit={handleAskQuestion}>
                <div className="section-title">
                  <p className="eyebrow">Ask This Class</p>
                  <h3>Chat about what happened that day</h3>
                </div>

                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What are the main learning points from this class?"
                  rows="6"
                />

                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Thinking..." : "Ask about this class"}
                </button>

                {answer ? (
                  <article className="answer-panel">
                    <p className="eyebrow">Latest Answer</p>
                    <p>{answer}</p>
                  </article>
                ) : null}
              </form>

              <section className="history-panel">
                <div className="section-title">
                  <p className="eyebrow">Revision Memory</p>
                  <h3>Chat history</h3>
                </div>

                {chats.length === 0 ? (
                  <p className="empty-text">No questions asked for this class yet.</p>
                ) : (
                  <div className="history-list">
                    {chats.map((chat) => (
                      <article className="history-card" key={chat._id}>
                        <strong>Q: {chat.question}</strong>
                        <p>A: {chat.answer}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          </>
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
                    <a
                      className="file-link"
                      href={`${API_URL}/api/pdf/documents/${document._id}/file`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View PDF
                    </a>
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

const AuthScreen = ({ authMode, setAuthMode, authForm, setAuthForm, onSubmit, loading }) => {
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
            ) : null}
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
    primarySubject: ""
  });
  const [subjects, setSubjects] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

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
    navigate("/");
  };

  useEffect(() => {
    if (!token || !isStudent) return;
    fetchSubjects();
  }, [token, isStudent]);

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
                <NavLink className="nav-chip" to="/subjects">
                  Subjects
                </NavLink>
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

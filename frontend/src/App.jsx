import React, { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const getSavedUser = () => {
  const saved = localStorage.getItem("chatpdf_user");
  return saved ? JSON.parse(saved) : null;
};

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("chatpdf_token") || "");
  const [user, setUser] = useState(getSavedUser);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [pdfFile, setPdfFile] = useState(null);
  const [tags, setTags] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chats, setChats] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isLoggedIn = Boolean(token);

  const authHeaders = useMemo(() => {
    return {
      Authorization: `Bearer ${token}`
    };
  }, [token]);

  const saveLogin = (data) => {
    localStorage.setItem("chatpdf_token", data.token);
    localStorage.setItem("chatpdf_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const showError = (error) => {
    setMessage(error.message || "Something went wrong");
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

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
      setMessage(authMode === "signup" ? "Signup successful" : "Login successful");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePdfUpload = async (event) => {
    event.preventDefault();

    if (!pdfFile) {
      setMessage("Please select a PDF file");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("tags", tags);

      const response = await fetch(`${API_URL}/api/pdf/upload`, {
        method: "POST",
        headers: authHeaders,
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setMessage(`${data.message}. Chunks created: ${data.document.chunks}`);
      setPdfFile(null);
      setTags("");
      event.target.reset();
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api/chat/history`, {
        headers: authHeaders
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setChats(data.chats);
    } catch (error) {
      showError(error);
    }
  };

  const handleAskQuestion = async (event) => {
    event.preventDefault();

    if (!question.trim()) {
      setMessage("Please enter a question");
      return;
    }

    setLoading(true);
    setAnswer("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ question })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      setAnswer(data.answer);
      setQuestion("");
      await fetchHistory();
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
    setChats([]);
    setAnswer("");
    setMessage("Logged out");
  };

  useEffect(() => {
    fetchHistory();
  }, [token]);

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">ChatPDF</p>
          <h1>Ask your PDFs with personal memory</h1>
        </div>

        {isLoggedIn && (
          <div className="user-box">
            <span>{user?.name}</span>
            <button type="button" onClick={logout}>
              Logout
            </button>
          </div>
        )}
      </section>

      {message && <p className="status-message">{message}</p>}

      {!isLoggedIn ? (
        <section className="auth-layout">
          <div className="info-panel">
            <p className="eyebrow">Private workspace</p>
            <h2>Upload PDFs, tag them, and continue every answer from your last 20 chats.</h2>
            <p>
              Sign in first. After that, every PDF and every chat belongs only to your account.
            </p>
          </div>

          <form className="panel" onSubmit={handleAuthSubmit}>
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

            {authMode === "signup" && (
              <label>
                Name
                <input
                  type="text"
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, name: event.target.value })
                  }
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({ ...authForm, email: event.target.value })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
                placeholder="Minimum 6 characters"
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Please wait..." : authMode === "signup" ? "Create account" : "Login"}
            </button>
          </form>
        </section>
      ) : (
        <section className="dashboard">
          <form className="panel upload-panel" onSubmit={handlePdfUpload}>
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>Train a PDF</h2>
            </div>

            <label>
              PDF file
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setPdfFile(event.target.files[0])}
              />
            </label>

            <label>
              Tags
              <input
                type="text"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="dbms,database,sql"
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Uploading..." : "Upload PDF"}
            </button>
          </form>

          <section className="chat-panel">
            <form className="question-box" onSubmit={handleAskQuestion}>
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>Ask a question</h2>
              </div>

              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What is DBMS?"
                rows="5"
              />

              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? "Thinking..." : "Ask Gemini"}
              </button>
            </form>

            {answer && (
              <article className="answer-box">
                <p className="eyebrow">Latest answer</p>
                <p>{answer}</p>
              </article>
            )}
          </section>

          <section className="history-panel">
            <div className="history-title">
              <div>
                <p className="eyebrow">Memory</p>
                <h2>Chat history</h2>
              </div>
              <button type="button" onClick={fetchHistory}>
                Refresh
              </button>
            </div>

            {chats.length === 0 ? (
              <p className="empty-text">No chats yet.</p>
            ) : (
              <div className="history-list">
                {chats.map((chat) => (
                  <article className="history-item" key={chat._id}>
                    <strong>Q: {chat.question}</strong>
                    <p>A: {chat.answer}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}
    </main>
  );
}

export default App;

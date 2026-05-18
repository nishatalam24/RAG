import React, { useMemo, useState } from "react";

const DEFAULT_CPP = `#include <iostream>
using namespace std;

int main() {
  cout << "Hello, World!" << endl;

  int a, b;
  cin >> a >> b;
  cout << a + b;

  return 0;
}`;

function CodeEditor({ apiUrl }) {
  const baseUrl = useMemo(() => apiUrl || import.meta.env.VITE_API_URL || "http://localhost:5000", [apiUrl]);

  const [code, setCode] = useState(DEFAULT_CPP);
  const [inputs, setInputs] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleEditorChange = (value) => {
    setCode(value ?? "");
  };

  const runCode = async () => {
    setLoading(true);
    setConsoleOutput("");
    setAnalysis(null);

    const payload = {
      language: "cpp",
      code,
      inputs: inputs.split("\n")
    };

    try {
      const response = await fetch(`${baseUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConsoleOutput(`Error: ${data.output || data.message || response.statusText}`);
        return;
      }
      setConsoleOutput(data?.output ?? "");
    } catch (error) {
      setConsoleOutput(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const analyzeCode = async () => {
    setAnalyzing(true);
    setAnalysis(null);

    try {
      const response = await fetch(`${baseUrl}/api/code/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "cpp", code })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAnalysis({ success: false, message: data.message || data.raw || response.statusText });
        return;
      }
      setAnalysis(data);
    } catch (error) {
      setAnalysis({ success: false, message: error.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const applyImprovedCode = () => {
    const improved = analysis?.improvedCode;
    if (typeof improved === "string" && improved.trim()) setCode(improved);
  };

  return (
    <section style={{ width: "100%", maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>C/C++ Compiler</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Runs on your backend server ({baseUrl}).
      </p>

      <textarea
        value={code}
        onChange={(event) => setCode(event.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 360,
          marginTop: 8,
          fontSize: 14,
          padding: 12,
          borderRadius: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          background: "#1e1e1e",
          color: "white",
          border: "1px solid rgba(255,255,255,0.15)"
        }}
      />

      <textarea
        placeholder="Enter input for the program (one per line)"
        value={inputs}
        onChange={(event) => setInputs(event.target.value)}
        style={{
          width: "100%",
          height: "110px",
          marginTop: "10px",
          fontSize: "16px",
          padding: "10px",
          borderRadius: "8px"
        }}
        className="bg-black text-white"
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <button
          onClick={runCode}
          style={{
            backgroundColor: "#007bff",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          }}
          disabled={loading}
        >
          Run Code
        </button>

        <button
          onClick={analyzeCode}
          style={{
            backgroundColor: "#2d3748",
            color: "white",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          }}
          disabled={analyzing}
        >
          Analyze (LLM)
        </button>

        {analysis?.improvedCode ? (
          <button
            onClick={applyImprovedCode}
            style={{
              backgroundColor: "#16a34a",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer"
            }}
            type="button"
          >
            Replace With Improved Code
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ opacity: 0.8 }}>
          {loading ? "Running..." : analyzing ? "Analyzing..." : ""}
        </span>
      </div>

      <div
        style={{
          backgroundColor: "#1e1e1e",
          color: "white",
          marginTop: "20px",
          padding: "12px",
          borderRadius: "10px",
          minHeight: "120px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap"
        }}
      >
        {consoleOutput}
      </div>

      {analysis ? (
        <div
          style={{
            backgroundColor: "#0b1220",
            color: "white",
            marginTop: "14px",
            padding: "12px",
            borderRadius: "10px"
          }}
        >
          {analysis.success === false ? (
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {analysis.message || "Analysis failed"}
            </pre>
          ) : (
            <>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Time:</strong> {analysis.timeComplexity}
              </p>
              <p style={{ margin: "0 0 8px 0" }}>
                <strong>Space:</strong> {analysis.spaceComplexity}
              </p>
              {Array.isArray(analysis.issues) && analysis.issues.length ? (
                <>
                  <p style={{ margin: "10px 0 6px 0" }}>
                    <strong>Issues</strong>
                  </p>
                  <ul style={{ marginTop: 0 }}>
                    {analysis.issues.map((item, idx) => (
                      <li key={`issue-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {Array.isArray(analysis.suggestions) && analysis.suggestions.length ? (
                <>
                  <p style={{ margin: "10px 0 6px 0" }}>
                    <strong>Suggestions</strong>
                  </p>
                  <ul style={{ marginTop: 0 }}>
                    {analysis.suggestions.map((item, idx) => (
                      <li key={`sugg-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default CodeEditor;

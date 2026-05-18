import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateAnswer } from "../config/gemini.js";

const MAX_CODE_CHARS = Number(process.env.CODE_RUN_MAX_CODE_CHARS || 80_000);
const MAX_INPUT_CHARS = Number(process.env.CODE_RUN_MAX_INPUT_CHARS || 40_000);
const MAX_OUTPUT_CHARS = Number(process.env.CODE_RUN_MAX_OUTPUT_CHARS || 120_000);
const COMPILE_TIMEOUT_MS = Number(process.env.CODE_RUN_COMPILE_TIMEOUT_MS || 12_000);
const RUN_TIMEOUT_MS = Number(process.env.CODE_RUN_TIMEOUT_MS || 4_000);

const clampOutput = (text) => {
  const s = String(text ?? "");
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return `${s.slice(0, MAX_OUTPUT_CHARS)}\n\n[output truncated to ${MAX_OUTPUT_CHARS} chars]`;
};

const normalizeInputsToStdin = (inputs) => {
  if (inputs == null) return "";
  if (Array.isArray(inputs)) return `${inputs.join("\n")}\n`;
  return `${String(inputs)}\n`;
};

const runProcess = async ({ cmd, args, cwd, stdin, timeoutMs }) => {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const killTimer =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            killed = true;
            child.kill("SIGKILL");
          }, timeoutMs)
        : null;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > MAX_OUTPUT_CHARS * 2) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > MAX_OUTPUT_CHARS * 2) child.kill("SIGKILL");
    });

    child.on("error", (error) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode: null, stdout: "", stderr: String(error?.message || error), killed: false });
    });

    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode: code, stdout, stderr, killed });
    });

    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
};

const findCompiler = async (candidates) => {
  for (const candidate of candidates) {
    const res = await runProcess({
      cmd: candidate,
      args: ["--version"],
      cwd: process.cwd(),
      stdin: "",
      timeoutMs: 2500
    });
    if (res.exitCode === 0) return candidate;
  }
  return null;
};

export const runCode = async (req, res) => {
  const language = String(req.body?.language || "cpp").toLowerCase();
  const code = String(req.body?.code || "");
  const stdin = normalizeInputsToStdin(req.body?.inputs);

  if (!code.trim()) {
    return res.status(400).json({ success: false, message: "Missing `code`." });
  }
  if (code.length > MAX_CODE_CHARS) {
    return res.status(413).json({
      success: false,
      message: `Code too large. Max ${MAX_CODE_CHARS} characters.`
    });
  }
  if (stdin.length > MAX_INPUT_CHARS) {
    return res.status(413).json({
      success: false,
      message: `Input too large. Max ${MAX_INPUT_CHARS} characters.`
    });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-run-"));

  try {
    const isC = language === "c";
    const isCpp = language === "cpp" || language === "c++" || language === "cplusplus";
    if (!isC && !isCpp) {
      return res.status(400).json({ success: false, message: "Unsupported language. Use `c` or `cpp`." });
    }

    const sourceFile = path.join(tmpDir, isC ? "main.c" : "main.cpp");
    const outputFile = path.join(tmpDir, "a.out");
    await fs.writeFile(sourceFile, code, "utf8");

    const compiler =
      (isC ? process.env.CC : process.env.CXX) ||
      (await findCompiler(isC ? ["gcc", "clang"] : ["g++", "clang++"]));

    if (!compiler) {
      return res.status(500).json({
        success: false,
        message: "No C/C++ compiler found on server. Install gcc/clang, or set CC/CXX env vars."
      });
    }

    const compileArgs = isC
      ? ["-std=c11", "-O2", "-pipe", sourceFile, "-o", outputFile]
      : ["-std=c++17", "-O2", "-pipe", sourceFile, "-o", outputFile];

    const compileRes = await runProcess({
      cmd: compiler,
      args: compileArgs,
      cwd: tmpDir,
      stdin: "",
      timeoutMs: COMPILE_TIMEOUT_MS
    });

    if (compileRes.killed) {
      return res.status(408).json({ success: false, stage: "compile", output: "Compile timed out." });
    }

    if (compileRes.exitCode !== 0) {
      const compileOutput = clampOutput(`${compileRes.stdout}${compileRes.stderr}`);
      return res.status(400).json({ success: false, stage: "compile", output: compileOutput });
    }

    const runRes = await runProcess({
      cmd: outputFile,
      args: [],
      cwd: tmpDir,
      stdin,
      timeoutMs: RUN_TIMEOUT_MS
    });

    if (runRes.killed) {
      return res.status(408).json({ success: false, stage: "run", output: "Program timed out." });
    }

    const output = clampOutput(`${runRes.stdout}${runRes.stderr ? `\n${runRes.stderr}` : ""}`);
    return res.json({
      success: true,
      stage: "run",
      exitCode: runRes.exitCode,
      output
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error?.message || "Server error" });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
};

const extractJsonObject = (text) => {
  const s = String(text ?? "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export const analyzeCode = async (req, res) => {
  const language = String(req.body?.language || "cpp").toLowerCase();
  const code = String(req.body?.code || "");
  const userPrompt = String(req.body?.prompt || "");

  if (!code.trim()) return res.status(400).json({ success: false, message: "Missing `code`." });
  if (code.length > MAX_CODE_CHARS) {
    return res.status(413).json({ success: false, message: `Code too large. Max ${MAX_CODE_CHARS} characters.` });
  }

  try {
    const prompt = [
      "You are a strict code reviewer and algorithm analyst.",
      "Return ONLY valid JSON (no markdown, no backticks).",
      "Analyze the provided code and answer:",
      '- "timeComplexity": Big-O with a short explanation',
      '- "spaceComplexity": Big-O with a short explanation',
      '- "issues": array of correctness/edge-case/performance issues (strings)',
      '- "suggestions": array of actionable improvements (strings)',
      '- "improvedCode": a cleaned-up, safer, faster version in the SAME language, preserving the program behavior',
      "",
      `Language: ${language}`,
      userPrompt ? `Extra user request: ${userPrompt}` : "",
      "",
      "Code:",
      code
    ]
      .filter(Boolean)
      .join("\n");

    const llmText = await generateAnswer(prompt);
    const json = extractJsonObject(llmText);
    if (!json) {
      return res.status(502).json({
        success: false,
        message: "LLM returned non-JSON output. Try again.",
        raw: clampOutput(llmText)
      });
    }

    return res.json({ success: true, ...json });
  } catch (error) {
    return res.status(500).json({ success: false, message: error?.message || "Server error" });
  }
};


require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── LLM client (lazy — instantiated per-request so a missing key only
//    errors at extract time, not at server startup).
//    Groq exposes an OpenAI-compatible API, so we reuse the openai SDK
//    with Groq's baseURL. ─────────────────────────────────────────────────────
function getLLMClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// Groq-hosted model. gpt-oss-120b is a strong general-purpose chat model.
const MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";

// ── Extraction prompt (mirrors extractor-rules.md) ───────────────────────────
const SYSTEM_PROMPT = `You are a college announcement processor. When given raw notice text, extract and return a structured Markdown document with exactly these four sections:

## What Changed
A concise 1–2 sentence summary of the policy, schedule, or facility change.

## Target Audience
A bullet list of the specific student groups affected (e.g. Seniors, Resident Students, Financial Aid Applicants).

## Important Dates & Deadlines
A chronological bullet list of every hard date and deadline mentioned.

## Required Action Checklist
A checkbox list using - [ ] format with every mandatory step a student must take.

Rules:
- Be direct and actionable. Remove all administrative fluff.
- If a date or action is specific to a subgroup, note that inline (e.g. "Graduating seniors only").
- Output only the Markdown — no preamble, no closing remarks.`;

// ── POST /api/extract ─────────────────────────────────────────────────────────
app.post("/api/extract", async (req, res) => {
  const { noticeText } = req.body;

  if (!noticeText || noticeText.trim().length === 0) {
    return res.status(400).json({ error: "noticeText is required." });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
  }

  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: noticeText.trim() },
      ],
      temperature: 0.2,
    });

    const markdown = completion.choices[0].message.content;
    res.json({ markdown });
  } catch (err) {
    console.error("LLM error:", err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Serve index.html for all other routes ────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ College Notice Extractor running at http://localhost:${PORT}`);
});

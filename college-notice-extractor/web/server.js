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

// ── OpenAI client (lazy — instantiated per-request so missing key only
//    errors at extract time, not at server startup) ──────────────────────────
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
  }

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: noticeText.trim() },
      ],
      temperature: 0.2,
    });

    const markdown = completion.choices[0].message.content;
    res.json({ markdown });
  } catch (err) {
    console.error("OpenAI error:", err.message);
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

import type { ResumeData } from "../database/models.js";
import type { JobDetails } from "../scraper/parser.js";

export interface GeminiScoreResponse {
  score: number;
  matchReasons: string[];
}

export class GeminiClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not set in environment variables");
    }
  }

  async scoreJob(
    resume: ResumeData,
    job: JobDetails
  ): Promise<GeminiScoreResponse> {
    // Example prompt for Gemini LLM
    const prompt = `Given the following resume and job description, score the match (0-1) and list reasons for the score.\nResume: ${JSON.stringify(
      resume
    )}\nJob: ${JSON.stringify(job)}`;

    // Call Gemini API (replace with actual endpoint and payload)
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        this.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    const data = await response.json();

    // Parse Gemini response (assume score and reasons in text)
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Example: "Score: 0.75\nReasons: ..."
    const scoreMatch = text.match(/Score:\s*(\d*\.?\d+)/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const reasonsMatch = text.match(/Reasons?:\s*([\s\S]*)/i);
    const matchReasons = reasonsMatch
      ? reasonsMatch[1]
          .split(/\n|\r/)
          .map((r: string) => r.trim())
          .filter(Boolean)
      : [];

    return { score, matchReasons };
  }
}

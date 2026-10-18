
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 5000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "https://tweet-brand-backend-node-y8iu.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Gemini configuration
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is missing.");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ message: "Backend is running!" });
});

// Generate 10 tweets
app.post("/api/tweets/generate", async (req, res) => {
  const { brandName, industry, objective, productDetails } = req.body;

  if (
    !objective ||
    typeof productDetails !== "string" ||
    !productDetails.trim()
  ) {
    return res.status(400).json({
      error: "Campaign objective and product details are required.",
    });
  }

  const prompt = `
You are an expert brand strategist and social media copywriter.

Analyze this brand and generate exactly 10 unique tweets.

BRAND DETAILS
Brand: ${brandName || "Not specified"}
Industry: ${industry || "Not specified"}
Objective: ${objective}
Product details: ${productDetails}

TASK
1. Identify exactly four brand voice traits.
2. Write a concise brand voice summary.
3. Identify the campaign tone and explain it.
4. Identify the target audience.
5. Describe the communication style.
6. Generate exactly 10 distinct tweets suitable for X.

RULES
- Keep tweets concise and engaging.
- Align tweets with the campaign objective.
- Do not invent product features, statistics, or claims.
- Avoid repetitive ideas.
- Return ONLY valid JSON in this structure:

{
  "brandVoice": ["Trait 1", "Trait 2", "Trait 3", "Trait 4"],
  "brandVoiceSummary": "Brand voice summary",
  "brandTone": "Campaign tone",
  "toneExplanation": "Explanation of campaign tone",
  "targetAudience": "Target audience",
  "communicationStyle": "Communication style",
  "tweets": [
    "Tweet 1", "Tweet 2", "Tweet 3", "Tweet 4", "Tweet 5",
    "Tweet 6", "Tweet 7", "Tweet 8", "Tweet 9", "Tweet 10"
  ]
}
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const result = JSON.parse(response.text);

    if (
      !Array.isArray(result.brandVoice) ||
      result.brandVoice.length !== 4 ||
      typeof result.brandVoiceSummary !== "string" ||
      typeof result.brandTone !== "string" ||
      typeof result.toneExplanation !== "string" ||
      typeof result.targetAudience !== "string" ||
      typeof result.communicationStyle !== "string" ||
      !Array.isArray(result.tweets) ||
      result.tweets.length !== 10 ||
      !result.tweets.every(
        (tweet) => typeof tweet === "string" && tweet.trim()
      )
    ) {
      throw new Error("Invalid AI response structure.");
    }

    return res.json(result);
  } catch (error) {
    console.error("Tweet generation failed:", error.message);

    const message = String(error.message || error);

    if (
      message.includes("503") ||
      message.includes("UNAVAILABLE") ||
      message.includes("high demand")
    ) {
      return res.status(503).json({
        error: "The AI service is temporarily busy. Please try again shortly.",
      });
    }

    return res.status(500).json({
      error: "Tweet generation failed. Check backend logs.",
    });
  }
});

// Regenerate one tweet
app.post("/api/tweets/regenerate", async (req, res) => {
  const {
    brandName,
    industry,
    objective,
    productDetails,
    brandVoice,
    brandVoiceSummary,
    brandTone,
    toneExplanation,
    targetAudience,
    communicationStyle,
    existingTweets,
    tweetIndex,
  } = req.body;

  if (
    !objective ||
    typeof productDetails !== "string" ||
    !productDetails.trim() ||
    !Array.isArray(existingTweets) ||
    existingTweets.length !== 10 ||
    !existingTweets.every((tweet) => typeof tweet === "string") ||
    !Number.isInteger(tweetIndex) ||
    tweetIndex < 0 ||
    tweetIndex >= 10
  ) {
    return res.status(400).json({
      error: "Invalid campaign details or tweet selection.",
    });
  }

  const prompt = `
You are an expert brand strategist and social media copywriter.

Generate ONE replacement tweet.

CAMPAIGN DETAILS
Brand: ${brandName || "Not specified"}
Industry: ${industry || "Not specified"}
Objective: ${objective}
Product details: ${productDetails}

BRAND STRATEGY
Brand voice: ${JSON.stringify(brandVoice || [])}
Brand voice summary: ${brandVoiceSummary || "Not specified"}
Campaign tone: ${brandTone || "Not specified"}
Tone explanation: ${toneExplanation || "Not specified"}
Target audience: ${targetAudience || "Not specified"}
Communication style: ${communicationStyle || "Not specified"}

CURRENT TWEETS
${existingTweets
  .map(
    (tweet, index) =>
      `${index + 1}${index === tweetIndex ? " (REPLACE THIS)" : ""}: ${tweet}`
  )
  .join("\n")}

Replace only tweet ${tweetIndex + 1}.
Preserve the brand strategy. Do not invent product claims.
Make the new tweet different from the other nine.
Return ONLY valid JSON:
{"tweet":"Your replacement tweet"}
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const result = JSON.parse(response.text);

    if (typeof result.tweet !== "string" || !result.tweet.trim()) {
      throw new Error("Invalid replacement tweet.");
    }

    const replacement = result.tweet.trim();

    const duplicate = existingTweets.some(
      (tweet, index) =>
        index !== tweetIndex &&
        tweet.trim().toLowerCase() === replacement.toLowerCase()
    );

    if (duplicate) {
      return res.status(502).json({
        error: "The AI returned a duplicate tweet. Please try again.",
      });
    }

    return res.json({ tweet: replacement });
  } catch (error) {
    console.error("Tweet regeneration failed:", error.message);

    const message = String(error.message || error);

    if (
      message.includes("503") ||
      message.includes("UNAVAILABLE") ||
      message.includes("high demand")
    ) {
      return res.status(503).json({
        error: "The AI service is temporarily busy. Please try again shortly.",
      });
    }

    return res.status(500).json({
      error: "Tweet regeneration failed. Check backend logs.",
    });
  }
});

// Local development
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

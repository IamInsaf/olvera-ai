// functions/summarizeWebsite.js

const functions = require("firebase-functions/v1");
const { GoogleAuth } = require("google-auth-library");
const { VertexAI } = require("@google-cloud/vertexai");
const axios = require("axios");

const project = "promgn-in"; // your project ID
const location = "us-central1"; // or your Vertex region

const vertexAI = new VertexAI({ project, location });

const model = vertexAI.getGenerativeModel({ model: "gemini-1.5-pro" });

exports.summarizeWebsite = functions.https.onCall(async (data, context) => {
  const { url } = data;

  if (!url) {
    throw new functions.https.HttpsError("invalid-argument", "URL is required");
  }

  try {
    const response = await axios.get(url);
    const htmlText = response.data;

    const prompt = `Summarize the main content of this webpage:\n\n${htmlText.slice(0, 8000)}`; // truncate for prompt length

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const summary = result.response.candidates[0]?.content?.parts[0]?.text;

    return { summary };
  } catch (error) {
    console.error("Error:", error.message);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Initialize Vertex AI v1
const vertexAI = new VertexAI({
  project: "promgn-in",
  location: "us-central1",
});

const model = vertexAI.preview.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.85,
    topP: 0.95,
    topK: 40,
  },
});

exports.bornTalentAnalysis = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to use this feature."
    );
  }

  const userId = context.auth.uid;

  try {
    const { questions, confidenceScores } = data;

    if (!questions || !confidenceScores) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing questions or confidence scores."
      );
    }

    // Format answers
    let formattedAnswers = "";
    for (let i = 1; i <= 20; i++) {
      const question = questions[`q${i}`]?.q || "";
      const answer = questions[`q${i}`]?.a || "";
      const confidence = confidenceScores[`q${i}`] ?? 5;

      formattedAnswers += `Q${i}: ${question}\nA: ${answer}\nConfidence: ${confidence}/10\n\n`;
    }

    // Build prompt
    const prompt = `
You are a professional career psychologist AI. Analyze the following answers and confidence levels for 20 personality/talent questions. Based on the patterns, categorize the user's born talents into suitable groups like:
- Logical/Analytical
- Creative/Artistic
- Leadership/Interpersonal
- Linguistic/Communication
- Spatial/Visual
- Physical/Kinesthetic
- Emotional Intelligence
- Curiosity and Learning

Explain clearly with categories, a short summary of the user's natural strengths, and 2–3 career paths they should explore.

Answers:
${formattedAnswers}
    `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const output = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!output) {
      throw new Error("No valid output from Vertex AI");
    }

    // Save insights to Firestore
    await db.collection("talent").doc(userId).collection("discovery").add({
      rawPrompt: prompt,
      insights: output,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      insights: output,
      generatedAt: new Date().toISOString(),
    };

  } catch (error) {
    console.error("Error in bornTalentAnalysis:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Talent analysis failed.",
      { errorDetails: error.message }
    );
  }
});

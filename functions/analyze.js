// analyze.js
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({ project: "YOUR_PROJECT_ID", location: "us-central1" });
const model = vertexAI.getGenerativeModel({ model: "gemini-1.5-pro" });

admin.initializeApp();
const db = admin.firestore();

const generateNextQuestion = async (req, res) => {
  try {
    const { userId } = req.body;
    const snapshot = await db
      .collection("interviews")
      .doc(userId)
      .collection("conversation")
      .orderBy("timestamp")
      .get();

    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      return `Q: ${data.question}\nA: ${data.answer} (emotion: ${data.emotion})`;
    }).join("\n");

    const prompt = `
You're an AI career mentor. Based on this conversation, ask a meaningful next question.

Conversation so far:
${history}

Your next question:
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const nextQuestion = result.response.candidates[0].content.parts[0].text;

    res.json({ nextQuestion });
  } catch (error) {
    console.error("Error generating next question:", error);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = { generateNextQuestion };

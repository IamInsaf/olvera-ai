const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const {VertexAI} = require("@google-cloud/vertexai");

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: "promgn-in",
  location: "us-central1",
});

const model = vertexAI.preview.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.9,
  },
});

exports.voicesugges = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to get career suggestions."
    );
  }

  const userId = context.auth.uid;

  try {
    // Get user interactions from the specified Firestore path
    const interactionsRef = db.collection("conversations")
        .doc(userId)
        .collection("interactions");
    
    const snapshot = await interactionsRef
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

    if (snapshot.empty) {
      throw new functions.https.HttpsError(
          "not-found",
          "No conversation history found for this user."
      );
    }

    // Format interactions for the prompt
    const interactions = snapshot.docs.map((doc) => {
      const interactionData = doc.data();
      return {
        question: interactionData.question || "No question recorded",
        answer: interactionData.answer || "No answer recorded",
        ...(interactionData.emotion && {emotion: interactionData.emotion}),
        ...(interactionData.timestamp && {timestamp: interactionData.timestamp}),
      };
    });

    // Construct the prompt for career suggestions
    const prompt = `You are a career guidance AI analyzing a user's conversation history to recommend their best next step.

    User's recent interactions:
    ${interactions.map((interaction, index) => `
    Interaction ${index + 1}:
    Question: ${interaction.question}
    Answer: ${interaction.answer}
    ${interaction.emotion ? `Emotion: ${interaction.emotion}` : ''}
    `).join("\n")}
    
    Provide exactly 3 actionable next steps for the user in this format:
    
    - **Next Step 1: [Action Name]**
      - **Why It Fits**: How this step aligns with the user's conversation history
      - **Expected Benefit**: Specific advantage this step offers
      - **Market Relevance**: Brief outlook on how this step positions the user (1 sentence)
    
    - **Next Step 2: [Action Name]**
      - **Why It Fits**: How this step aligns with the user's conversation history
      - **Expected Benefit**: Specific advantage this step offers
      - **Market Relevance**: Brief outlook on how this step positions the user (1 sentence)
    
    - **Next Step 3: [Action Name]**
      - **Why It Fits**: How this step aligns with the user's conversation history
      - **Expected Benefit**: Specific advantage this step offers
      - **Market Relevance**: Brief outlook on how this step positions the user (1 sentence)
    
    - **AI's Recommendation**:
      - **Top Suggested Step**: [Strongest recommended action]
      - **Why Top Pick**: Why this is the best choice
      - **If I Were You**: What the AI would do in the user's position
    
    Return only the formatted recommendations. No additional text or explanations outside the specified format.`;

    // Generate content with Vertex AI
    const result = await model.generateContent({
      contents: [{role: "user", parts: [{text: prompt}]}],
    });

    // Validate and process the AI response
    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("AI response was not in the expected format");
    }

    const suggestions = result.response.candidates[0].content.parts[0].text.trim();

    // Save suggestions to Firestore in the conversations collection
    await db.collection("conversations").doc(userId).set({
      voiceSuggestions: suggestions,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      success: true,
      suggestions: suggestions,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error("Error in voicesugges function:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Failed to generate voice suggestions",
        {errorDetails: error.message}
    );
  }
});
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
    temperature: 0.7, // Slightly lower temperature for more focused analysis
  },
});

exports.analyzeTalentData = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to analyze talent data."
    );
  }

  const userId = context.auth.uid;

  try {
    // Get talent data from Firestore
    const talentDocRef = db.collection("talent").doc(userId);
    const talentDoc = await talentDocRef.get();

    if (!talentDoc.exists) {
      throw new functions.https.HttpsError(
          "not-found",
          "No talent data found for this user."
      );
    }

    const talentData = talentDoc.data();

    // Construct the prompt for talent analysis
    const prompt = `You are a talent analysis AI reviewing a user's professional profile to provide insights and recommendations.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}

    Provide a comprehensive analysis in this exact format:

    - **Strengths Analysis**:
      - [List 3-5 key strengths with brief explanations]
    
    - **Growth Opportunities**:
      - [List 3-5 areas for improvement with actionable suggestions]
    
    - **Career Alignment**:
      - [Analyze how well current profile aligns with stated goals]
      - [Identify any gaps or mismatches]
    
    - **Market Positioning**:
      - [Assess competitive positioning in current field]
      - [Highlight unique value propositions]
    
    - **Recommendations**:
      1. [Priority recommendation 1 with implementation steps]
      2. [Priority recommendation 2 with implementation steps]
      3. [Priority recommendation 3 with implementation steps]
    
    - **Projected Growth Path**:
      - [Outline potential 6-month development trajectory]
      - [Key milestones to target]
    
    Return only the formatted analysis. No additional text or explanations outside the specified format.`;

    // Generate content with Vertex AI
    const result = await model.generateContent({
      contents: [{role: "user", parts: [{text: prompt}]}],
    });

    // Validate and process the AI response
    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("AI response was not in the expected format");
    }

    const analysis = result.response.candidates[0].content.parts[0].text.trim();

    // Store the result in talent/user.uid/result
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("analysis");
    await resultDocRef.set({
      analysis: analysis,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      analysis: analysis,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error("Error in analyzeTalentData function:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Failed to analyze talent data",
        {errorDetails: error.message}
    );
  }
});
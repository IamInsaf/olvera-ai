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
    temperature: 0.5, // Lower temperature for more precise matching
  },
});

exports.askany = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to analyze job opportunities."
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

    // Get saved job opportunity
    const jobDocRef = db.collection("talent").doc(userId).collection("any").doc("saved");
    const jobDoc = await jobDocRef.get();

    if (!jobDoc.exists) {
      throw new functions.https.HttpsError(
          "not-found",
          "No saved job opportunity found for this user."
      );
    }

    const talentData = talentDoc.data();
    const jobData = jobDoc.data();

    // Construct the prompt for job compatibility analysis
    const prompt = `You are a smart skill-matching and goal-evaluation AI. A user has asked a question or expressed an interest (like a career path, goal, opportunity, or idea). Based on their talent/skill profile, evaluate how well they align with what’s typically needed for success in that area.

    User's Skill Profile:
    ${JSON.stringify(talentData, null, 2)}
    
    User's Question or Goal:
    ${JSON.stringify(jobData, null, 2)}
    
    Give a detailed analysis in this **exact format**:
    
    - **Relevance Score**: [X]%
      - (How well the user's current skill profile fits the goal or area of interest)
    
    - **Aligned Strengths**:
      - [List 3-5 skills or traits that support success in the user's stated goal]
      - Briefly explain why each one is relevant
    
    - **Potential Gaps or Challenges**:
      - [List skills or personality areas that may need improvement]
      - Explain how they could affect progress toward the goal
    
    - **Missing Core Abilities**:
      - [List important skills/traits typically required for the goal that the user currently lacks]
    
    - **Bonus Assets**:
      - [List any user skills or traits that, while not required, could be a unique advantage]
    
    - **AI Verdict**:
      - [One of: "Highly Aligned", "Good Fit", "Needs Growth", "Unlikely Fit"]
      - [1-2 sentence explanation based on strengths and gaps]
    
    - **Personal Suggestions**:
      - [List 2-3 actionable recommendations for the user to better pursue or prepare for this goal]
      - Can include skill improvement, mindset shift, learning, or real-world action
    
    Only return the formatted result. Do not include any extra explanation or commentary.`;
    
    // Generate content with Vertex AI
    const result = await model.generateContent({
      contents: [{role: "user", parts: [{text: prompt}]}],
    });

    // Validate and process the AI response
    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("AI response was not in the expected format");
    }

    const analysis = result.response.candidates[0].content.parts[0].text.trim();

    // Extract the compatibility score from the analysis
    const scoreMatch = analysis.match(/Relevance Score.*?(\d+)%/);
    const compatibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Store the result in talent/user.uid/jobsearch/result
    const resultDocRef = db.collection("talent").doc(userId).collection("any").doc("result");
    await resultDocRef.set({
      analysis: analysis,
      compatibilityScore: compatibilityScore,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      analysis: analysis,
      compatibilityScore: compatibilityScore,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error("Error in analyzeJobOpportunity function:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Failed to analyze job opportunity",
        {errorDetails: error.message}
    );
  }
});
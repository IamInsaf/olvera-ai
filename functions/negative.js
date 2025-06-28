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

exports.negative = functions.https.onCall(async (data, context) => {
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
    const prompt = `You are a talent analysis AI reviewing a user's professional profile to provide a brutally honest assessment, focusing on weaknesses, deficiencies, and areas of concern, with no sugarcoating.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}
    
    Provide a comprehensive analysis in this exact format:
    
    - **Weaknesses Analysis**:
      - [List 4-6 critical weaknesses with detailed explanations of their negative impact]
      
    - **Problematic Areas**:
      - [Identify 3-5 specific deficiencies or flaws that hinder performance]
      - [Explain how these issues undermine success in their field]
    
    - **Career Misalignment**:
      - [Evaluate how poorly the current profile aligns with stated goals]
      - [Highlight specific gaps or mismatches that pose significant risks]
    
    - **Market Weaknesses**:
      - [Assess the user’s lack of competitive positioning in their industry]
      - [Identify areas where they fail to stand out or add value]
    
    - **Corrective Actions**:
      1. [Critical action 1 to address a major weakness with specific steps]
      2. [Critical action 2 to address a major weakness with specific steps]
      3. [Critical action 3 to address a major weakness with specific steps]
    
    - **Risk Mitigation Path**:
      - [Outline a 6-12 month trajectory to address deficiencies]
      - [List key milestones to correct critical issues]
    
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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("negative");
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
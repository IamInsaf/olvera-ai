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

exports.born = functions.https.onCall(async (data, context) => {
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
    const prompt = `You are a talent analysis AI reviewing a user's professional profile to identify and highlight their innate talents and natural abilities, providing a detailed assessment of their inherent strengths.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}
    
    Provide a comprehensive analysis in this exact format:
    
    - **Innate Talents**:
      - [List 4-6 natural talents with detailed explanations of their inherent nature and impact]
      
    - **Unique Natural Abilities**:
      - [Identify 3-5 distinctive innate skills or qualities that set the user apart]
      - [Explain how these abilities provide a foundation for success in their field]
    
    - **Career Alignment with Talents**:
      - [Evaluate how well the user’s innate talents align with their stated career goals]
      - [Highlight any areas where talents are underutilized or misaligned]
    
    - **Market Advantage**:
      - [Assess how the user’s innate talents position them competitively in their industry]
      - [Highlight unique natural strengths that differentiate them]
    
    - **Development Opportunities**:
      1. [Opportunity 1: Describe a way to leverage an innate talent with actionable steps]
      2. [Opportunity 2: Describe a way to leverage an innate talent with actionable steps]
      3. [Opportunity 3: Describe a way to leverage an innate talent with actionable steps]
    
    - **Future Potential**:
      - [Outline a 6-12 month trajectory to maximize innate talents]
      - [List key milestones to enhance and showcase natural abilities]
    
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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("bornt");
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
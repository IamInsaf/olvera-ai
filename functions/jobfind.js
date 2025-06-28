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

exports.analyzeJobOpportunity = functions.https.onCall(async (data, context) => {
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
    const jobDocRef = db.collection("talent").doc(userId).collection("jobsearch").doc("saved");
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
    const prompt = `You are a career matching AI analyzing how well a job opportunity aligns with a user's profile.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}

    Job Opportunity Details:
    ${JSON.stringify(jobData, null, 2)}

    Provide a comprehensive analysis in this exact format:

    - **Job Compatibility Score**: [X]% 
      - (Calculate a percentage score based on skills match, experience alignment, and career goals)

    - **Key Strengths Alignment**:
      - [List 3-5 ways the job matches the user's strengths]
    
    - **Potential Gaps**:
      - [List any significant mismatches between job requirements and user profile]
    
    - **Growth Potential**:
      - [Analyze how this job could help the user grow professionally]
    
    - **Risk Assessment**:
      - [Identify any potential risks or challenges the user might face]
    
    - **Recommendation**:
      - [Clear recommendation: "Strong Match", "Good Match", "Moderate Match", or "Poor Match"]
      - [1-2 sentence justification for the recommendation]
    
    - **Next Steps**:
      - [List 2-3 specific actions the user should take if interested in this opportunity]
    
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

    // Extract the compatibility score from the analysis
    const scoreMatch = analysis.match(/Job Compatibility Score.*?(\d+)%/);
    const compatibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Store the result in talent/user.uid/jobsearch/result
    const resultDocRef = db.collection("talent").doc(userId).collection("jobsearch").doc("result");
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
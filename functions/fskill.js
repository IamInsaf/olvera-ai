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

exports.analyzeskills = functions.https.onCall(async (data, context) => {
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
    const prompt = `You are a skill matching AI analyzing how well a job's required skills align with a user's skill profile.

User's Skill Profile:
    ${JSON.stringify(talentData, null, 2)}

    required skill:
    ${JSON.stringify(jobData, null, 2)}

    Provide a comprehensive skill analysis in this exact format:

- **Skill Match Score**: [X]% 
  - (Calculate a percentage based on matching skills, proficiency levels, and required vs. possessed skills)

- **Strong Skill Matches**:
  - [List 3-5 skills that are excellent matches between user and job]
  - Include proficiency comparison for each

- **Partial Matches**:
  - [List skills where the user has some capability but may need improvement]
  - Note the gap for each (e.g., "User: Intermediate, Job requires: Advanced")

- **Missing Skills**:
  - [List any skills required by the job that the user lacks]

- **Bonus Skills**:
  - [List any valuable skills the user has that exceed job requirements]

- **Recommendation**:
  - [Clear recommendation: "Excellent Skill Fit", "Good Skill Fit", "Partial Skill Fit", or "Poor Skill Fit"]
  - [1-2 sentence justification]

- **Skill Development Suggestions**:
  - [List 2-3 specific skills to improve for better alignment]
  
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
    const scoreMatch = analysis.match(/Skill Match Score.*?(\d+)%/);
    const compatibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Store the result in talent/user.uid/jobsearch/result
    const resultDocRef = db.collection("talent").doc(userId).collection("skillsearch").doc("result");
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
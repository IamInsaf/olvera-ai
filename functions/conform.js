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

exports.coursesug = functions.https.onCall(async (data, context) => {
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
      const prompt = `You are a talent-matching AI analyzing a user's talent profile to identify the 3 most suitable career-oriented courses that align with their innate strengths and natural abilities.

      User's Talent Profile:
      ${JSON.stringify(talentData, null, 2)}
      
      Provide a highly accurate, talent-driven course recommendation in the exact format below:
      
      - **Top 3 Course Recommendations**:
        1. **[Course Name]**
           - **Why this fits**: [Explain how this course aligns with the user's strongest innate talents and natural strengths]
           - **Career Path**: [Mention the primary career roles this course leads to]
           - **Required Strengths**: [Highlight which of the user’s talents match well with the course demands]
      
        2. **[Course Name]**
           - **Why this fits**: [Explain how this course complements the user's core abilities and gives them an edge]
           - **Career Path**: [Mention the key job roles or industries this course connects to]
           - **Required Strengths**: [List matching natural abilities]
      
        3. **[Course Name]**
           - **Why this fits**: [Describe how this course develops underutilized talents or unlocks unique strengths]
           - **Career Path**: [State the relevant professional applications]
           - **Required Strengths**: [Match with talents from the profile]
      
      - **Talent-to-Course Fit Summary**:
        - [Summarize how accurately the user’s natural traits align with the recommended courses]
        - [Mention any gaps, if present, and how easily they can be bridged]
      
      - **Final Recommendation**:
        - [Clearly highlight the **best-fit course** out of the 3 with 1-2 line justification]
        - [State readiness level: "Ready Now", "Requires Minor Prep", or "Needs Foundational Work"]
      
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
      const resultDocRef = db.collection("talent").doc(userId).collection("course").doc("suggest");
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

exports.conformskill = functions.https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
          "unauthenticated",
          "You must be logged in to analyze opportunities."
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
      const jobDocRef = db.collection("talent").doc(userId).collection("course").doc("saved");
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
      const prompt = `You are a course compatibility AI analyzing how well a course's required or taught skills align with a user's skill and talent profile.

      User's Talent Profile:
          ${JSON.stringify(talentData, null, 2)}
      
      Course Skill Requirements:
          ${JSON.stringify(jobData, null, 2)}
      
      Provide a comprehensive compatibility analysis in this exact format:
      
      - **Course Compatibility Score**: [X]%  
        - (Calculate a percentage based on matching skills, current proficiency vs. expected level, and skill gaps)
      
      - **Strong Skill Matches**:
        - [List 3-5 skills where the user's talents or skills strongly align with the course]
        - Include proficiency comparison for each
      
      - **Moderate Matches**:
        - [List skills where the user has some background, but may need effort to keep up]
        - Note the gap for each (e.g., "User: Beginner, Course expects: Intermediate")
      
      - **Missing or Weak Areas**:
        - [List any key course skills the user lacks or needs foundational understanding in]
      
      - **Bonus Skills**:
        - [List any skills the user already has that may help them excel in the course beyond basic expectations]
      
      - **Recommendation**:
        - [Clear recommendation: "Highly Compatible", "Compatible", "Moderately Compatible", or "Not Recommended"]
        - [1-2 sentence justification]
      
      - **Preparation Suggestions**:
        - [List 2-3 key skills or topics the user should review or strengthen before starting the course]
      
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
      const scoreMatch = analysis.match(/Course Compatibility Score.*?(\d+)%/);
      const compatibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  
      // Store the result in talent/user.uid/jobsearch/result
      const resultDocRef = db.collection("talent").doc(userId).collection("course").doc("result");
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
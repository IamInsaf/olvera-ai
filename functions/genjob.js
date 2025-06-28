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

exports.genjob = functions.https.onCall(async (data, context) => {
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
    const prompt = `You are a career advisory AI tasked with reviewing a user's professional profile to suggest three suitable career paths based on their skills, experience, and goals.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}
    
    Provide a detailed analysis in this exact format:
    
    - **Profile Summary**:
      - [Summarize key skills, experiences, and qualifications]
      - [Highlight relevant education and certifications]
      - [Note stated career goals or aspirations]
    
    - **Career Path 1: [Career Name]**:
      - **Description**: [Describe the career, including typical responsibilities and industry]
      - **Alignment with Profile**: [Explain why this career suits the user’s skills, experience, and goals]
      - **Required Skills/Certifications**: [List any additional skills or certifications needed]
      - **Market Demand**: [Assess current and future demand for this role]
      - **Growth Potential**: [Outline career progression and earning potential]
      - **Action Steps**: 
        1. [Step 1 with detailed implementation guidance]
        2. [Step 2 with detailed implementation guidance]
        3. [Step 3 with detailed implementation guidance]
    
    - **Career Path 2: [Career Name]**:
      - **Description**: [Describe the career, including typical responsibilities and industry]
      - **Alignment with Profile**: [Explain why this career suits the user’s skills, experience, and goals]
      - **Required Skills/Certifications**: [List any additional skills or certifications needed]
      - **Market Demand**: [Assess current and future demand for this role]
      - **Growth Potential**: [Outline career progression and earning potential]
      - **Action Steps**: 
        1. [Step 1 with detailed implementation guidance]
        2. [Step 2 with detailed implementation guidance]
        3. [Step 3 with detailed implementation guidance]
    
    - **Career Path 3: [Career Name]**:
      - **Description**: [Describe the career, including typical responsibilities and industry]
      - **Alignment with Profile**: [Explain why this career suits the user’s skills, experience, and goals]
      - **Required Skills/Certifications**: [List any additional skills or certifications needed]
      - **Market Demand**: [Assess current and future demand for this role]
      - **Growth Potential**: [Outline career progression and earning potential]
      - **Action Steps**: 
        1. [Step 1 with detailed implementation guidance]
        2. [Step 2 with detailed implementation guidance]
        3. [Step 3 with detailed implementation guidance]
    
    - **Comparative Analysis**:
      - [Compare the three career paths in terms of alignment, growth potential, and user effort required]
      - [Highlight which career might be the best fit and why]
    
    - **Projected Development Timeline**:
      - [Outline a 6-12 month plan to transition into one or more of the suggested careers]
      - [Include key milestones, such as skill acquisition, networking, or applications]
      - [Address potential challenges and mitigation strategies]
    
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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("genjob");
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
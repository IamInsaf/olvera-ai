const admin = require('firebase-admin');
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Vertex AI
const vertexAI = new VertexAI({
    project: "promgn-in",
    location: "us-central1",
  });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-pro',

  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.9,
    topP: 1,
  },
});

module.exports = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { uid, job, answers } = data;
  
  try {
    // Get user profile data
    const profileSnapshot = await admin.firestore().doc(`talent/${uid}/talenttest`).get();
    if (!profileSnapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Profile data not found');
    }
    const profileData = profileSnapshot.data();
    
    // Generate final analysis
    const prompt = `
      You are a career advisor providing a final assessment of a user's compatibility with their dream job.
      User profile: ${JSON.stringify(profileData)}
      Dream job: ${job}
      All answers: ${JSON.stringify(answers)}
      
      Provide a comprehensive analysis with:
      1. Eligibility (Yes/No)
      2. Strengths (bullet points)
      3. Gaps (bullet points)
      4. Recommendations (bullet points)
      
      Return your response as a JSON object with these properties:
      - eligibility (boolean)
      - strengths (string)
      - gaps (string)
      - recommendations (string)
    `;
    
    const response = await generativeModel.generateContent(prompt);
    const analysis = JSON.parse(response.candidates[0].content.parts[0].text);
    
    // Save to Firestore
    await admin.firestore().doc(`users/${uid}/dreamJobAnalysis/${job}`).set({
      ...analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      questions: Object.keys(answers).map(k => ({
        question: context.rawRequest.body.data.questions[k],
        answer: answers[k]
      })),
      jobTitle: job
    });
    
    return analysis;
  } catch (error) {
    console.error('Error in finalAnalysis:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate analysis');
  }
};
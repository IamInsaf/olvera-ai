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
    
    // Generate next 5 questions based on answers
    const prompt = `
      You are a career advisor analyzing compatibility between a user and their dream job.
      User profile: ${JSON.stringify(profileData)}
      Dream job: ${job}
      Previous answers: ${JSON.stringify(answers)}
      
      Generate 5 follow-up questions to further assess the user's compatibility with this job.
      These should be personalized based on their previous answers.
      Return ONLY a JSON array of questions.
    `;
    
    const response = await generativeModel.generateContent(prompt);
    const questions = JSON.parse(response.candidates[0].content.parts[0].text);
    
    return { questions };
  } catch (error) {
    console.error('Error in getMoreQuestions:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate questions');
  }
};
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

exports.analyzeskills1 = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to analyze job opportunities."
      );
    }
  
    const userId = context.auth.uid;
  
    try {
      const talentDocRef = db.collection("talent").doc(userId);
      const talentDoc = await talentDocRef.get();
  
      if (!talentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "No talent data found for this user.");
      }
  
      const jobDocRef = talentDocRef.collection("jobsearch").doc("saved");
      const jobDoc = await jobDocRef.get();
  
      if (!jobDoc.exists) {
        throw new functions.https.HttpsError("not-found", "No saved job opportunity found.");
      }
  
      const talentData = talentDoc.data();
      const jobData = jobDoc.data();
  
      const prompt = `You are a career assessment AI. Your task is to create 5 intelligent, reflective, and tailored questions that help evaluate whether a user's skill profile is a good fit for a specific job role.
  
  Use the following inputs:
  
  User's Skill Profile:
  ${JSON.stringify(talentData, null, 2)}
  
  Job's Required Skills:
  ${JSON.stringify(jobData, null, 2)}
  
  Instructions:
  - Focus your questions on areas where the user's skills match, partially match, or are missing compared to the job requirements.
  - Ask questions that explore the user's real-world experience, confidence level, and interest in improving or applying those skills.
  - Include a mix of direct (e.g., "Do you feel confident with...") and scenario-based (e.g., "How would you approach...") questions.
  - Ensure the questions help assess alignment between the user and the job role.
  
  Output Format:
  1. [Question 1]
  2. [Question 2]
  3. [Question 3]
  4. [Question 4]
  5. [Question 5]
  
  Do not include explanations or anything other than the five questions.`;
  
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
  
      if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("AI response was not in the expected format");
      }
  
      const rawOutput = result.response.candidates[0].content.parts[0].text.trim();
  
      // Extract questions and build the formatted object
      const questionRegex = /^\d\.\s+(.*)$/gm;
      const matches = [...rawOutput.matchAll(questionRegex)];
  
      const formattedQuestions = {};
      matches.forEach((match, index) => {
        const questionText = match[1].trim();
        formattedQuestions[`Q${index + 1}`] = {
          Q: questionText,
          A: "" // Placeholder for user's answer
        };
      });
  
      // Save to Firestore
      const resultDocRef = db
        .collection("talent")
        .doc(userId)
        .collection("skillsearch")
        .doc("result");
  
      await resultDocRef.set({
        questions: formattedQuestions,
        rawOutput,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
  
      return {
        success: true,
        questions: formattedQuestions,
        generatedAt: new Date().toISOString()
      };
  
    } catch (error) {
      console.error("Error in analyzeJobOpportunity function:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to analyze job opportunity",
        { errorDetails: error.message }
      );
    }
  });
  
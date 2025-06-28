const functions = require('firebase-functions/v1');
const admin = require('./firebaseAdmin');
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: 'promgn-in',
  location: 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.7
  }
});

// Gen 1 function definition (compatible with firebase-functions v6.3.2)
exports.searchjob = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { dreamJob, uid, followUp, previousAnswers, finalAnalysis, questions, answers } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user profile data from Firestore
    let userProfileData = null;
    try {
      const profileSnapshot = await admin.firestore()
        .collection('talent')
        .doc(uid)
        .limit(1)
        .get();

      if (!profileSnapshot.empty) {
        userProfileData = profileSnapshot.docs[0].data();
      }
    } catch (error) {
      console.error('Error fetching user profile data:', error);
    }

    // Handle follow-up questions request
    if (followUp && previousAnswers) {
      const followUpQuestions = await generateFollowUpQuestions(dreamJob, userProfileData, previousAnswers);
      return res.status(200).json({ questions: followUpQuestions });
    }

    // Handle final analysis request
    if (finalAnalysis && questions && answers) {
      const analysis = await performFinalAnalysis(dreamJob, userProfileData, questions, answers, uid);
      return res.status(200).json(analysis);
    }

    // Handle initial questions request
    if (dreamJob) {
      const initialQuestions = await generateInitialQuestions(dreamJob, userProfileData);
      return res.status(200).json({ questions: initialQuestions });
    }

    return res.status(400).json({ error: 'Invalid request parameters' });

  } catch (error) {
    console.error('Error in searchJob function:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Generate initial 5 questions based on dream job and user profile
async function generateInitialQuestions(dreamJob, userProfileData) {
  const profileContext = userProfileData ? `
User Profile Data:
- Age: ${userProfileData.age || 'Not specified'}
- Education: ${userProfileData.education || 'Not specified'}
- Interests: ${userProfileData.interests || 'Not specified'}
- Skills: ${userProfileData.skills || 'Not specified'}
- Experience: ${userProfileData.experience || 'Not specified'}
` : 'No user profile data available.';

  const prompt = `
You are an expert career counselor and job analyst. Generate exactly 5 personalized questions to assess a person's compatibility with their dream job.

Dream Job: ${dreamJob}

${profileContext}

Generate 5 questions that will help determine:
1. Skills and qualifications alignment
2. Personal interests and motivation
3. Work environment preferences
4. Long-term career goals
5. Practical considerations (location, salary, work-life balance)

Questions should be:
- Specific to the dream job
- Personalized based on the user's profile
- Clear and easy to understand
- Designed to reveal compatibility factors

Return only the 5 questions as a JSON array of strings, no additional text:
["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"]
`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    // Parse the JSON response
    const questions = JSON.parse(response);
    return questions.slice(0, 5); // Ensure we only get 5 questions

  } catch (error) {
    console.error('Error generating initial questions:', error);
    // Fallback questions
    return [
      `What specific skills do you think are required for a ${dreamJob} role?`,
      `What interests you most about being a ${dreamJob}?`,
      `What type of work environment do you prefer for a ${dreamJob} position?`,
      `What are your long-term career goals related to ${dreamJob}?`,
      `What practical considerations (location, salary, work-life balance) are important to you for this role?`
    ];
  }
}

// Generate follow-up questions based on previous answers
async function generateFollowUpQuestions(dreamJob, userProfileData, previousAnswers) {
  const profileContext = userProfileData ? `
User Profile Data:
- Age: ${userProfileData.age || 'Not specified'}
- Education: ${userProfileData.education || 'Not specified'}
- Interests: ${userProfileData.interests || 'Not specified'}
- Skills: ${userProfileData.skills || 'Not specified'}
- Experience: ${userProfileData.experience || 'Not specified'}
` : 'No user profile data available.';

  const prompt = `
You are an expert career counselor. Based on the user's previous answers, generate exactly 5 follow-up questions to further assess their compatibility with their dream job.

Dream Job: ${dreamJob}

${profileContext}

Previous Answers:
${previousAnswers.map((answer, index) => `${index + 1}. ${answer}`).join('\n')}

Generate 5 follow-up questions that:
- Build upon the previous answers
- Explore deeper aspects of compatibility
- Address any gaps or concerns identified
- Help determine practical readiness
- Assess commitment and motivation

Questions should be:
- Specific and relevant to the previous responses
- Designed to reveal deeper insights
- Focus on practical aspects and readiness

Return only the 5 questions as a JSON array of strings, no additional text:
["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"]
`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    const questions = JSON.parse(response);
    return questions.slice(0, 5);

  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    // Fallback questions
    return [
      `How do you plan to acquire the necessary skills for ${dreamJob}?`,
      `What challenges do you anticipate in pursuing this career path?`,
      `How do you handle stress and pressure in professional settings?`,
      `What networking or industry connections do you have for this field?`,
      `What timeline do you have in mind for achieving this career goal?`
    ];
  }
}

// Perform final analysis
async function performFinalAnalysis(dreamJob, userProfileData, questions, answers, uid) {
  const profileContext = userProfileData ? `
User Profile Data:
- Age: ${userProfileData.age || 'Not specified'}
- Education: ${userProfileData.education || 'Not specified'}
- Interests: ${userProfileData.interests || 'Not specified'}
- Skills: ${userProfileData.skills || 'Not specified'}
- Experience: ${userProfileData.experience || 'Not specified'}
` : 'No user profile data available.';

  const qaContext = questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join('\n\n');

  const prompt = `
You are an expert career counselor and job analyst. Analyze the user's compatibility with their dream job based on their profile and responses.

Dream Job: ${dreamJob}

${profileContext}

Question and Answer Session:
${qaContext}

Provide a comprehensive analysis in the following JSON format:
{
  "eligibility": "Yes" or "No",
  "strengths": ["strength1", "strength2", "strength3"],
  "gaps": ["gap1", "gap2", "gap3"],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3", "recommendation4"]
}

Analysis criteria:
- Eligibility: Overall fit for the role (Yes/No)
- Strengths: Positive factors that support their candidacy
- Gaps: Areas that need improvement or development
- Recommendations: Specific actionable steps to improve compatibility

Be honest but constructive. Focus on practical insights and actionable advice.
`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    const analysis = JSON.parse(response);

    // Save the complete analysis to Firestore
    await saveAnalysisToFirestore(uid, dreamJob, questions, answers, analysis);

    return analysis;

  } catch (error) {
    console.error('Error performing final analysis:', error);
    // Fallback analysis
    return {
      eligibility: "Maybe",
      strengths: ["You have shown interest in this field", "You've provided thoughtful responses"],
      gaps: ["Need more specific information about your background", "Consider gaining more relevant experience"],
      recommendations: [
        "Research the specific requirements for this role",
        "Gain relevant experience through internships or projects",
        "Network with professionals in this field",
        "Consider additional education or certifications if needed"
      ]
    };
  }
}

// Save analysis to Firestore
async function saveAnalysisToFirestore(uid, dreamJob, questions, answers, analysis) {
  try {
    const analysisData = {
      dreamJob: dreamJob,
      questions: questions,
      answers: answers,
      analysis: analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    };

    // Save to Firestore
    await admin.firestore()
      .collection('users')
      .doc(uid)
      .collection('dreamJobAnalysis')
      .doc(dreamJob.replace(/[^a-zA-Z0-9]/g, '_'))
      .set(analysisData);

    console.log(`Analysis saved for user ${uid} and job ${dreamJob}`);

  } catch (error) {
    console.error('Error saving analysis to Firestore:', error);
    throw error;
  }
} 
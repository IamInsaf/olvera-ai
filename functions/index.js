const functions = require('firebase-functions/v1');
const cors = require('cors');
const express = require('express');
const { VertexAI } = require('@google-cloud/vertexai');

const { summarizeWebsite } = require("./summarizeWebsite");
const { generateNextQuestion } = require("./analyze");
const { generateAIQuestion } = require("./aiquestion");
const { generateAImalQuestion } = require("./malq");
const { generateAIhinQuestion } = require("./hinq");
const { voicesugges } = require("./vresults");
const { talent } = require("./talent");

const { analyzeTalentData } = require('./talentai');
const { positive } = require('./positive');
const { negative } = require('./negative');
const { born } = require('./born');
const { genjob } = require('./genjob');
const { improve } = require('./improve');

const { analyzeJobOpportunity } = require('./jobfind');
const { analyzeskills } = require('./fskill');

const { askany } = require('./askany');

const paymentAPI = require("./payments");

// Import the new searchJob function
const { searchJob } = require('./searchJob');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Vertex AI Setup
const vertexAI = new VertexAI({
  project: 'promgn-in',
  location: 'us-central1'
});

const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-pro', // Correct usage — this should work
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.7
  }
});

app.post('/generateCareerSuggestions', async (req, res) => {
  try {
    const responses = req.body.responses || {};
    console.log("Received responses:", responses);

    const prompt = `
    You are a career counselor AI.

A student submitted the following self-assessment responses:
${JSON.stringify(responses, null, 2)}

Based on this, suggest **exactly 3 suitable career paths** in the following **enhanced Markdown format**:

---

### 1. **Career Name**  
**🔑 Key Fit**: *Short analysis based on the student's interests, skills, and goals.*  
**🎯 Why It's Suitable**: A brief reason why this career aligns with the student's strengths and preferences.  
**💼 Job Outlook**: A note about the career's growth potential or stability (if applicable).  

---

### 2. **Career Name**  
**🔑 Key Fit**: *Short analysis based on the student's interests, skills, and goals.*  
**🎯 Why It's Suitable**: A brief reason why this career aligns with the student's strengths and preferences.  
**💼 Job Outlook**: A note about the career's growth potential or stability (if applicable).  

---

### 3. **Career Name**  
**🔑 Key Fit**: *Short analysis based on the student's interests, skills, and goals.*  
**🎯 Why It's Suitable**: A brief reason why this career aligns with the student's strengths and preferences.  
**💼 Job Outlook**: A note about the career's growth potential or stability (if applicable).  

---

**🌟 Bonus**: If you (the AI) were the student, what **one** career or course would you suggest based on the student's profile? Provide the suggestion in a highlighted format like this:  
> **Suggested Career/Course**: [Your suggestion here]  

Only return this formatted list. Do not include any introduction or closing statements.
`;

    

    // Correct Gemini usage format
    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    // Extract the output safely
    const suggestions = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!suggestions) {
      console.error("Invalid AI response:", JSON.stringify(result, null, 2));
      throw new Error("Unexpected AI response format.");
    }

    res.status(200).json({ suggestions });

  } catch (error) {
    console.error("Vertex AI Error:", error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      details: error.message
    });
  }
});

// Add searchJob endpoint to Express app
app.post('/searchJob', async (req, res) => {
  try {
    const { dreamJob, uid, followUp, previousAnswers, finalAnalysis, intermediateAnalysis, questions, answers } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user profile data from Firestore
    let userProfileData = null;
    try {
      const admin = require('./firebaseAdmin');
      const profileSnapshot = await admin.firestore()
        .collection('users')
        .doc(uid)
        .collection('profileData')
        .limit(1)
        .get();

      if (!profileSnapshot.empty) {
        userProfileData = profileSnapshot.docs[0].data();
      }
    } catch (error) {
      console.error('Error fetching user profile data:', error);
    }

    // Handle intermediate analysis request (after first 5 questions)
    if (intermediateAnalysis && questions && answers) {
      const analysis = await performIntermediateAnalysis(dreamJob, userProfileData, questions, answers);
      return res.status(200).json(analysis);
    }

    // Handle follow-up questions request
    if (followUp && previousAnswers) {
      const followUpQuestions = await generateFollowUpQuestions(dreamJob, userProfileData, previousAnswers);
      return res.status(200).json({ questions: followUpQuestions });
    }

    // Handle final analysis request (after all 10 questions)
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

// Add both /searchJob and /api/searchJob POST routes for compatibility
app.post('/searchJob', async (req, res) => {
  // ...existing handler code...
});
app.post('/api/searchJob', async (req, res) => {
  // Call the same handler as /searchJob
  req.url = '/searchJob';
  app._router.handle(req, res);
});

// Add a test route for debugging
app.post('/test', (req, res) => {
  res.json({ message: 'Test route works!' });
});

// Catch-all logger for debugging
app.use((req, res, next) => {
  console.log('Unhandled route:', req.method, req.originalUrl);
  next();
});

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).send('Not found');
});

// Helper functions for searchJob
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

    const questions = JSON.parse(response);
    return questions.slice(0, 5);

  } catch (error) {
    console.error('Error generating initial questions:', error);
    return [
      `What specific skills do you think are required for a ${dreamJob} role?`,
      `What interests you most about being a ${dreamJob}?`,
      `What type of work environment do you prefer for a ${dreamJob} position?`,
      `What are your long-term career goals related to ${dreamJob}?`,
      `What practical considerations (location, salary, work-life balance) are important to you for this role?`
    ];
  }
}

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
    return [
      `How do you plan to acquire the necessary skills for ${dreamJob}?`,
      `What challenges do you anticipate in pursuing this career path?`,
      `How do you handle stress and pressure in professional settings?`,
      `What networking or industry connections do you have for this field?`,
      `What timeline do you have in mind for achieving this career goal?`
    ];
  }
}

async function performIntermediateAnalysis(dreamJob, userProfileData, questions, answers) {
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
You are an expert career counselor. Provide an initial assessment based on the user's first 5 responses.

Dream Job: ${dreamJob}

${profileContext}

Question and Answer Session:
${qaContext}

Provide an initial analysis in the following JSON format:
{
  "eligibility": "Yes" or "Maybe" or "No",
  "strengths": ["strength1", "strength2", "strength3"],
  "gaps": ["gap1", "gap2", "gap3"],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}

This is an initial assessment based on 5 questions. Be encouraging but honest. Focus on:
- What they've shown so far
- Initial compatibility indicators
- Areas that need more exploration
- Next steps for deeper analysis

Keep the analysis concise and actionable.
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
    return analysis;

  } catch (error) {
    console.error('Error performing intermediate analysis:', error);
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
You are an expert career counselor and job analyst. Provide a comprehensive final analysis based on the user's complete responses to 10 questions.

Dream Job: ${dreamJob}

${profileContext}

Complete Question and Answer Session:
${qaContext}

Provide a comprehensive final analysis in the following JSON format:
{
  "eligibility": "Yes" or "Maybe" or "No",
  "strengths": ["strength1", "strength2", "strength3", "strength4"],
  "gaps": ["gap1", "gap2", "gap3"],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3", "recommendation4"],
  "careerOutlook": "A detailed paragraph about their career prospects and potential in this field"
}

This is a comprehensive analysis based on 10 detailed questions. Be thorough and specific:
- Evaluate overall compatibility
- Identify specific strengths and weaknesses
- Provide detailed, actionable recommendations
- Give a career outlook assessment
- Consider both immediate and long-term factors

Make the analysis detailed, professional, and genuinely helpful for career planning.
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
    return {
      eligibility: "Maybe",
      strengths: ["You have shown interest in this field", "You've provided thoughtful responses", "You demonstrate self-awareness"],
      gaps: ["Need more specific information about your background", "Consider gaining more relevant experience", "May need additional skills development"],
      recommendations: [
        "Research the specific requirements for this role",
        "Gain relevant experience through internships or projects",
        "Network with professionals in this field",
        "Consider additional education or certifications if needed"
      ],
      careerOutlook: "Based on your comprehensive assessment, this career path shows promising alignment with your profile. With focused effort on the identified areas for improvement, you have good potential for success in this field."
    };
  }
}

async function saveAnalysisToFirestore(uid, dreamJob, questions, answers, analysis) {
  try {
    const admin = require('./firebaseAdmin');
    const analysisData = {
      dreamJob: dreamJob,
      questions: questions,
      answers: answers,
      analysis: analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    };

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

exports.api = functions.https.onRequest(app);
exports.summarizeWebsite = summarizeWebsite;
exports.generateNextQuestion = functions.https.onRequest(generateNextQuestion);
exports.generateAIQuestion = generateAIQuestion;
exports.generateAImalQuestion = generateAImalQuestion;
exports.generateAIhinQuestion = generateAIhinQuestion;
exports.voicesugges = voicesugges;
exports.talent = talent;

exports.analyzeTalentData  = analyzeTalentData;
exports.positive  = positive;
exports.negative  = negative;
exports.genjob  = genjob;
exports.born  = born;
exports.improve  = improve;
exports.analyzeJobOpportunity = analyzeJobOpportunity;
exports.analyzeskills = analyzeskills;
exports.askany = askany;
exports.paymentAPI = paymentAPI.paymentAPI;

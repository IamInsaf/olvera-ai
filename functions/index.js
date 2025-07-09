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

const { improve, free, premium, earn } = require('./improve');

const { analyzeJobOpportunity } = require('./jobfind');
const { analyzeskills } = require('./fskill');

const { askany } = require('./askany');

const paymentAPI = require("./payments");

const { coursesug, conformskill } = require("./conform");

const { checkPaymentStatus } = require("./ispaid");

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
      const talentDoc = await admin.firestore()
        .collection('talent')
        .doc(uid)
        .get();

      if (talentDoc.exists) {
        const talentData = talentDoc.data();
        if (talentData.talenttest) {
          userProfileData = talentData.talenttest;
          console.log(`Fetched talent test data for user ${uid}:`, userProfileData);
        }
      }
    } catch (error) {
      console.error('Error fetching user profile data:', error);
    }

    // Handle intermediate analysis request (after first 5 questions)
    if (intermediateAnalysis && questions && answers) {
      const analysis = await performIntermediateAnalysis(dreamJob, userProfileData, questions, answers, uid);
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
      const initialQuestions = await generateInitialQuestions(dreamJob, userProfileData, uid);
      return res.status(200).json({ questions: initialQuestions });
    }

    return res.status(400).json({ error: 'Invalid request parameters' });

  } catch (error) {
    console.error('Error in searchJob function:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Add both /searchJob and /api/searchJob POST routes for compatibility
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

// Generate job-specific questions when AI generation fails
function generateJobSpecificQuestions(dreamJob, numQuestions) {
  const jobSpecificQuestions = {
    'Software Developer': [
      `What programming languages are you most comfortable with, and how would you apply them in a ${dreamJob} role?`,
      `Describe a complex coding problem you've solved. How would this experience translate to ${dreamJob} challenges?`,
      `How do you stay updated with rapidly changing technology trends in software development?`,
      `What's your approach to debugging and testing code in collaborative development environments?`,
      `How do you balance writing clean, maintainable code with meeting tight project deadlines?`
    ],
    'Data Scientist': [
      `What statistical methods and machine learning algorithms are you most familiar with for ${dreamJob} work?`,
      `Describe a data analysis project where you extracted meaningful insights from complex datasets.`,
      `How do you handle missing or inconsistent data when building predictive models?`,
      `What tools and programming languages do you prefer for data manipulation and visualization?`,
      `How do you communicate complex analytical findings to non-technical stakeholders?`
    ],
    'Doctor': [
      `What motivated you to pursue medicine, and how do you handle the emotional demands of patient care?`,
      `Describe how you would approach a difficult diagnosis with limited information.`,
      `How do you balance evidence-based medicine with personalized patient care?`,
      `What strategies do you use to stay current with medical research and best practices?`,
      `How do you handle high-stress situations and life-or-death decisions in medical settings?`
    ],
    'Teacher': [
      `How do you adapt your teaching methods to accommodate different learning styles in your classroom?`,
      `Describe a challenging student situation and how you would address their educational needs.`,
      `What strategies do you use to maintain student engagement and motivation?`,
      `How do you assess student progress and adjust your curriculum accordingly?`,
      `How do you handle parent communications and build supportive learning communities?`
    ],
    'Marketing Manager': [
      `How do you develop and execute marketing campaigns that resonate with target audiences?`,
      `Describe your approach to analyzing market trends and competitor strategies.`,
      `What metrics do you use to measure marketing campaign effectiveness and ROI?`,
      `How do you balance creative storytelling with data-driven marketing decisions?`,
      `How do you manage cross-functional teams and coordinate with sales departments?`
    ],
    'Nurse': [
      `How do you prioritize patient care when managing multiple patients with varying needs?`,
      `Describe how you would handle a medical emergency while maintaining calm and professional demeanor.`,
      `What strategies do you use to provide emotional support to patients and their families?`,
      `How do you ensure accurate medication administration and patient safety protocols?`,
      `How do you collaborate effectively with doctors and other healthcare team members?`
    ],
    'Engineer': [
      `What engineering principles do you rely on most when solving complex technical problems?`,
      `Describe a project where you had to balance technical requirements with budget constraints.`,
      `How do you ensure your engineering solutions meet safety standards and regulatory requirements?`,
      `What role does sustainability and environmental impact play in your engineering decisions?`,
      `How do you communicate technical concepts to non-engineering stakeholders and clients?`
    ],
    'Lawyer': [
      `How do you approach legal research and build compelling arguments for your cases?`,
      `Describe how you would handle an ethical dilemma in your legal practice.`,
      `What strategies do you use to negotiate effectively while maintaining client interests?`,
      `How do you stay current with changing laws and legal precedents in your practice area?`,
      `How do you manage client relationships and communicate complex legal concepts clearly?`
    ],
    'Business Analyst': [
      `How do you identify business problems and translate them into actionable requirements?`,
      `Describe your process for gathering and analyzing stakeholder requirements.`,
      `What tools and methodologies do you use for process mapping and workflow optimization?`,
      `How do you present your findings and recommendations to senior management?`,
      `How do you ensure that proposed solutions align with business strategy and objectives?`
    ],
    'Graphic Designer': [
      `How do you translate client briefs into compelling visual designs that meet their objectives?`,
      `Describe your creative process from initial concept to final design delivery.`,
      `How do you balance creative vision with client feedback and budget constraints?`,
      `What design software and tools are you most proficient with for ${dreamJob} work?`,
      `How do you stay inspired and keep up with current design trends and technologies?`
    ]
  };

  // Default questions for jobs not in the specific list
  const defaultQuestions = [
    `What specific skills and qualifications do you believe are essential for success as a ${dreamJob}?`,
    `Describe a challenging scenario you might face in ${dreamJob} and how you would approach solving it.`,
    `What aspects of ${dreamJob} work environment and daily responsibilities appeal to you most?`,
    `How do you plan to develop the expertise needed to excel in ${dreamJob} over the next 2-3 years?`,
    `What do you see as the biggest opportunities and challenges facing the ${dreamJob} profession today?`
  ];

  // Find job-specific questions or use default
  let selectedQuestions = jobSpecificQuestions[dreamJob] || defaultQuestions;
  
  // If we need fewer questions, take a subset
  if (numQuestions < selectedQuestions.length) {
    selectedQuestions = selectedQuestions.slice(0, numQuestions);
  }
  
  // If we need more questions, supplement with default questions
  if (numQuestions > selectedQuestions.length) {
    const additionalNeeded = numQuestions - selectedQuestions.length;
    const supplementQuestions = defaultQuestions.slice(0, additionalNeeded);
    selectedQuestions = [...selectedQuestions, ...supplementQuestions];
  }

  console.log(`Generated ${selectedQuestions.length} job-specific questions for ${dreamJob}`);
  return selectedQuestions;
}

// Generate job-specific follow-up questions when AI generation fails
function generateFollowUpJobSpecificQuestions(dreamJob) {
  const followUpQuestions = {
    'Software Developer': [
      `How do you handle version control and collaborative coding in team environments?`,
      `What's your experience with software architecture and design patterns?`,
      `How do you approach learning new frameworks and technologies quickly?`,
      `Describe your testing strategy and quality assurance practices.`,
      `How do you manage technical debt and code refactoring decisions?`
    ],
    'Data Scientist': [
      `How do you validate the accuracy and reliability of your predictive models?`,
      `What's your approach to feature engineering and data preprocessing?`,
      `How do you handle bias and ethical considerations in your data analysis?`,
      `Describe your experience with big data technologies and cloud platforms.`,
      `How do you translate business questions into data science problems?`
    ],
    'Doctor': [
      `How do you manage your continuing medical education and stay current with new treatments?`,
      `Describe your approach to patient safety and error prevention.`,
      `How do you handle difficult conversations with patients and families?`,
      `What's your experience with electronic health records and medical technology?`,
      `How do you balance efficiency with thorough patient care?`
    ],
    'Teacher': [
      `How do you incorporate technology effectively into your lesson plans?`,
      `Describe your approach to classroom management and discipline.`,
      `How do you support students with special needs or learning difficulties?`,
      `What methods do you use for professional development and skill improvement?`,
      `How do you measure and improve student learning outcomes?`
    ],
    'Marketing Manager': [
      `How do you adapt marketing strategies for different target demographics?`,
      `What's your experience with digital marketing tools and analytics platforms?`,
      `How do you manage marketing budgets and resource allocation?`,
      `Describe your approach to brand positioning and messaging consistency.`,
      `How do you measure and optimize customer acquisition costs?`
    ],
    'Nurse': [
      `How do you manage your professional development and nursing certifications?`,
      `Describe your experience with different medical equipment and technologies.`,
      `How do you handle ethical dilemmas in patient care decisions?`,
      `What's your approach to pain management and patient comfort?`,
      `How do you support new nurses and contribute to team training?`
    ],
    'Engineer': [
      `How do you stay current with industry standards and emerging technologies?`,
      `Describe your project management approach for complex engineering projects.`,
      `How do you handle design failures and learn from engineering mistakes?`,
      `What's your experience with computer-aided design and simulation tools?`,
      `How do you ensure quality control and testing in your engineering work?`
    ],
    'Lawyer': [
      `How do you manage multiple cases and prioritize deadlines effectively?`,
      `Describe your approach to legal writing and document preparation.`,
      `How do you build and maintain professional relationships in the legal field?`,
      `What's your experience with legal technology and case management systems?`,
      `How do you handle pro bono work and community legal service?`
    ],
    'Business Analyst': [
      `How do you validate and test your business recommendations before implementation?`,
      `Describe your experience with different business analysis frameworks and methodologies.`,
      `How do you handle resistance to change when proposing new processes?`,
      `What's your approach to cost-benefit analysis and ROI calculations?`,
      `How do you ensure data quality and accuracy in your business reports?`
    ],
    'Graphic Designer': [
      `How do you handle multiple projects with competing deadlines and priorities?`,
      `Describe your process for incorporating client feedback into design revisions.`,
      `How do you stay current with design software updates and new tools?`,
      `What's your approach to designing for different media and platforms?`,
      `How do you protect your creative work and handle intellectual property issues?`
    ]
  };

  const defaultFollowUpQuestions = [
    `How do you plan to develop advanced skills needed for ${dreamJob} over the next few years?`,
    `What specific challenges in ${dreamJob} are you most concerned about, and how would you address them?`,
    `How do you stay motivated and handle setbacks in your ${dreamJob} career journey?`,
    `What professional networks or mentorship opportunities are you pursuing for ${dreamJob}?`,
    `How do you measure success and track your progress in ${dreamJob} development?`
  ];

  const selectedQuestions = followUpQuestions[dreamJob] || defaultFollowUpQuestions;
  console.log(`Generated follow-up questions for ${dreamJob}`);
  return selectedQuestions;
}

async function generateInitialQuestions(dreamJob, userProfileData, uid) {
  // Extract key insights from user's talent test data
  let personalityInsights = '';
  let strengthsAndWeaknesses = '';
  let hasProfileData = false;
  
  if (userProfileData && userProfileData.questions) {
    hasProfileData = true;
    const questions = userProfileData.questions;
    const confidenceScores = userProfileData.confidenceScores || {};
    
    console.log(`User ${uid} has talent test data with ${Object.keys(questions).length} questions`);
    
    // Analyze cognitive abilities (q1-q4)
    const cognitiveAnswers = [questions.q1?.a, questions.q2?.a, questions.q3?.a, questions.q4?.a].filter(Boolean);
    const cognitiveConfidence = [confidenceScores.q1, confidenceScores.q2, confidenceScores.q3, confidenceScores.q4];
    
    // Analyze creative thinking (q5-q8)
    const creativeAnswers = [questions.q5?.a, questions.q6?.a, questions.q7?.a, questions.q8?.a].filter(Boolean);
    const creativeConfidence = [confidenceScores.q5, confidenceScores.q6, confidenceScores.q7, confidenceScores.q8];
    
    // Analyze emotional intelligence (q9-q12)
    const emotionalAnswers = [questions.q9?.a, questions.q10?.a, questions.q11?.a, questions.q12?.a].filter(Boolean);
    const emotionalConfidence = [confidenceScores.q9, confidenceScores.q10, confidenceScores.q11, confidenceScores.q12];
    
    // Analyze leadership potential (q13-q16)
    const leadershipAnswers = [questions.q13?.a, questions.q14?.a, questions.q15?.a, questions.q16?.a].filter(Boolean);
    const leadershipConfidence = [confidenceScores.q13, confidenceScores.q14, confidenceScores.q15, confidenceScores.q16];
    
    // Analyze personal values (q17-q20)
    const valuesAnswers = [questions.q17?.a, questions.q18?.a, questions.q19?.a, questions.q20?.a].filter(Boolean);
    const valuesConfidence = [confidenceScores.q17, confidenceScores.q18, confidenceScores.q19, confidenceScores.q20];
    
    personalityInsights = `
COGNITIVE PROFILE: Problem-solving approach: "${questions.q1?.a}" | Learning style: "${questions.q2?.a}" | Decision-making: "${questions.q3?.a}" | Logical thinking: "${questions.q4?.a}"

CREATIVE PROFILE: Idea generation: "${questions.q5?.a}" | Creative flow: "${questions.q6?.a}" | Innovation approach: "${questions.q7?.a}" | Ambiguous tasks: "${questions.q8?.a}"

EMOTIONAL INTELLIGENCE: Handling disagreement: "${questions.q9?.a}" | Reading emotions: "${questions.q10?.a}" | Stress management: "${questions.q11?.a}" | Feedback style: "${questions.q12?.a}"

LEADERSHIP STYLE: Team role: "${questions.q13?.a}" | Task distribution: "${questions.q14?.a}" | Guiding others: "${questions.q15?.a}" | Leadership approach: "${questions.q16?.a}"

CORE VALUES: Non-negotiable values: "${questions.q17?.a}" | Meaningful achievements: "${questions.q18?.a}" | Ideal work environment: "${questions.q19?.a}" | Inner motivation: "${questions.q20?.a}"`;

    // Calculate average confidence by domain
    const avgCognitive = cognitiveConfidence.filter(c => c).reduce((a, b) => a + b, 0) / cognitiveConfidence.filter(c => c).length || 5;
    const avgCreative = creativeConfidence.filter(c => c).reduce((a, b) => a + b, 0) / creativeConfidence.filter(c => c).length || 5;
    const avgEmotional = emotionalConfidence.filter(c => c).reduce((a, b) => a + b, 0) / emotionalConfidence.filter(c => c).length || 5;
    const avgLeadership = leadershipConfidence.filter(c => c).reduce((a, b) => a + b, 0) / leadershipConfidence.filter(c => c).length || 5;
    const avgValues = valuesConfidence.filter(c => c).reduce((a, b) => a + b, 0) / valuesConfidence.filter(c => c).length || 5;
    
    strengthsAndWeaknesses = `
CONFIDENCE SCORES: Cognitive: ${avgCognitive.toFixed(1)}/10 | Creative: ${avgCreative.toFixed(1)}/10 | Emotional: ${avgEmotional.toFixed(1)}/10 | Leadership: ${avgLeadership.toFixed(1)}/10 | Values: ${avgValues.toFixed(1)}/10`;
  } else {
    console.log(`User ${uid} has no talent test data available`);
  }

  let prompt;
  
  if (hasProfileData) {
    // Use the advanced personalized prompt
    prompt = `
🎯 You are an elite friendly career assessment specialist with deep expertise in ${dreamJob} roles. Your mission is to create 5 HYPER-PERSONALIZED questions that directly leverage this user's unique psychological profile to assess their fit for ${dreamJob}.

TARGET CAREER: ${dreamJob}

DETAILED USER PSYCHOLOGICAL PROFILE:
${personalityInsights}

STRENGTH/CONFIDENCE ANALYSIS:
${strengthsAndWeaknesses}

🧠 PERSONALIZATION REQUIREMENTS:
1. **DIRECT REFERENCE**: Each question MUST directly reference specific answers from their talent test
2. **SCENARIO MATCHING**: Create scenarios that align with their stated preferences, strengths, and work style
3. **WEAKNESS PROBING**: Challenge areas where they showed lower confidence or concerning patterns
4. **STRENGTH LEVERAGING**: Build questions around their demonstrated strengths to see how they'd apply them in ${dreamJob}
5. **VALUES ALIGNMENT**: Test how ${dreamJob} scenarios align with their stated values and motivations

🎨 ADVANCED PERSONALIZATION TECHNIQUES:
- If they prefer logical thinking → Create analytical scenarios specific to ${dreamJob}
- If they mentioned specific stress coping → Test how that applies to ${dreamJob} stress
- If they have a particular leadership style → Show how it applies to ${dreamJob} situations
- If they value specific work environments → Test realistic ${dreamJob} environment challenges
- If they mentioned learning preferences → Create ${dreamJob} learning/growth scenarios

📋 EXAMPLE PERSONALIZATION APPROACH:
Instead of: "How would you handle stress in this job?"
Personalized: "You mentioned you cope with stress by [their specific answer]. In ${dreamJob}, when [specific scenario], how would you apply your [their method] approach?"

⚡ CREATE 5 LASER-FOCUSED, PERSONALIZED QUESTIONS:
Each question should feel like it was written specifically for THIS user based on their unique profile. Reference their actual answers, challenge their specific patterns, and test their unique combination of traits against realistic ${dreamJob} scenarios.

Return as JSON array:
["Personalized Question 1", "Personalized Question 2", "Personalized Question 3", "Personalized Question 4", "Personalized Question 5"]`;
  } else {
    // Use a specialized prompt for users without talent test data that still creates engaging questions
    prompt = `
🎯 You are an elite career assessment specialist with deep expertise in ${dreamJob} roles. Create 5 HIGHLY SPECIFIC and ENGAGING questions that will reveal key insights about their compatibility with ${dreamJob}.

TARGET CAREER: ${dreamJob}

🧠 STRATEGIC ASSESSMENT APPROACH:
Design questions that will:
1. **REVEAL PERSONALITY**: Uncover their work style, thinking patterns, and preferences
2. **TEST SPECIFIC SKILLS**: Assess core competencies required for ${dreamJob}
3. **PROBE MOTIVATION**: Understand their genuine interest vs. surface-level attraction
4. **CHALLENGE ASSUMPTIONS**: Test their realistic understanding of ${dreamJob} challenges
5. **ASSESS COMMITMENT**: Gauge their dedication and long-term vision

🎨 ADVANCED QUESTION DESIGN:
- Create realistic scenarios that ${dreamJob} professionals face daily
- Include decision-making dilemmas specific to ${dreamJob}
- Test problem-solving approaches relevant to ${dreamJob}
- Explore values alignment with ${dreamJob} culture and demands
- Challenge them with ethical or complex situations in ${dreamJob}

⚡ CREATE 5 COMPELLING, SPECIFIC QUESTIONS:
Each question should be impossible to answer with generic responses and require deep thinking about ${dreamJob}.

CRITICAL: You MUST return ONLY a valid JSON array with exactly 5 questions. No additional text, no explanations, just the JSON array.

Format example:
["Question about specific ${dreamJob} scenario?", "Question about ${dreamJob} skills and experience?", "Question about ${dreamJob} challenges and problem-solving?", "Question about motivation for ${dreamJob}?", "Question about ${dreamJob} future vision?"]

Return ONLY the JSON array:`;
  }

  try {
    console.log(`Generating questions for dream job: ${dreamJob}, Has profile data: ${hasProfileData}`);
    console.log(`Prompt length: ${prompt.length} characters`);
    
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    console.log('AI Response received:', result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 200) + '...');

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      console.error('No response from AI model');
      throw new Error('Invalid AI response');
    }

    // Multiple approaches to extract questions from the AI response
    let questions = [];
    
    // Approach 1: Try to find and parse JSON array
    let cleanResponse = response.trim();
    
    // Handle markdown code blocks
    if (cleanResponse.includes('```json')) {
      const jsonMatch = cleanResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1].trim();
      }
    } else if (cleanResponse.includes('```')) {
      const jsonMatch = cleanResponse.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1].trim();
      }
    }
    
    // Find JSON array in the response
    const jsonArrayMatch = cleanResponse.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
    if (jsonArrayMatch) {
      cleanResponse = jsonArrayMatch[0];
    }

    // Try to parse the JSON response
    try {
      questions = JSON.parse(cleanResponse);
      console.log('Successfully parsed questions via JSON:', questions);
    } catch (parseError) {
      console.log('JSON parsing failed, trying alternative extraction methods...');
      
      // Approach 2: Extract questions from quoted strings
      const quotedMatches = response.match(/"([^"]{10,}?)"/g);
      if (quotedMatches && quotedMatches.length >= 3) {
        questions = quotedMatches
          .map(match => match.replace(/"/g, '').trim())
          .filter(q => q.length > 10 && q.includes('?'))
          .slice(0, 5);
        console.log('Extracted questions via quoted strings:', questions);
      }
      
      // Approach 3: Extract numbered questions
      if (questions.length < 3) {
        const numberedMatches = response.match(/\d+\.\s*(.+?\?)/g);
        if (numberedMatches && numberedMatches.length >= 3) {
          questions = numberedMatches
            .map(match => match.replace(/^\d+\.\s*/, '').trim())
            .filter(q => q.length > 10)
            .slice(0, 5);
          console.log('Extracted questions via numbered format:', questions);
        }
      }
      
      // Approach 4: Extract lines ending with question marks
      if (questions.length < 3) {
        const questionLines = response
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.endsWith('?') && line.length > 15 && !line.toLowerCase().includes('example'))
          .slice(0, 5);
        
        if (questionLines.length >= 3) {
          questions = questionLines;
          console.log('Extracted questions via question mark detection:', questions);
        }
      }
      
      // If still no success, throw error
      if (questions.length < 3) {
        console.error('All extraction methods failed');
        console.error('Raw response:', response);
        throw new Error('Could not extract questions from AI response');
      }
    }

    // Ensure we have exactly 5 questions
    if (questions.length < 5) {
      console.log(`Only got ${questions.length} questions, generating additional job-specific questions`);
      const additionalQuestions = generateJobSpecificQuestions(dreamJob, 5 - questions.length);
      questions = [...questions, ...additionalQuestions];
    }

    const finalQuestions = questions.slice(0, 5);
    console.log(`Returning ${finalQuestions.length} questions for ${dreamJob}`);
    
    // Save initial questions to Firestore
    await saveInitialQuestionsToFirestore(uid, dreamJob, finalQuestions);
    
    return finalQuestions;

  } catch (error) {
    console.error('Error generating initial questions:', error);
    console.error('Error details:', error.message);
    console.log('Falling back to job-specific questions for:', dreamJob);
    
    // Generate better fallback questions that are still specific to the dream job
    return generateJobSpecificQuestions(dreamJob, 5);
  }
}

async function generateFollowUpQuestions(dreamJob, userProfileData, previousAnswers) {
  // Extract detailed personality insights like in generateInitialQuestions
  let personalityInsights = '';
  let strengthsAndWeaknesses = '';
  
  if (userProfileData && userProfileData.questions) {
    const questions = userProfileData.questions;
    const confidenceScores = userProfileData.confidenceScores || {};
    
    personalityInsights = `
COGNITIVE PROFILE: Problem-solving: "${questions.q1?.a}" | Learning: "${questions.q2?.a}" | Decision-making: "${questions.q3?.a}" | Logic: "${questions.q4?.a}"
CREATIVE PROFILE: Ideas: "${questions.q5?.a}" | Flow: "${questions.q6?.a}" | Innovation: "${questions.q7?.a}" | Ambiguity: "${questions.q8?.a}"
EMOTIONAL INTELLIGENCE: Disagreement: "${questions.q9?.a}" | Reading emotions: "${questions.q10?.a}" | Stress: "${questions.q11?.a}" | Feedback: "${questions.q12?.a}"
LEADERSHIP: Team role: "${questions.q13?.a}" | Distribution: "${questions.q14?.a}" | Guiding: "${questions.q15?.a}" | Style: "${questions.q16?.a}"
VALUES: Core values: "${questions.q17?.a}" | Achievements: "${questions.q18?.a}" | Environment: "${questions.q19?.a}" | Motivation: "${questions.q20?.a}"`;

    // Calculate confidence averages
    const cognitiveConf = [confidenceScores.q1, confidenceScores.q2, confidenceScores.q3, confidenceScores.q4].filter(c => c);
    const creativeConf = [confidenceScores.q5, confidenceScores.q6, confidenceScores.q7, confidenceScores.q8].filter(c => c);
    const emotionalConf = [confidenceScores.q9, confidenceScores.q10, confidenceScores.q11, confidenceScores.q12].filter(c => c);
    const leadershipConf = [confidenceScores.q13, confidenceScores.q14, confidenceScores.q15, confidenceScores.q16].filter(c => c);
    const valuesConf = [confidenceScores.q17, confidenceScores.q18, confidenceScores.q19, confidenceScores.q20].filter(c => c);
    
    const avgCognitive = cognitiveConf.reduce((a, b) => a + b, 0) / cognitiveConf.length || 5;
    const avgCreative = creativeConf.reduce((a, b) => a + b, 0) / creativeConf.length || 5;
    const avgEmotional = emotionalConf.reduce((a, b) => a + b, 0) / emotionalConf.length || 5;
    const avgLeadership = leadershipConf.reduce((a, b) => a + b, 0) / leadershipConf.length || 5;
    const avgValues = valuesConf.reduce((a, b) => a + b, 0) / valuesConf.length || 5;
    
    strengthsAndWeaknesses = `
CONFIDENCE: Cognitive: ${avgCognitive.toFixed(1)}/10 | Creative: ${avgCreative.toFixed(1)}/10 | Emotional: ${avgEmotional.toFixed(1)}/10 | Leadership: ${avgLeadership.toFixed(1)}/10 | Values: ${avgValues.toFixed(1)}/10`;
  }

  const prompt = `
🎯 You are a master career psychologist specializing in ${dreamJob} assessment. Based on this user's comprehensive psychological profile AND their initial answers, create 5 DEEPLY PERSONALIZED follow-up questions that expose critical insights about their ${dreamJob} compatibility.

TARGET CAREER: ${dreamJob}

COMPLETE PSYCHOLOGICAL PROFILE:
${personalityInsights}

CONFIDENCE ANALYSIS:
${strengthsAndWeaknesses}

THEIR INITIAL RESPONSES TO PERSONALIZED QUESTIONS:
${previousAnswers.map((answer, index) => `Response ${index + 1}: ${answer}`).join('\n\n')}

🔍 ADVANCED FOLLOW-UP STRATEGY:
1. **CONTRADICTION ANALYSIS**: Look for inconsistencies between their talent profile and initial answers
2. **DEPTH PROBING**: Take their surface-level answers and force them to go 3 levels deeper
3. **STRESS TESTING**: Challenge their stated approaches with realistic ${dreamJob} pressure scenarios
4. **VALUES CONFLICTS**: Create scenarios where their stated values conflict with ${dreamJob} realities
5. **COMPETENCY GAPS**: Expose areas where their confidence doesn't match ${dreamJob} demands

🧠 PSYCHOLOGICAL MINING TECHNIQUES:
- If they gave a confident answer but have low confidence in that talent area → Challenge the inconsistency
- If they avoided specifics → Force concrete examples and details
- If they showed idealistic thinking → Test with harsh ${dreamJob} realities
- If they demonstrated a strength → Push them to the limits of that strength
- If they revealed a preference → Test how it handles ${dreamJob} conflicts

📊 PATTERN ANALYSIS FROM INITIAL RESPONSES:
Analyze their answers for:
- Overconfidence vs. actual ability indicators
- Realistic vs. romanticized career understanding
- Specific vs. vague/generic responses
- Problem-solving depth and sophistication
- Authentic passion vs. surface interest

⚡ CREATE 5 SURGICAL FOLLOW-UP QUESTIONS:
Each question should:
- Reference SPECIFIC elements from both their talent profile AND initial answers
- Force them to confront potential weaknesses or blind spots
- Test the authenticity and depth of their stated capabilities
- Challenge assumptions revealed in their initial responses
- Push beyond surface-level understanding of ${dreamJob}

Return as JSON array:
["Surgical Question 1", "Surgical Question 2", "Surgical Question 3", "Surgical Question 4", "Surgical Question 5"]`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    // Try multiple parsing approaches like in generateInitialQuestions
    let questions = [];
    
    try {
      // Clean response and try JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.includes('```json')) {
        const jsonMatch = cleanResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) cleanResponse = jsonMatch[1].trim();
      }
      
      const jsonArrayMatch = cleanResponse.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
      if (jsonArrayMatch) cleanResponse = jsonArrayMatch[0];
      
      questions = JSON.parse(cleanResponse);
      console.log('Successfully parsed follow-up questions via JSON:', questions);
    } catch (parseError) {
      console.log('JSON parsing failed for follow-up questions, trying alternative methods...');
      
      // Try extracting quoted questions
      const quotedMatches = response.match(/"([^"]{15,}?\?)/g);
      if (quotedMatches && quotedMatches.length >= 3) {
        questions = quotedMatches
          .map(match => match.replace(/"/g, '').trim())
          .slice(0, 5);
        console.log('Extracted follow-up questions via quotes:', questions);
      }
      
      if (questions.length < 3) {
        throw new Error('Could not extract follow-up questions');
      }
    }

    return questions.slice(0, 5);

  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    console.log('Using job-specific follow-up questions for:', dreamJob);
    
    // Generate better follow-up questions based on the dream job
    return generateFollowUpJobSpecificQuestions(dreamJob);
  }
}

async function performIntermediateAnalysis(dreamJob, userProfileData, questions, answers, uid) {
  const profileContext = userProfileData ? `
User Talent Test Results:
${Object.entries(userProfileData.questions || {}).map(([key, value]) => 
  `${key.toUpperCase()}: ${value.q}\nAnswer: ${value.a}\nConfidence: ${userProfileData.confidenceScores?.[key] || 'N/A'}/10`
).join('\n\n')}

Test Status: ${userProfileData.status || 'Unknown'}
Test Completed: ${userProfileData.timestamp ? 'Yes' : 'No'}
` : 'No talent test data available for this user.';

  const qaContext = questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join('\n\n');

  const prompt = `
You are a senior career assessment specialist with expertise in ${dreamJob} roles. Analyze the user's profile and their responses to provide a comprehensive intermediate evaluation.

Target Career: ${dreamJob}

User Profile:
${profileContext}

Questions and Responses:
${qaContext}

Conduct a thorough analysis covering:

1. SKILL ALIGNMENT: How well do their current abilities match ${dreamJob} requirements?
2. MOTIVATION DEPTH: Is their interest genuine and sustainable?
3. EXPERIENCE RELEVANCE: How applicable is their background?
4. PSYCHOLOGICAL FIT: Do they have the right mindset and temperament?
5. READINESS LEVEL: How prepared are they for this career transition?

Consider:
• Consistency between their profile and responses
• Evidence of realistic vs. romanticized career views
• Demonstrated problem-solving and analytical abilities
• Understanding of industry challenges and opportunities
• Learning potential and adaptability

Return a comprehensive assessment in JSON format:

{
  "eligibility": "Yes/Maybe/No",
  "overallCompatibility": 85,
  "skillsAlignment": 75,
  "motivationLevel": 90,
  "experienceRelevance": 65,
  "readinessScore": 80,
  "psychologicalFit": 88,
  "strengths": ["strength1", "strength2", "strength3", "strength4"],
  "gaps": ["gap1", "gap2", "gap3"],
  "recommendations": ["rec1", "rec2", "rec3", "rec4"],
  "riskFactors": ["risk1", "risk2"],
  "developmentPotential": "High/Medium/Low",
  "scoreBreakdown": {
    "technical": 70,
    "soft": 85,
    "education": 80,
    "passion": 90,
    "practical": 75
  },
  "predictiveInsights": {
    "successProbability": 78,
    "satisfactionLikelihood": 85,
    "advancementPotential": 70,
    "retentionProjection": 80
  }
}

Assessment Criteria:
- "Yes" = Strong compatibility with clear success path
- "Maybe" = Moderate fit with development needs
- "No" = Poor alignment with significant barriers

Provide honest, evidence-based scores (0-100) with specific, actionable insights.
`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    // Clean the response by removing markdown code blocks and extra formatting
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const analysis = JSON.parse(cleanResponse);
    
    // Save intermediate analysis to Firestore
    await saveIntermediateAnalysisToFirestore(uid, dreamJob, questions, answers, analysis);
    
    return analysis;

  } catch (error) {
    console.error('Error performing intermediate analysis:', error);
    console.log(`Generating fallback intermediate analysis for ${dreamJob}`);
    
    // Return a complete intermediate analysis object with all expected fields
    return {
      eligibility: "Maybe",
      overallCompatibility: 70,
      skillsAlignment: 65,
      motivationLevel: 75,
      experienceRelevance: 60,
      readinessScore: 65,
      psychologicalFit: 70,
      strengths: [
        "Shows genuine interest in this field", 
        "Demonstrates thoughtful responses",
        "Exhibits willingness to learn and grow",
        "Good communication and self-reflection skills"
      ],
      gaps: [
        "May need additional technical skills specific to the role",
        "Could benefit from more hands-on experience in the field",
        "Industry knowledge could be strengthened"
      ],
      recommendations: [
        `Research the specific requirements and skills for ${dreamJob}`,
        "Gain practical experience through internships, projects, or volunteer work",
        "Network with professionals in this field",
        "Consider pursuing relevant certifications or additional training"
      ],
      riskFactors: [
        "Limited practical experience in the field",
        "Potential skill gaps that need development"
      ],
      developmentPotential: "Medium",
      scoreBreakdown: {
        technical: 60,
        soft: 70,
        education: 75,
        passion: 80,
        practical: 75
      },
      predictiveInsights: {
        successProbability: 70,
        satisfactionLikelihood: 75,
        advancementPotential: 65,
        retentionProjection: 75
      }
    };
  }
}

async function performFinalAnalysis(dreamJob, userProfileData, questions, answers, uid) {
  const profileContext = userProfileData ? `
User Talent Test Results:
${Object.entries(userProfileData.questions || {}).map(([key, value]) => 
  `${key.toUpperCase()}: ${value.q}\nAnswer: ${value.a}\nConfidence: ${userProfileData.confidenceScores?.[key] || 'N/A'}/10`
).join('\n\n')}

Test Status: ${userProfileData.status || 'Unknown'}
Test Completed: ${userProfileData.timestamp ? 'Yes' : 'No'}
` : 'No talent test data available for this user.';

  const qaContext = questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join('\n\n');

  const prompt = `
🎯 You are the world's leading career architect and psychological profiler, with specialized expertise in ${dreamJob} career trajectories. Your mission is to conduct the most comprehensive and insightful final assessment that will serve as the definitive guide for this individual's career journey.

🚀 ULTIMATE CAREER DESTINATION: ${dreamJob}

📊 COMPLETE PSYCHOLOGICAL DOSSIER:
${profileContext}

🧠 COMPREHENSIVE DIALOGUE ANALYSIS:
${qaContext}

🔬 MASTER-LEVEL ANALYTICAL FRAMEWORK:

HOLISTIC IDENTITY INTEGRATION:
- Synthesize all data points into a coherent psychological and professional profile
- Map the evolution of understanding and self-awareness throughout the assessment
- Identify core personality drivers and their alignment with ${dreamJob} demands
- Assess authentic self vs. aspirational identity alignment

MULTIDIMENSIONAL COMPETENCY MATRIX:
- Conduct deep-dive analysis of technical, cognitive, and emotional competencies
- Evaluate transferable skills with precision mapping to ${dreamJob} requirements
- Assess learning velocity and skill acquisition potential
- Project competency development trajectory over 5-10 year horizon

PSYCHOLOGICAL RESILIENCE ARCHITECTURE:
- Analyze stress tolerance and performance under pressure specific to ${dreamJob}
- Evaluate adaptability to industry disruptions and technological changes
- Assess intrinsic motivation sustainability through career challenges
- Map emotional regulation patterns and interpersonal effectiveness

STRATEGIC CAREER INTELLIGENCE:
- Evaluate industry awareness and market positioning potential
- Assess networking acumen and relationship-building capabilities
- Analyze entrepreneurial thinking and innovation potential
- Project leadership emergence and influence capacity

PREDICTIVE SUCCESS MODELING:
- Generate probability models for various success metrics in ${dreamJob}
- Assess career longevity and satisfaction sustainability
- Evaluate advancement trajectory and plateau resistance
- Model performance under different organizational cultures and challenges

WISDOM-DRIVEN DEVELOPMENT PATHWAY:
- Create sophisticated development roadmap with milestone markers
- Identify leverage points for maximum growth impact
- Design risk mitigation strategies for identified vulnerabilities
- Craft opportunity maximization strategies based on natural strengths

🎨 MASTER ANALYST PRINCIPLES:
✨ Integrate cutting-edge career psychology with real-world ${dreamJob} intelligence
🔥 Apply pattern recognition across multiple psychological and professional dimensions
💎 Generate insights that transcend surface-level compatibility assessment
🌟 Create actionable wisdom that transforms career trajectory potential
⚡ Deliver profound clarity on authentic professional calling alignment

Return the most comprehensive career intelligence report in JSON format:

{
  "eligibility": "Yes/Maybe/No",
  "overallCompatibility": 89,
  "skillsAlignment": 82,
  "motivationLevel": 94,
  "experienceRelevance": 71,
  "readinessScore": 85,
  "marketFit": 88,
  "psychologicalAlignment": 91,
  "futureSuccess": 86,
  "strengths": ["strength1", "strength2", "strength3", "strength4", "strength5"],
  "gaps": ["gap1", "gap2", "gap3"],
  "recommendations": ["rec1", "rec2", "rec3", "rec4", "rec5"],
  "careerOutlook": "Detailed 3-4 sentence analysis of career prospects and potential trajectory",
  "riskFactors": ["risk1", "risk2"],
  "uniqueAdvantages": ["advantage1", "advantage2"],
  "detailedScores": {
    "technicalSkills": 78,
    "softSkills": 87,
    "educationFit": 83,
    "industryKnowledge": 72,
    "networkingAbility": 75,
    "passionLevel": 91,
    "practicalReadiness": 84,
    "adaptabilityScore": 89,
    "commitmentLevel": 86,
    "futureGrowth": 82
  },
  "developmentAreas": {
    "immediateNeeds": ["area1", "area2"],
    "mediumTermGoals": ["goal1", "goal2", "goal3"],
    "longTermObjectives": ["objective1", "objective2"]
  },
  "successPredictors": {
    "careerSatisfaction": 87,
    "performanceExcellence": 83,
    "advancementPotential": 81,
    "industryImpact": 79,
    "longevityProjection": 85
  }
}

ULTIMATE ASSESSMENT STANDARDS:
- "Yes" = Exceptional compatibility, strong success predictors, transformative potential
- "Maybe" = Solid compatibility with strategic development needs, good success probability
- "No" = Fundamental misalignment, significant barriers, alternative exploration recommended

MASTER-LEVEL SCORING (0-100): Evidence-based precision assessment integrating psychological science with ${dreamJob} industry intelligence.
`;

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const response = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response) {
      throw new Error('Invalid AI response');
    }

    // Clean the response by removing markdown code blocks and extra formatting
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const analysis = JSON.parse(cleanResponse);

    // Save the complete analysis to Firestore
    await saveAnalysisToFirestore(uid, dreamJob, questions, answers, analysis);

    return analysis;

  } catch (error) {
    console.error('Error performing final analysis:', error);
    console.log(`Generating fallback analysis for ${dreamJob}`);
    
    // Return a complete analysis object with all expected fields
    return {
      eligibility: "Maybe",
      overallCompatibility: 75,
      skillsAlignment: 70,
      motivationLevel: 80,
      experienceRelevance: 65,
      readinessScore: 70,
      marketFit: 75,
      psychologicalAlignment: 75,
      futureSuccess: 75,
      strengths: [
        "Shows genuine interest in the field",
        "Demonstrates thoughtful consideration of career choices", 
        "Exhibits self-awareness and willingness to learn",
        "Communicates clearly and effectively",
        "Shows commitment to professional development"
      ],
      gaps: [
        "May need additional technical skills specific to the role",
        "Could benefit from more hands-on experience in the field",
        "Networking and industry connections could be strengthened"
      ],
      recommendations: [
        `Research the latest trends and requirements in ${dreamJob}`,
        "Gain practical experience through internships, projects, or volunteer work",
        "Build a network of professionals in your target field", 
        "Consider pursuing relevant certifications or additional training",
        "Develop a portfolio that showcases your skills and potential"
      ],
      careerOutlook: `Based on your comprehensive assessment, the ${dreamJob} career path shows moderate alignment with your profile. With focused effort on skill development and gaining relevant experience, you have good potential for success in this field. Your motivation and willingness to learn are strong assets for career growth.`,
      riskFactors: [
        "Limited hands-on experience in the field",
        "Potential skill gaps that need to be addressed"
      ],
      uniqueAdvantages: [
        "Strong motivation and career focus",
        "Good communication and analytical skills"
      ],
      detailedScores: {
        technicalSkills: 65,
        softSkills: 75,
        educationFit: 78,
        industryKnowledge: 60,
        networkingAbility: 75,
        passionLevel: 70,
        practicalReadiness: 80,
        adaptabilityScore: 75,
        commitmentLevel: 85,
        futureGrowth: 80
      },
      developmentAreas: {
        immediateNeeds: [
          `Develop core technical skills for ${dreamJob}`,
          "Gain practical experience in the field"
        ],
        mediumTermGoals: [
          "Build professional network and industry connections",
          "Advance technical expertise through continuous learning",
          "Develop leadership and project management skills"
        ],
        longTermObjectives: [
          `Establish expertise and thought leadership in ${dreamJob}`,
          "Pursue advanced certifications or specializations"
        ]
      },
      successPredictors: {
        careerSatisfaction: 78,
        performanceExcellence: 75,
        advancementPotential: 72,
        industryImpact: 68,
        longevityProjection: 80
      }
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
      .collection('talent')
      .doc(uid)
      .collection('dreamJobAnalysis')
      .doc(dreamJob.replace(/[^a-zA-Z0-9]/g, '_') + '_final')
      .set(analysisData);

    console.log(`Analysis saved for user ${uid} and job ${dreamJob}`);

  } catch (error) {
    console.error('Error saving analysis to Firestore:', error);
    throw error;
  }
}

async function saveIntermediateAnalysisToFirestore(uid, dreamJob, questions, answers, analysis) {
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
      .collection('talent')
      .doc(uid)
      .collection('dreamJobAnalysis')
      .doc(dreamJob.replace(/[^a-zA-Z0-9]/g, '_') + '_intermediate')
      .set(analysisData);

    console.log(`Intermediate analysis saved for user ${uid} and job ${dreamJob}`);

  } catch (error) {
    console.error('Error saving intermediate analysis to Firestore:', error);
    throw error;
  }
}

async function saveInitialQuestionsToFirestore(uid, dreamJob, questions) {
  try {
    const admin = require('./firebaseAdmin');
    const questionsData = {
      dreamJob: dreamJob,
      questions: questions,
      stage: 'initial',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    };

    await admin.firestore()
      .collection('talent')
      .doc(uid)
      .collection('dreamJobAnalysis')
      .doc(dreamJob.replace(/[^a-zA-Z0-9]/g, '_') + '_questions')
      .set(questionsData);

    console.log(`Initial questions saved for user ${uid} and job ${dreamJob}`);

  } catch (error) {
    console.error('Error saving initial questions to Firestore:', error);
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
exports.free  = free;
exports.premium  = premium;
exports.earn  = earn;


exports.checkPaymentStatus  = checkPaymentStatus;


exports.analyzeJobOpportunity = analyzeJobOpportunity;
exports.analyzeskills = analyzeskills;
exports.askany = askany;

exports.coursesug = coursesug;
exports.conformskill = conformskill;

exports.paymentAPI = paymentAPI.paymentAPI;
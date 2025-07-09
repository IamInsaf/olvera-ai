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

exports.improve = functions.https.onCall(async (data, context) => {
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
    const prompt = `You are a talent analysis AI reviewing a user's professional profile to provide a step-by-step process for personal improvement, focusing on actionable strategies to enhance skills and career progression.

    User's Talent Profile:
    ${JSON.stringify(talentData, null, 2)}
    
    Provide a comprehensive analysis in this exact format:
    
    - **Core Strengths**:
      - [List 3-5 key strengths with brief explanations of how they support personal growth]
      
    - **Areas for Improvement**:
      - [Identify 3-5 areas needing enhancement with specific reasons why improvement is necessary]
      
    - **Career Goal Alignment**:
      - [Evaluate how well the user’s current skills and experience align with their personal and professional goals]
      - [Highlight specific gaps that need addressing to achieve these goals]
    
    - **Competitive Positioning**:
      - [Assess the user’s current standing in their field or industry]
      - [Identify unique strengths that can be leveraged for advancement]
    
    - **Step-by-Step Improvement Process**:
      1. [Step 1: Detailed action with specific tasks, timelines, and expected outcomes]
      2. [Step 2: Detailed action with specific tasks, timelines, and expected outcomes]
      3. [Step 3: Detailed action with specific tasks, timelines, and expected outcomes]
      4. [Step 4: Detailed action with specific tasks, timelines, and expected outcomes]
    
    - **Progress Roadmap**:
      - [Outline a 6-12 month trajectory for personal and professional development]
      - [List key milestones to track progress and measure success]
    
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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("improve");
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

exports.free = functions.https.onCall(async (data, context) => {
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
    const prompt = `
    memory:
    ${JSON.stringify(talentData, null, 2)}
    
    ---
    
    🧠 **Surface-Level Analysis**
    
    Based on the above memory data, do a light and concise analysis of the user's:
    
    - Goals  
    - Habits  
    - Mindset  
    - Business direction
    
    🎯 Then, identify **2–3 small areas** where the user can improve right now to unlock better:
    
    - Clarity  
    - Focus  
    - Energy
    
    Keep it simple and actionable. Don't go deep — just light suggestions or shifts that could help immediately.
    
    📌 End with this note (in bold):
    
    **Note: A deeper breakdown of blindspots, hidden self-sabotage patterns, and breakthrough cycles will be revealed in your Premium Analysis.**
    
    ⛔ Do not include any extra explanation, intro, or outro. Only return the clean, formatted insight section.
    `;
    

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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("free");
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

exports.premium = functions.https.onCall(async (data, context) => {
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
    const prompt = `
    memory: ${JSON.stringify(talentData, null, 2)}
    
    Now that you have full memory and context on who I am, I want you to do a deep dive into everything you've learned about me, including my goals, patterns, mindset, habits, values, business direction, emotion triggers and creative identity.

Based on this, identify any blindspots, contractions, or hidden pattern I might not be fully conscious of yet, especially the ones holding me back in business, personal growth, and energy.

Give me no-BS breakdown of what I need to see, where I might be self-sabotaging, and what cycle I might be looping in. Then, create an action plan for how to break through each one, with steps, mindset shift, and any frameworks or prompts you think would unlock new level for me
Return only the formatted analysis. No extra explanation or fluff.
`;

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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("premium");
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

exports.earn = functions.https.onCall(async (data, context) => {
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
    const prompt = `
    talent-test memory: ${JSON.stringify(talentData, null, 2)}
    "You are an AI career strategist trained to help individuals monetize their talents. Analyze the user's full test responses, including personality, interests, current skills, learning style, exposure level, and confidence scores. Based on this data, recommend 3 highly personalized and realistic ways the user can start earning ₹10,000/month in the next 30–60 days.

🧩 For each earning path, include:

Opportunity Title

Why it matches this user’s unique profile

Required Skills (highlight which are already present, and which are easy to build)

Exact first steps (no fluff, step-by-step actions starting today)

Expected time to ₹10K/month (with assumptions)

Tools, platforms, or communities to use

Well structures AI prompt (for making it real)

Motivation triggers (tie into user’s personality/drive from test results)"

🎯 Rules:

Prioritize low-barrier income paths that build long-term leverage

Avoid generic answers (like “freelancing” or “start a YouTube channel”) unless highly contextual

Tailor language and tone to match user’s communication style (based on test)

Suggest scalable paths, not one-time gigs

Format in clean sections using markdown.
Return only the formatted analysis. No extra explanation or fluff.
`;

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
    const resultDocRef = db.collection("talent").doc(userId).collection("result").doc("earn");
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
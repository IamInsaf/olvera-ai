// Firebase Cloud Function: Talent Mapping Engine
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Talent category mapping
const questionTalentMap = {
  q1: ["Logical-Mathematical"],
  q2: ["Logical-Mathematical"],
  q3: ["Intrapersonal", "Logical-Mathematical"],
  q4: ["Logical-Mathematical"],
  q5: ["Creative-Innovative"],
  q6: ["Creative-Innovative"],
  q7: ["Creative-Innovative"],
  q8: ["Creative-Innovative"],
  q9: ["Emotional Intelligence"],
  q10: ["Interpersonal"],
  q11: ["Intrapersonal"],
  q12: ["Emotional Intelligence"],
  q13: ["Leadership & Influence"],
  q14: ["Leadership & Influence"],
  q15: ["Leadership & Influence"],
  q16: ["Leadership & Influence"],
  q17: ["Intrapersonal"],
  q18: ["Linguistic-Verbal"],
  q19: ["Visual-Spatial"],
  q20: ["Motivation"]
};

exports.mapTalent = functions.firestore
  .document("talent/{userId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const confidenceScores = data.confidenceScores;
    const userId = context.params.userId;
    const testId = context.params.testId;

    const scores = {};

    for (const [qKey, categories] of Object.entries(questionTalentMap)) {
      const confidence = confidenceScores[qKey] || 0;
      categories.forEach((cat) => {
        if (!scores[cat]) scores[cat] = 0;
        scores[cat] += confidence;
      });
    }

    const talentRanking = Object.entries(scores)
      .map(([category, score]) => ({ category, score }))
      .sort((a, b) => b.score - a.score);

    const topTalents = talentRanking.slice(0, 3);

    const summary = `Top talents: ${topTalents.map(t => t.category).join(", ")}. You have strengths in ${topTalents[0].category}, supported by ${topTalents[1].category} and ${topTalents[2].category}.`;

    await db
      .collection("talent")
      .doc(userId)
      .collection("results")
      .doc(testId)
      .set({
        topTalents,
        summary,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return null;
  });

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
//admin.initializeApp();

if (!admin.apps.length) {
    admin.initializeApp();
  }

exports.checkPaymentStatus = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'User must be authenticated to check payment status'
    );
  }

  const userId = context.auth.uid;
  const userDocPath = `Olverausers/${userId}`;

  try {
    const userDoc = await admin.firestore().doc(userDocPath).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found', 
        'User document not found'
      );
    }

    const hasPaid = userDoc.data().hasPaid || false;
    
    return { hasPaid };
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    throw new functions.https.HttpsError(
      'internal', 
      'Unable to check payment status'
    );
  }
});
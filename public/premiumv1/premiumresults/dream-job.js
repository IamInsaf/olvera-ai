// Dream Job Analyzer JavaScript
// This file contains all the functionality for the Dream Job Analyzer feature

// Global variables
let currentUser = null;
let currentQuestions = [];
let currentAnswers = [];
let currentQuestionIndex = 0;
let currentDreamJob = '';
let isFollowUpPhase = false;
let intermediateAnalysis = null;

// Initialize the Dream Job Analyzer
function initDreamJobAnalyzer() {
  console.log('Initializing Dream Job Analyzer...');
  
  // Check authentication on page load
  console.log('Setting up auth state listener...');
  auth.onAuthStateChanged(async (user) => {
    console.log('Auth state changed:', user ? 'User logged in' : 'No user');
    const authSection = document.getElementById('authSection');
    const mainSection = document.getElementById('mainSection');
    if (user) {
      currentUser = user;
      // Hide auth section, show main section (defensive)
      if (authSection) authSection.classList.add('hidden');
      if (mainSection) mainSection.classList.remove('hidden');
      console.log('User authenticated:', user.uid);
      await fetchUserName(user.uid);
      await fetchUserProfileData(user.uid);
    } else {
      // Show auth section, hide main section (defensive)
      if (authSection) authSection.classList.remove('hidden');
      if (mainSection) mainSection.classList.add('hidden');
    }
  });

  // Add event listeners
  setupEventListeners();
}

// Fetch user name from Firestore
async function fetchUserName(userId) {
  try {
    const userDoc = await db.collection('Olverauser').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const userName = userData.name || userData.email || 'User';
      document.getElementById('userName').textContent = userName;
    }
  } catch (error) {
    console.error('Error fetching user name:', error);
  }
}

// Fetch user profile data
async function fetchUserProfileData(userId) {
  try {
    const profileDoc = await db.collection('users').doc(userId).collection('profileData').limit(1).get();
    if (!profileDoc.empty) {
      userProfileData = profileDoc.docs[0].data();
    }
  } catch (error) {
    console.error('Error fetching profile data:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', startAnalysis);

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', nextQuestion);

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) continueBtn.addEventListener('click', continueToFollowUp);

  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) restartBtn.addEventListener('click', restartAnalysis);
}

// Start the analysis process
async function startAnalysis() {
  const dreamJob = document.getElementById('dreamJob').value.trim();
  
  if (!dreamJob) {
    showError('Please enter your dream job');
    return;
  }

  if (!currentUser) {
    showError('Please log in to use this feature');
    return;
  }

  setLoading(true);
  showError('');

  try {
    const response = await fetch('/searchJob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dreamJob: dreamJob,
        uid: currentUser.uid
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.questions && data.questions.length > 0) {
      currentQuestions = data.questions;
      currentAnswers = [];
      currentQuestionIndex = 0;
      currentDreamJob = dreamJob;
      isFollowUpPhase = false;
      intermediateAnalysis = null;
      
      showQuestion();
    } else {
      throw new Error('No questions received from server');
    }
  } catch (error) {
    console.error('Error starting analysis:', error);
    showError('Failed to start analysis. Please try again.');
  } finally {
    setLoading(false);
  }
}

// Show current question
function showQuestion() {
  // Hide input section, show question section
  document.getElementById('inputSection').style.display = 'none';
  document.getElementById('questionSection').style.display = 'block';
  document.getElementById('intermediateSection').style.display = 'none';
  document.getElementById('finalSection').style.display = 'none';

  if (currentQuestionIndex >= currentQuestions.length) {
    // All questions answered, show intermediate analysis
    if (isFollowUpPhase) {
      // This is the follow-up phase, show final analysis
      performFinalAnalysis();
    } else {
      // This is the initial phase, show intermediate analysis
      showIntermediateAnalysis();
    }
    return;
  }

  const question = currentQuestions[currentQuestionIndex];
  document.getElementById('questionText').textContent = question;
  document.getElementById('answerInput').value = currentAnswers[currentQuestionIndex] || '';
  
  // Update progress
  const progress = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;
  document.getElementById('progressBar').style.width = progress + '%';
  document.getElementById('progressText').textContent = `Question ${currentQuestionIndex + 1} of ${currentQuestions.length}`;
  document.getElementById('progressPercent').textContent = Math.round(progress);
}

// Next question
function nextQuestion() {
  const answer = document.getElementById('answerInput').value.trim();
  
  if (!answer) {
    showError('Please provide an answer before continuing');
    return;
  }

  currentAnswers[currentQuestionIndex] = answer;
  currentQuestionIndex++;
  
  if (currentQuestionIndex < currentQuestions.length) {
    showQuestion();
  } else {
    // All questions answered
    if (isFollowUpPhase) {
      // This is the follow-up phase, show final analysis
      performFinalAnalysis();
    } else {
      // This is the initial phase, show intermediate analysis
      showIntermediateAnalysis();
    }
  }
}

// Show intermediate analysis after first 5 questions
async function showIntermediateAnalysis() {
  setLoading(true);
  showError('');

  try {
    const response = await fetch('/searchJob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dreamJob: currentDreamJob,
        uid: currentUser.uid,
        intermediateAnalysis: true,
        questions: currentQuestions,
        answers: currentAnswers
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const analysis = await response.json();
    intermediateAnalysis = analysis;
    
    // Display intermediate analysis
    displayIntermediateAnalysis(analysis);
    
    // Show continue button for follow-up questions
    document.getElementById('questionSection').style.display = 'none';
    document.getElementById('intermediateSection').style.display = 'block';
    document.getElementById('finalSection').style.display = 'none';
    
  } catch (error) {
    console.error('Error getting intermediate analysis:', error);
    showError('Failed to get intermediate analysis. Please try again.');
  } finally {
    setLoading(false);
  }
}

// Display intermediate analysis
function displayIntermediateAnalysis(analysis) {
  const container = document.getElementById('intermediateResults');
  
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 class="text-2xl font-bold text-gray-800 mb-4">
        <i class="fas fa-chart-line text-blue-500 mr-2"></i>
        Initial Analysis for ${currentDreamJob}
      </h3>
      
      <div class="grid md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div class="bg-green-50 border-l-4 border-green-400 p-4">
            <h4 class="font-semibold text-green-800 mb-2">
              <i class="fas fa-check-circle mr-2"></i>Your Strengths
            </h4>
            <ul class="text-green-700 space-y-1">
              ${analysis.strengths.map(strength => `<li>• ${strength}</li>`).join('')}
            </ul>
          </div>
          
          <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <h4 class="font-semibold text-yellow-800 mb-2">
              <i class="fas fa-exclamation-triangle mr-2"></i>Areas to Consider
            </h4>
            <ul class="text-yellow-700 space-y-1">
              ${analysis.gaps.map(gap => `<li>• ${gap}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div class="space-y-4">
          <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
            <h4 class="font-semibold text-blue-800 mb-2">
              <i class="fas fa-lightbulb mr-2"></i>Recommendations
            </h4>
            <ul class="text-blue-700 space-y-1">
              ${analysis.recommendations.map(rec => `<li>• ${rec}</li>`).join('')}
            </ul>
          </div>
          
          <div class="bg-purple-50 border-l-4 border-purple-400 p-4">
            <h4 class="font-semibold text-purple-800 mb-2">
              <i class="fas fa-star mr-2"></i>Overall Assessment
            </h4>
            <p class="text-purple-700">
              Based on your responses, you show 
              <span class="font-semibold">${analysis.eligibility === 'Yes' ? 'strong potential' : analysis.eligibility === 'Maybe' ? 'moderate potential' : 'areas for improvement'}</span> 
              for this career path.
            </p>
          </div>
        </div>
      </div>
      
      <div class="mt-6 p-4 bg-gray-50 rounded-lg">
        <p class="text-gray-700 text-center">
          <i class="fas fa-info-circle mr-2"></i>
          This is your initial assessment. Would you like to answer 5 more detailed questions for a comprehensive analysis?
        </p>
      </div>
    </div>
  `;
}

// Continue to follow-up questions
async function continueToFollowUp() {
  setLoading(true);
  showError('');

  try {
    const response = await fetch('/searchJob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dreamJob: currentDreamJob,
        uid: currentUser.uid,
        followUp: true,
        previousAnswers: currentAnswers
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.questions && data.questions.length > 0) {
      currentQuestions = data.questions;
      currentAnswers = [];
      currentQuestionIndex = 0;
      isFollowUpPhase = true;
      
      showQuestion();
    } else {
      throw new Error('No follow-up questions received');
    }
  } catch (error) {
    console.error('Error getting follow-up questions:', error);
    showError('Failed to get follow-up questions. Please try again.');
  } finally {
    setLoading(false);
  }
}

// Perform final analysis
async function performFinalAnalysis() {
  setLoading(true);
  showError('');

  try {
    const response = await fetch('/searchJob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dreamJob: currentDreamJob,
        uid: currentUser.uid,
        finalAnalysis: true,
        questions: currentQuestions,
        answers: currentAnswers,
        intermediateAnalysis: intermediateAnalysis
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const analysis = await response.json();
    showFinalResults(analysis);
  } catch (error) {
    console.error('Error performing final analysis:', error);
    showError('Failed to perform analysis. Please try again.');
  } finally {
    setLoading(false);
  }
}

// Show final results
function showFinalResults(analysis) {
  const container = document.getElementById('finalResults');
  
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg p-6">
      <h3 class="text-3xl font-bold text-gray-800 mb-6 text-center">
        <i class="fas fa-trophy text-yellow-500 mr-3"></i>
        Final Career Analysis
      </h3>
      
      <div class="text-center mb-6">
        <h4 class="text-xl font-semibold text-gray-700 mb-2">Dream Job: ${currentDreamJob}</h4>
        <div class="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
          analysis.eligibility === 'Yes' ? 'bg-green-100 text-green-800' :
          analysis.eligibility === 'Maybe' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }">
          <i class="fas fa-${analysis.eligibility === 'Yes' ? 'check' : analysis.eligibility === 'Maybe' ? 'question' : 'times'}-circle mr-2"></i>
          ${analysis.eligibility === 'Yes' ? 'Strong Match' : analysis.eligibility === 'Maybe' ? 'Moderate Match' : 'Needs Development'}
        </div>
      </div>
      
      <div class="grid md:grid-cols-2 gap-6 mb-6">
        <div class="space-y-4">
          <div class="bg-green-50 border-l-4 border-green-400 p-4">
            <h4 class="font-semibold text-green-800 mb-2">
              <i class="fas fa-check-circle mr-2"></i>Your Strengths
            </h4>
            <ul class="text-green-700 space-y-1">
              ${analysis.strengths.map(strength => `<li>• ${strength}</li>`).join('')}
            </ul>
          </div>
          
          <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <h4 class="font-semibold text-yellow-800 mb-2">
              <i class="fas fa-exclamation-triangle mr-2"></i>Development Areas
            </h4>
            <ul class="text-yellow-700 space-y-1">
              ${analysis.gaps.map(gap => `<li>• ${gap}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div class="space-y-4">
          <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
            <h4 class="font-semibold text-blue-800 mb-2">
              <i class="fas fa-lightbulb mr-2"></i>Action Plan
            </h4>
            <ul class="text-blue-700 space-y-1">
              ${analysis.recommendations.map(rec => `<li>• ${rec}</li>`).join('')}
            </ul>
          </div>
          
          <div class="bg-purple-50 border-l-4 border-purple-400 p-4">
            <h4 class="font-semibold text-purple-800 mb-2">
              <i class="fas fa-chart-line mr-2"></i>Career Outlook
            </h4>
            <p class="text-purple-700">
              ${analysis.careerOutlook || 'Based on your comprehensive assessment, this career path shows promising alignment with your profile and goals.'}
            </p>
          </div>
        </div>
      </div>
      
      <div class="bg-gray-50 p-4 rounded-lg">
        <h4 class="font-semibold text-gray-800 mb-2">
          <i class="fas fa-info-circle mr-2"></i>Next Steps
        </h4>
        <p class="text-gray-700">
          Your analysis has been saved to your profile. You can review this assessment anytime and track your progress as you work towards your career goals.
        </p>
      </div>
    </div>
  `;
  
  document.getElementById('questionSection').style.display = 'none';
  document.getElementById('intermediateSection').style.display = 'none';
  document.getElementById('finalSection').style.display = 'block';
}

// Restart analysis
function restartAnalysis() {
  // Show input section, hide others
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('questionSection').style.display = 'none';
  document.getElementById('intermediateSection').style.display = 'none';
  document.getElementById('finalSection').style.display = 'none';
  currentQuestions = [];
  currentAnswers = [];
  currentQuestionIndex = 0;
  currentDreamJob = '';
  isFollowUpPhase = false;
  intermediateAnalysis = null;
  
  document.getElementById('dreamJob').value = '';
  document.getElementById('mainSection').style.display = 'block';
  
  showError('');
}

// Utility functions
function setLoading(loading) {
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn && analyzeBtn.offsetParent !== null) {
    analyzeBtn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...'
      : '<i class="fas fa-magic mr-2"></i>Analyze My Dream Job';
    analyzeBtn.disabled = loading;
  }

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn && nextBtn.offsetParent !== null) {
    nextBtn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...'
      : '<i class="fas fa-arrow-right mr-2"></i>Next Question';
    nextBtn.disabled = loading;
  }

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn && continueBtn.offsetParent !== null) {
    continueBtn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin mr-2"></i>Loading...'
      : '<i class="fas fa-arrow-right mr-2"></i>Continue with Follow-up Questions';
    continueBtn.disabled = loading;
  }
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  if (message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  } else {
    errorDiv.style.display = 'none';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initDreamJobAnalyzer();
}); 
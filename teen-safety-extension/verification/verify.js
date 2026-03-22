/**
 * =====================================================
 * AI VERIFICATION ENGINE - Main Controller
 * =====================================================
 * 
 * Architecture Component: AI Verification Engine
 * 
 * Orchestrates the complete verification flow:
 * 1. Camera Access Check
 * 2. Face Detection (face-api.js TinyFace)
 * 3. Liveness Detection (Blink + Movement)
 * 4. Age Estimation (10-frame, IQR, confidence)
 * 5. Decision Engine (age rules)
 * 6. Send result to background.js
 * =====================================================
 */

// ============================================
// CONFIGURATION
// ============================================

const MODELS_PATH = chrome.runtime.getURL('models');
const FACE_DETECTION_INTERVAL = 150; // ms between detection frames

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  faceBox: document.getElementById('face-box'),
  statusMessage: document.getElementById('status-message'),
  verifyBtn: document.getElementById('verify-btn'),
  retryBtn: document.getElementById('retry-btn'),
  resultContainer: document.getElementById('result-container'),
  resultIcon: document.getElementById('result-icon'),
  resultText: document.getElementById('result-text'),
  resultDetails: document.getElementById('result-details'),
  resultAge: document.getElementById('result-age'),
  videoContainer: document.getElementById('video-container'),
  instructions: document.getElementById('instructions'),
  livenessStatus: document.getElementById('liveness-status'),
  livenessIcon: document.getElementById('liveness-icon'),
  livenessText: document.getElementById('liveness-text'),
  liveInfo: document.getElementById('live-info'),
  liveAge: document.getElementById('live-age'),
  liveGender: document.getElementById('live-gender'),
  cameraBlockedOverlay: document.getElementById('camera-blocked-overlay'),
  enableCameraBtn: document.getElementById('enable-camera-btn'),
  goBackBtn: document.getElementById('go-back-btn'),
  steps: {
    step1: document.getElementById('step-1'),
    step2: document.getElementById('step-2'),
    step3: document.getElementById('step-3'),
    step4: document.getElementById('step-4')
  }
};

// ============================================
// MODULE INSTANCES
// ============================================

const livenessDetector = new LivenessDetector({
  blinksRequired: 1,
  movementThreshold: 15
});

const ageEstimator = new AgeEstimator({
  numSamples: 10,
  sampleDelay: 300,
  minValidSamples: 7,
  inputSize: 416,
  onProgress: updateEstimationProgress,
  onSample: updateSampleInfo
});

const decisionEngine = new DecisionEngine({
  adultAge: 20,
  minorAge: 15,
  highConfidence: 0.65,
  ageThreshold: 18
});

// ============================================
// STATE
// ============================================

let stream = null;
let isModelLoaded = false;
let detectionInterval = null;
let lastDetection = null;
let livenessConfirmed = false;

// ============================================
// STEP 1: INITIALIZATION
// ============================================

async function init() {
  console.log('[Verify] Initializing AI Verification Engine...');

  try {
    // Load AI models
    updateStatus('Loading AI models...', 'loading');
    setStepActive(1);
    await loadModels();
    setStepCompleted(1);

    // Start camera
    updateStatus('Starting camera...', 'loading');
    await startCamera();

    updateStatus('Camera ready. Detecting face...', 'ready');
    setStepActive(2);

    // Start face detection loop
    startFaceDetectionLoop();

  } catch (error) {
    console.error('[Verify] Init error:', error);
    handleInitError(error);
  }
}

/**
 * Load face-api.js models
 */
async function loadModels() {
  console.log('[Verify] Loading models from:', MODELS_PATH);

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
    faceapi.nets.ageGenderNet.loadFromUri(MODELS_PATH),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH)
  ]);

  isModelLoaded = true;
  console.log('[Verify] ✅ All models loaded');
}

/**
 * Architecture: Camera Access Check
 * If NO → sends CAMERA_BLOCKED to background → BLOCK ALL RESTRICTED SITES
 */
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: false
    });

    elements.video.srcObject = stream;

    await new Promise((resolve) => {
      elements.video.onloadedmetadata = () => {
        elements.video.play();
        resolve();
      };
    });

    // Set canvas dimensions
    elements.overlay.width = elements.video.videoWidth;
    elements.overlay.height = elements.video.videoHeight;

    console.log('[Verify] ✅ Camera started');

  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      console.log('[Verify] ❌ Camera access DENIED');
      showCameraBlocked();
      throw new Error('Camera permission denied');
    }
    throw error;
  }
}

// ============================================
// STEP 2: FACE DETECTION (face-api.js TinyFace)
// ============================================

function startFaceDetectionLoop() {
  detectionInterval = setInterval(async () => {
    if (!isModelLoaded || !elements.video.videoWidth) return;

    try {
      const detection = await faceapi
        .detectSingleFace(elements.video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withAgeAndGender();

      if (detection) {
        lastDetection = detection;

        // Draw face bounding box
        drawFaceBox(detection);

        // Show live age/gender preview
        showLiveInfo(detection);

        // Update step 2 as completed
        setStepCompleted(2);

        // ── STEP 3: Liveness Detection ──
        setStepActive(3);
        const livenessStatus = livenessDetector.processFrame(detection.landmarks);
        updateLivenessUI(livenessStatus);

        if (livenessStatus.isLive && !livenessConfirmed) {
          livenessConfirmed = true;
          setStepCompleted(3);
          setStepActive(4);

          // Enable verify button
          elements.verifyBtn.disabled = false;
          updateStatus('✅ Face detected & liveness confirmed! Click Verify to check age.', 'ready');
        }

      } else {
        lastDetection = null;
        hideFaceBox();
        hideLiveInfo();
      }

    } catch (error) {
      console.error('[Verify] Detection loop error:', error);
    }

  }, FACE_DETECTION_INTERVAL);
}

// ============================================
// STEP 4: AGE VERIFICATION (Full Pipeline)
// ============================================

async function performVerification() {
  if (!lastDetection) {
    updateStatus('❌ No face detected. Please position your face in frame.', 'error');
    return;
  }

  if (!livenessConfirmed) {
    updateStatus('⏳ Please complete liveness check first (blink or move).', 'error');
    return;
  }

  console.log('[Verify] Starting full verification pipeline...');

  // Disable button, show loading
  elements.verifyBtn.disabled = true;
  elements.verifyBtn.querySelector('.btn-text').textContent = '🔍 Analyzing...';
  elements.verifyBtn.querySelector('.btn-loader').classList.remove('hidden');

  updateStatus('Analyzing facial features... Please hold still.', 'analyzing');

  try {
    // Stop continuous face detection during sampling
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }

    // ── Age Estimation (10-frame sampling + IQR + confidence) ──
    const ageResult = await ageEstimator.estimate(elements.video);

    // ── Get final liveness status ──
    const livenessResult = livenessDetector.getStatus();

    // ── Decision Engine ──
    const decision = decisionEngine.decide(ageResult, livenessResult);

    // ── Show Result ──
    showResult(decision);

    // ── Send to background.js ──
    sendResultToBackground(decision);

  } catch (error) {
    console.error('[Verify] Verification error:', error);
    updateStatus(`❌ ${error.message}`, 'error');
    resetVerifyButton();
    elements.retryBtn.classList.remove('hidden');
  }
}

/**
 * Send decision result to background service worker
 */
function sendResultToBackground(decision) {
  chrome.runtime.sendMessage({
    type: 'VERIFICATION_RESULT',
    data: {
      age: decision.age,
      confidence: decision.confidence,
      decision: decision.decision,
      details: {
        action: decision.action,
        message: decision.message,
        liveness: decision.liveness,
        statistics: decision.ageStatistics,
        reasoning: decision.reasoning
      }
    }
  }, (response) => {
    if (response) {
      console.log('[Verify] Background response:', response);
    }
  });
}

// ============================================
// CAMERA BLOCKED HANDLER
// ============================================

function showCameraBlocked() {
  elements.cameraBlockedOverlay.classList.remove('hidden');

  // Notify background → BLOCK ALL RESTRICTED SITES
  chrome.runtime.sendMessage({ type: 'CAMERA_BLOCKED' }, (response) => {
    console.log('[Verify] Camera blocked notification sent:', response);
  });
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

function updateStatus(message, type = 'loading') {
  const loaderHtml = type === 'loading' || type === 'analyzing'
    ? '<div class="loader"></div>'
    : '';

  elements.statusMessage.innerHTML = `${loaderHtml}<span>${message}</span>`;
  elements.statusMessage.className = `status ${type}`;
}

function setStepActive(stepNum) {
  const step = elements.steps[`step${stepNum}`];
  if (step) {
    step.classList.add('active');
  }
}

function setStepCompleted(stepNum) {
  const step = elements.steps[`step${stepNum}`];
  if (step) {
    step.classList.add('completed');
    step.classList.remove('active');
  }
}

function drawFaceBox(detection) {
  const box = detection.detection.box;
  const videoWidth = elements.video.offsetWidth;
  const videoHeight = elements.video.offsetHeight;
  const scaleX = videoWidth / elements.video.videoWidth;
  const scaleY = videoHeight / elements.video.videoHeight;

  // Mirror X for flipped video
  const mirroredX = elements.video.videoWidth - box.x - box.width;

  elements.faceBox.style.left = `${mirroredX * scaleX}px`;
  elements.faceBox.style.top = `${box.y * scaleY}px`;
  elements.faceBox.style.width = `${box.width * scaleX}px`;
  elements.faceBox.style.height = `${box.height * scaleY}px`;
  elements.faceBox.classList.remove('hidden');
}

function hideFaceBox() {
  elements.faceBox.classList.add('hidden');
}

function showLiveInfo(detection) {
  elements.liveInfo.classList.remove('hidden');
  elements.liveAge.textContent = `~${Math.round(detection.age)}y`;
  elements.liveGender.textContent = detection.gender === 'male' ? '♂️ Male' : '♀️ Female';
}

function hideLiveInfo() {
  elements.liveInfo.classList.add('hidden');
}

function updateLivenessUI(status) {
  if (status.isLive) {
    elements.livenessStatus.className = 'liveness-status passed';
    elements.livenessIcon.textContent = '✅';
    elements.livenessText.textContent = status.message;
  } else {
    elements.livenessStatus.className = 'liveness-status checking';
    elements.livenessIcon.textContent = '⏳';
    elements.livenessText.textContent = status.message;
  }
}

function updateEstimationProgress(progress) {
  updateStatus(
    `Analyzing face... ${progress.percent}% (${progress.validSamples} valid samples)`,
    'analyzing'
  );
}

function updateSampleInfo(sample, current, total) {
  // Optional: show each sample on the live info
  elements.liveAge.textContent = `~${Math.round(sample.age)}y (${current}/${total})`;
}

function showResult(decision) {
  // Hide video and instructions
  elements.videoContainer.style.display = 'none';
  elements.instructions.style.display = 'none';
  elements.livenessStatus.style.display = 'none';

  // Show result container
  elements.resultContainer.classList.remove('hidden');

  if (decision.action === 'ALLOW') {
    elements.resultIcon.textContent = '✅';
    elements.resultText.textContent = 'Age Verified - Access Granted';
    elements.resultText.className = 'result-text allowed';
    elements.resultDetails.textContent = decision.message;
    elements.resultAge.textContent =
      `Estimated Age: ${decision.age} | Confidence: ${Math.round(decision.confidence * 100)}% | Decision: ${decision.decision}`;
    updateStatus('✅ Verification passed. Redirecting...', 'success');
  } else {
    elements.resultIcon.textContent = '🚫';
    elements.resultText.textContent = 'Access Denied';
    elements.resultText.className = 'result-text blocked';
    elements.resultDetails.textContent = decision.message;
    elements.resultAge.textContent =
      `Estimated Age: ${decision.age} | Confidence: ${Math.round(decision.confidence * 100)}% | Decision: ${decision.decision}`;
    updateStatus('🚫 Age requirement not met.', 'error');
  }

  // Show reasoning steps
  if (decision.reasoning) {
    showReasoning(decision.reasoning);
  }

  // Update step 4
  setStepCompleted(4);

  // Hide verify button, show retry
  elements.verifyBtn.classList.add('hidden');
  if (decision.action === 'BLOCK') {
    elements.retryBtn.classList.remove('hidden');
  }

  // Stop camera
  stopCamera();
}

function showReasoning(steps) {
  let html = '<div class="reasoning-steps">';
  html += '<h4 style="margin-top:15px;color:#8a8a9a;font-size:13px;">Verification Steps:</h4>';

  for (const step of steps) {
    const icon = step.passed ? '✅' : '❌';
    html += `<div style="font-size:12px;color:#6a6a7a;padding:3px 0;">${icon} ${step.check}: ${step.result}</div>`;
  }

  html += '</div>';
  elements.resultAge.insertAdjacentHTML('afterend', html);
}

function resetVerifyButton() {
  elements.verifyBtn.disabled = false;
  elements.verifyBtn.querySelector('.btn-text').textContent = '🔍 Verify My Age';
  elements.verifyBtn.querySelector('.btn-loader').classList.add('hidden');
}

function stopCamera() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

elements.verifyBtn.addEventListener('click', performVerification);

elements.retryBtn.addEventListener('click', () => {
  livenessDetector.reset();
  livenessConfirmed = false;
  location.reload();
});

elements.enableCameraBtn.addEventListener('click', () => {
  elements.cameraBlockedOverlay.classList.add('hidden');
  init();
});

elements.goBackBtn.addEventListener('click', () => {
  history.back();
});

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
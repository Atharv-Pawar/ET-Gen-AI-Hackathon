// Teen Safety Shield - Age Verification Module

// ============================================
// CONFIGURATION
// ============================================

const MODELS_PATH = chrome.runtime.getURL('models');
const AGE_THRESHOLD = 18;
const CONFIDENCE_THRESHOLD = 0.5;
const FACE_DETECTION_INTERVAL = 100; // ms

// ============================================
// DOM ELEMENTS
// ============================================

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const faceBox = document.getElementById('face-box');
const statusMessage = document.getElementById('status-message');
const verifyBtn = document.getElementById('verify-btn');
const retryBtn = document.getElementById('retry-btn');
const resultContainer = document.getElementById('result-container');
const resultIcon = document.getElementById('result-icon');
const resultText = document.getElementById('result-text');
const ageDisplay = document.getElementById('age-display');
const cameraBlockedNotice = document.getElementById('camera-blocked-notice');
const enableCameraBtn = document.getElementById('enable-camera-btn');

// ============================================
// STATE
// ============================================

let stream = null;
let isModelLoaded = false;
let detectionInterval = null;
let lastDetection = null;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  updateStatus('Loading AI models...', 'loading');
  
  try {
    // Load face-api.js models
    await loadModels();
    
    updateStatus('Starting camera...', 'loading');
    
    // Start camera
    await startCamera();
    
    updateStatus('Ready! Position your face and click Verify', 'ready');
    verifyBtn.disabled = false;
    
    // Start face detection loop
    startFaceDetection();
    
  } catch (error) {
    console.error('[Teen Safety] Initialization error:', error);
    handleError(error);
  }
}

async function loadModels() {
  console.log('[Teen Safety] Loading models from:', MODELS_PATH);
  
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
    faceapi.nets.ageGenderNet.loadFromUri(MODELS_PATH),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH)
  ]);
  
  isModelLoaded = true;
  console.log('[Teen Safety] Models loaded successfully');
}

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
    
    video.srcObject = stream;
    
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
    
    // Set canvas dimensions
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    
    console.log('[Teen Safety] Camera started');
    
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      showCameraBlocked();
      throw new Error('Camera permission denied');
    }
    throw error;
  }
}

// ============================================
// FACE DETECTION
// ============================================

function startFaceDetection() {
  detectionInterval = setInterval(async () => {
    if (!isModelLoaded || !video.videoWidth) return;
    
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withAgeAndGender();
      
      if (detection) {
        lastDetection = detection;
        drawFaceBox(detection);
      } else {
        hideFaceBox();
        lastDetection = null;
      }
      
    } catch (error) {
      console.error('[Teen Safety] Detection error:', error);
    }
    
  }, FACE_DETECTION_INTERVAL);
}

function drawFaceBox(detection) {
  const box = detection.detection.box;
  
  // Account for mirrored video
  const videoWidth = video.offsetWidth;
  const videoHeight = video.offsetHeight;
  const scaleX = videoWidth / video.videoWidth;
  const scaleY = videoHeight / video.videoHeight;
  
  // Mirror the x position
  const mirroredX = video.videoWidth - box.x - box.width;
  
  faceBox.style.left = `${mirroredX * scaleX}px`;
  faceBox.style.top = `${box.y * scaleY}px`;
  faceBox.style.width = `${box.width * scaleX}px`;
  faceBox.style.height = `${box.height * scaleY}px`;
  faceBox.classList.remove('hidden');
}

function hideFaceBox() {
  faceBox.classList.add('hidden');
}

// ============================================
// VERIFICATION
// ============================================

async function performVerification() {
  if (!lastDetection) {
    updateStatus('No face detected. Please position your face in the camera.', 'error');
    return;
  }
  
  // Disable button and show loader
  verifyBtn.disabled = true;
  verifyBtn.querySelector('.btn-text').textContent = 'Analyzing...';
  verifyBtn.querySelector('.btn-loader').classList.remove('hidden');
  
  updateStatus('Analyzing facial features...', 'loading');
  
  try {
    // Perform multiple detections for better accuracy
    const detections = [];
    
    for (let i = 0; i < 5; i++) {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416, // Higher resolution for better accuracy
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withAgeAndGender();
      
      if (detection) {
        detections.push(detection);
      }
      
      await sleep(200);
    }
    
    if (detections.length < 3) {
      throw new Error('Could not get consistent face detection');
    }
    
    // Calculate average age
    const ages = detections.map(d => d.age);
    const averageAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    const roundedAge = Math.round(averageAge);
    
    // Calculate confidence based on consistency
    const ageVariance = calculateVariance(ages);
    const confidence = Math.max(0, 1 - (ageVariance / 50));
    
    console.log(`[Teen Safety] Age estimation: ${roundedAge} (confidence: ${confidence.toFixed(2)})`);
    
    // Show result
    showResult(roundedAge, confidence);
    
    // Send result to background script
    chrome.runtime.sendMessage({
      type: 'VERIFICATION_COMPLETE',
      data: {
        age: roundedAge,
        confidence: confidence
      }
    });
    
  } catch (error) {
    console.error('[Teen Safety] Verification error:', error);
    updateStatus('Verification failed. Please try again.', 'error');
    resetVerifyButton();
    retryBtn.classList.remove('hidden');
  }
}

function showResult(age, confidence) {
  // Stop face detection
  if (detectionInterval) {
    clearInterval(detectionInterval);
  }
  
  // Hide video and show result
  document.querySelector('.video-container').style.display = 'none';
  document.querySelector('.instructions').style.display = 'none';
  resultContainer.classList.remove('hidden');
  
  if (age >= AGE_THRESHOLD) {
    resultIcon.textContent = '✅';
    resultText.textContent = 'Age Verified - Access Granted';
    resultText.className = 'result-text success';
    ageDisplay.textContent = `Estimated age: ${age} years (Confidence: ${Math.round(confidence * 100)}%)`;
    updateStatus('Redirecting to requested site...', 'success');
  } else {
    resultIcon.textContent = '🚫';
    resultText.textContent = 'Access Denied - Age Restriction';
    resultText.className = 'result-text blocked';
    ageDisplay.textContent = `Estimated age: ${age} years - Must be ${AGE_THRESHOLD}+ to access`;
    updateStatus('This content is not available for your age group.', 'error');
  }
  
  // Hide verify button
  verifyBtn.classList.add('hidden');
}

// ============================================
// ERROR HANDLING
// ============================================

function handleError(error) {
  console.error('[Teen Safety] Error:', error);
  
  if (error.message.includes('Camera permission')) {
    showCameraBlocked();
  } else {
    updateStatus(`Error: ${error.message}`, 'error');
    retryBtn.classList.remove('hidden');
  }
}

function showCameraBlocked() {
  cameraBlockedNotice.classList.remove('hidden');
  
  // Notify background script
  chrome.runtime.sendMessage({ type: 'CAMERA_BLOCKED' });
}

// ============================================
// UI HELPERS
// ============================================

function updateStatus(message, type = 'loading') {
  const loaderHtml = type === 'loading' ? '<div class="loader"></div>' : '';
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'ready' ? '👤' : '';
  
  statusMessage.innerHTML = `${loaderHtml}<span>${icon} ${message}</span>`;
  statusMessage.className = `status ${type}`;
}

function resetVerifyButton() {
  verifyBtn.disabled = false;
  verifyBtn.querySelector('.btn-text').textContent = 'Verify My Age';
  verifyBtn.querySelector('.btn-loader').classList.add('hidden');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateVariance(array) {
  const mean = array.reduce((a, b) => a + b, 0) / array.length;
  return array.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / array.length;
}

// ============================================
// EVENT LISTENERS
// ============================================

verifyBtn.addEventListener('click', performVerification);

retryBtn.addEventListener('click', () => {
  location.reload();
});

enableCameraBtn.addEventListener('click', async () => {
  cameraBlockedNotice.classList.add('hidden');
  await init();
});

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
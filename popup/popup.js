// Teen Safety Shield - Popup Script

// ============================================
// DOM ELEMENTS
// ============================================

const enableToggle = document.getElementById('enable-toggle');
const statusCard = document.getElementById('status-card');
const statusLabel = document.getElementById('status-label');
const statusDetail = document.getElementById('status-detail');
const blockedCount = document.getElementById('blocked-count');
const verifiedStatus = document.getElementById('verified-status');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Get current state from background
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.state) {
      updateUI(response.state);
    }
  });
  
  // Get blocked count from storage
  chrome.storage.local.get(['blockedCount'], (result) => {
    blockedCount.textContent = result.blockedCount || 0;
  });
}

function updateUI(state) {
  // Update toggle
  enableToggle.checked = state.enabled;
  
  // Update status card
  if (state.enabled) {
    statusCard.classList.remove('disabled');
    statusLabel.textContent = 'Protection Active';
    statusDetail.textContent = 'Monitoring for harmful content';
  } else {
    statusCard.classList.add('disabled');
    statusLabel.textContent = 'Protection Disabled';
    statusDetail.textContent = 'Your browser is not protected';
  }
  
  // Update verification status
  if (state.verifiedAge !== null) {
    if (state.verifiedAge >= 18) {
      verifiedStatus.textContent = `Adult (${state.verifiedAge}y)`;
      verifiedStatus.style.color = '#2ed573';
    } else {
      verifiedStatus.textContent = `Minor (${state.verifiedAge}y)`;
      verifiedStatus.style.color = '#ff4757';
    }
  } else if (state.cameraBlocked) {
    verifiedStatus.textContent = 'Camera Blocked';
    verifiedStatus.style.color = '#ff4757';
  } else {
    verifiedStatus.textContent = 'Not Verified';
    verifiedStatus.style.color = '#a0a0a0';
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

enableToggle.addEventListener('change', () => {
  const enabled = enableToggle.checked;
  
  chrome.runtime.sendMessage({ 
    type: 'TOGGLE_EXTENSION', 
    enabled: enabled 
  }, (response) => {
    if (response.success) {
      // Update UI
      if (enabled) {
        statusCard.classList.remove('disabled');
        statusLabel.textContent = 'Protection Active';
        statusDetail.textContent = 'Monitoring for harmful content';
      } else {
        statusCard.classList.add('disabled');
        statusLabel.textContent = 'Protection Disabled';
        statusDetail.textContent = 'Your browser is not protected';
      }
    }
  });
});

resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_VERIFICATION' }, (response) => {
    if (response.success) {
      verifiedStatus.textContent = 'Not Verified';
      verifiedStatus.style.color = '#a0a0a0';
      
      // Show confirmation
      resetBtn.innerHTML = '<span>✅</span> Reset Complete';
      setTimeout(() => {
        resetBtn.innerHTML = '<span>🔄</span> Reset Verification';
      }, 2000);
    }
  });
});

settingsBtn.addEventListener('click', () => {
  // Open settings page (can be implemented later)
  alert('Settings page coming soon!');
});

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', init);
/**
 * =====================================================
 * CONTENT SCRIPT
 * =====================================================
 * 
 * Injected into every page
 * Listens for block commands from background
 * =====================================================
 */

// Listen for direct block commands from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCK_PAGE') {
    // Replace entire page content
    document.documentElement.innerHTML = getBlockPageHTML(message.data);
    sendResponse({ blocked: true });
  }
  return true;
});

function getBlockPageHTML(data = {}) {
  return `
    <html>
      <head>
        <title>Blocked - Teen Safety Shield</title>
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #0f3460);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .blocked { padding: 40px; max-width: 500px; }
          .icon { font-size: 80px; margin-bottom: 20px; }
          h1 { font-size: 32px; color: #ff4757; margin-bottom: 10px; }
          p { color: #a0a0a0; font-size: 16px; line-height: 1.6; }
          .btn {
            display: inline-block; margin-top: 20px; padding: 12px 30px;
            background: #2ed573; color: #1a1a2e; border-radius: 50px;
            text-decoration: none; font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="blocked">
          <div class="icon">🛡️</div>
          <h1>Access Blocked</h1>
          <p>${data.message || 'This site has been blocked by Teen Safety Shield for your protection.'}</p>
          <a href="https://www.google.com" class="btn">Go to Google</a>
        </div>
      </body>
    </html>
  `;
}

console.log('[Teen Safety] Content script loaded');
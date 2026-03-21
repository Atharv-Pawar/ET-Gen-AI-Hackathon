// Teen Safety Shield - Content Script
// This script runs on every page

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCK_PAGE') {
    // Replace page content with block message
    document.documentElement.innerHTML = `
      <html>
        <head>
          <title>Blocked - Teen Safety Shield</title>
          <style>
            body {
              font-family: 'Segoe UI', sans-serif;
              background: #1a1a2e;
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .blocked {
              padding: 40px;
            }
            h1 {
              font-size: 48px;
              color: #ff4757;
            }
            p {
              color: #a0a0a0;
            }
          </style>
        </head>
        <body>
          <div class="blocked">
            <h1>🛡️ Access Blocked</h1>
            <p>This site has been blocked by Teen Safety Shield</p>
          </div>
        </body>
      </html>
    `;
    sendResponse({ blocked: true });
  }
  return true;
});

console.log('[Teen Safety] Content script loaded');
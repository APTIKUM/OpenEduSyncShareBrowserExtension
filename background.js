importScripts("logger.js");

const log = OpenEduLogger.createLogger("Background");
    
const answers = {};

log.info("Background script initialized");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_ANSWERS") {
    return;
  }

  (async () => {
    try {
      const response = await fetch(
        "https://localhost:7100/api/answers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(message.queries)
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      Object.assign(answers, data);

      sendResponse({
        success: true,
        answers: data
      });
    } catch (error) {
      log.error("OpenEduSyncShare API error:", error);

      sendResponse({
        success: false,
        error: error.message
      });
    }
  })();

  return true;
});

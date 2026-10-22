importScripts("logger.js");

const log = OpenEduLogger.createLogger("Background");
    
const answers = {};
const apiBaseUrl = "https://localhost:7100/api";

log.info("Background script initialized");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type !== "GET_ANSWERS" &&
    message.type !== "PROBLEM_CHECK_CORRECT"
  ) {
    return;
  }

  (async () => {
    try {
      if (message.type === "PROBLEM_CHECK_CORRECT") {
        const response = await fetch(`${apiBaseUrl}/answers/set`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(message.body)
        });

        if (!response.ok) {
          throw new Error(`Answers set HTTP ${response.status}`);
        }

        log.info("Answers set request completed", {
          problemCheckUrl: message.url
        });
        sendResponse({ success: true });
        return;
      }

      const response = await fetch(
        `${apiBaseUrl}/answers/query`,
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

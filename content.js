(function () {
  const frameType = window.top === window ? "top" : "iframe";
  const logPrefix = "[OpenEdu SyncShare][" + frameType + "]";
  console.log(logPrefix, "Extension started", {
    url: window.location.href,
    frame: window.top === window ? "top" : "iframe"
  });

  const questionIdPrefix = "inputtype_";
  const questionSelector = `[id^="${questionIdPrefix}"]`;
  const wrapperClass = "openedu-question-wrapper";
  const markerAttribute = "data-openedu-question-processed";

  function wrapQuestion(question) {
    if (
      question.hasAttribute(markerAttribute) ||
      !question.id.startsWith(questionIdPrefix) ||
      question.id.length <= questionIdPrefix.length
    ) {
      return false;
    }

    const wrapper = document.createElement("div");
    const questionIdPart = question.id.slice(questionIdPrefix.length);
    const label = document.createElement("span");

    wrapper.className = wrapperClass;
    wrapper.dataset.questionId = questionIdPart;
    label.className = "openedu-question-label";
    label.textContent = questionIdPart;
    label.setAttribute("aria-label", "Question ID");

    question.setAttribute(markerAttribute, "true");
    question.parentNode.insertBefore(wrapper, question);
    wrapper.append(label, question);
    console.log(logPrefix, "Question highlighted:", {
      element: question,
      id: question.id,
      idPart: questionIdPart
    });
    return true;
  }

  function processQuestions(root) {
    let processedCount = 0;

    if (root instanceof Element && root.matches(questionSelector)) {
      if (wrapQuestion(root)) {
        processedCount += 1;
      }
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(questionSelector).forEach(function (question) {
        if (wrapQuestion(question)) {
          processedCount += 1;
        }
      });
    }

    if (processedCount > 0) {
      console.log(logPrefix, "Processed questions:", processedCount);
    }
  }

  function scanPage(reason) {
    const questions = document.querySelectorAll(questionSelector);
    console.log(logPrefix, "Scanning page:", reason, {
      matches: questions.length,
      ids: Array.from(questions).map(function (element) {
        return element.id;
      })
    });
    processQuestions(document);
  }

  scanPage("initial");

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processQuestions(node);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

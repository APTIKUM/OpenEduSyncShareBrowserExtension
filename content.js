(function () {
  const log = OpenEduLogger.createLogger("Content");

  const frameType = window.top === window ? "top" : "iframe";

  log.info("Extension started", {
    url: window.location.href,
    frame: frameType
  });

  const questionGeneralIdPrefix = "problem_";
  const questionInputIdPrefix = "inputtype_";

  const questionGeneralSelector = `[id^="${questionGeneralIdPrefix}"]`;
  const questionInputSelector = `[id^="${questionInputIdPrefix}"]`;

  const markerAttribute = "data-openedu-question-processed";

  function wrapQuestionGeneral(question) {
    if (
      question.hasAttribute(markerAttribute) ||
      question.id.length <= questionGeneralIdPrefix.length
    ) {
      return false;
    }

    const id = question.id.slice(questionGeneralIdPrefix.length);
    const wrapper = document.createElement("div");
    const label = document.createElement("span");

    wrapper.className = "openedu-question-wrapper general";
    wrapper.dataset.problemId = id;

    label.className = "openedu-question-label general";
    label.textContent = id;
    label.setAttribute("aria-label", "Problem ID");

    question.setAttribute(markerAttribute, "true");
    question.parentNode.insertBefore(wrapper, question);
    wrapper.append(label, question);

    return true;
  }

  function wrapQuestionInput(questionInput) {
    if (
      questionInput.hasAttribute(markerAttribute) ||
      questionInput.id.length <= questionInputIdPrefix.length
    ) {
      return false;
    }

    const id = questionInput.id.slice(questionInputIdPrefix.length);
    const wrapper = document.createElement("div");
    const label = document.createElement("span");

    wrapper.className = "openedu-question-wrapper input";
    wrapper.dataset.questionId = id;

    label.className = "openedu-question-label input";
    label.textContent = id;
    label.setAttribute("aria-label", "Input ID");

    questionInput.setAttribute(markerAttribute, "true");
    questionInput.parentNode.insertBefore(wrapper, questionInput);
    wrapper.append(label, questionInput);

    return true;
  }

  function processQuestions(root) {
    let processedProblems = 0;
    let processedInputs = 0;

    function processElement(element) {
      if (element.matches(questionGeneralSelector)) {
        if (wrapQuestionGeneral(element)) processedProblems++;
      }

      if (element.matches(questionInputSelector)) {
        if (wrapQuestionInput(element)) processedInputs++;
      }
    }

    if (root instanceof Element) {
      processElement(root);
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(
        `${questionGeneralSelector}, ${questionInputSelector}`
      ).forEach(processElement);
    }

    if (processedProblems || processedInputs) {
      log.info("Processed questions", {
        problems: processedProblems,
        inputs: processedInputs
      });
    }
  }

  function scanPage(reason) {
    const questions = document.querySelectorAll(questionInputSelector);
    log.debug("Scanning page", {
      reason,
      matches: questions.length,
      ids: Array.from(questions).map(element => element.id)
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

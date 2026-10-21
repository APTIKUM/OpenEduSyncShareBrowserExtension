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

  function AddAnswerButtonToQuestionInput(questionInput) {
    if (
      questionInput.hasAttribute(markerAttribute) ||
      questionInput.id.length <= questionInputIdPrefix.length
    ) {
      return false;
    }

    const id = questionInput.id.slice(questionInputIdPrefix.length);

    const wrapper = document.createElement("div");
    const button = document.createElement("button");

    wrapper.className = "openedu-question-wrapper input";
    wrapper.dataset.questionId = id;

    button.className = "openedu-load-answers-button";
    button.type = "button";
    button.textContent = "Загрузить ответ";
    button.setAttribute("aria-label", `Загрузить ответы для вопроса ${id}`);

    button.addEventListener("click", () => {
      alert(`ID вопроса: ${id}`);
    });

    questionInput.setAttribute(markerAttribute, "true");
    questionInput.parentNode.insertBefore(wrapper, questionInput);

    wrapper.append(button, questionInput);

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
        if (AddAnswerButtonToQuestionInput(element)) processedInputs++;
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

    void requestAnswers();
  }

  scanPage("initial");

  const answers = {};

  async function requestAnswers() {
    const queries = [
      ...new Set(
        Array.from(document.querySelectorAll(questionInputSelector))
          .filter(element =>
            element.id.length > questionInputIdPrefix.length
          )
          .map(element =>
            element.id.slice(questionInputIdPrefix.length)
          )
      )
    ];

    if (queries.length === 0) {
      log.info("No questions found");
      return;
    }

    log.info("Requesting answers", queries);

    try {
      const result = await chrome.runtime.sendMessage({
        type: "GET_ANSWERS",
        queries
      });

      if (!result?.success) {
        throw new Error(result?.error || "API request failed");
      }

      Object.assign(answers, result.answers);

    } catch (error) {
      log.error("Failed to get answers", error);
    }
  }

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

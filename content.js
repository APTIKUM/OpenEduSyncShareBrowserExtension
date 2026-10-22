(function () {
  const log = OpenEduLogger.createLogger("Content");

  const frameType = window.top === window ? "top" : "iframe";

  log.info("Extension started", {
    url: window.location.href,
    frame: frameType
  });

  window.addEventListener("openedu-problem-check", event => {
    log.info("Correct problem_check response received", event.detail);

    chrome.runtime.sendMessage({
      type: "PROBLEM_CHECK_CORRECT",
      url: event.detail?.url,
      body: event.detail?.body
    }).catch(error => {
      log.error("Failed to notify background about problem_check", error);
    });
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
    const answerStatus = document.createElement("span");

    wrapper.className = "openedu-question-wrapper input";
    wrapper.dataset.questionId = id;

    button.className = "openedu-load-answers-button";
    button.type = "button";
    button.hidden = true;
    button.textContent = "Загрузить ответ";
    button.setAttribute("aria-label", `Загрузить ответы для вопроса ${id}`);

    answerStatus.className = "openedu-answer-status";

    button.addEventListener("click", () => {
      const answer = answers[id];

      if (answer == null) {
        answerStatus.textContent = "Ответ не найден :(";
        log.warn("Answer not found", { questionId: id });
        return;
      }

      const textInput = questionInput.querySelector('input[type="text"]');

      if (textInput) {
        answerStatus.textContent = "";
        textInput.value = String(answer);
        textInput.dispatchEvent(new Event("input", { bubbles: true }));
        textInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      const radioInputs = questionInput.querySelectorAll(
        'input[type="radio"]'
      );
      const radioInput = Array.from(radioInputs).find(
        input => input.value === String(answer)
      );

      if (radioInput) {
        answerStatus.textContent = "";
        radioInput.checked = true;
        radioInput.dispatchEvent(new Event("input", { bubbles: true }));
        radioInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (radioInputs.length > 0) {
        log.warn("Radio answer option not found", {
          questionId: id,
          answer
        });
        return;
      }

      const checkboxInputs = questionInput.querySelectorAll(
        'input[type="checkbox"]'
      );

      if (checkboxInputs.length > 0) {
        const selectedValues = new Set(
          String(answer).split("&").map(value => value.trim())
        );

        checkboxInputs.forEach(input => {
          const checked = selectedValues.has(input.value);

          if (input.checked !== checked) {
            input.checked = checked;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });

        answerStatus.textContent = "";
        return;
      }

      log.warn("Text, radio, or checkbox answer input not found", {
        questionId: id
      });
    });

    questionInput.setAttribute(markerAttribute, "true");
    questionInput.parentNode.insertBefore(wrapper, questionInput);

    wrapper.append(button, answerStatus, questionInput);

    return true;
  }

  function processQuestions(root) {
    let processedProblems = 0;
    let processedInputs = 0;

    function processElement(element) {
      // if (element.matches(questionGeneralSelector)) {
      //   if (wrapQuestionGeneral(element)) processedProblems++;
      // }

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

  function updateAnswerControls() {
    document.querySelectorAll(".openedu-question-wrapper.input").forEach(
      wrapper => {
        const questionId = wrapper.dataset.questionId;
        const button = wrapper.querySelector(
          ".openedu-load-answers-button"
        );
        const answerStatus = wrapper.querySelector(".openedu-answer-status");

        if (!button || !answerStatus) {
          return;
        }

        if (answers[questionId] == null) {
          button.hidden = true;
          answerStatus.textContent = "Ответ не найден :(";
          return;
        }

        button.hidden = false;
        answerStatus.hidden = true;
      }
    );
  }

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

    // log.info("Requesting answers", queries);

    try {
      const result = await chrome.runtime.sendMessage({
        type: "GET_ANSWERS",
        queries
      });

      if (!result?.success) {
        throw new Error(result?.error || "API request failed");
      }

      Object.assign(answers, result.answers);
      updateAnswerControls();

    } catch (error) {
      log.error("Failed to get answers", error);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processQuestions(node);
          updateAnswerControls();
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

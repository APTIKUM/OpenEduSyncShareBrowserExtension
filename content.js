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
  const matchingTableSelector = '[data-type="MatchingTableVueApp"]';

  const markerAttribute = "data-openedu-question-processed";
  const addedElementsSelector = [
    ".openedu-question-label",
    ".openedu-load-answers-button",
    ".openedu-answer-status"
  ].join(", ");
  const addedElementsVisibilityStorageKey = "openedu-added-elements-hidden";
  let addedElementsHidden = localStorage.getItem(
    addedElementsVisibilityStorageKey
  ) === "true";

  function setAddedElementsVisibility(hidden) {
    addedElementsHidden = hidden;
    localStorage.setItem(
      addedElementsVisibilityStorageKey,
      String(hidden)
    );
    updateAnswerControls();

    document.querySelectorAll(".openedu-question-label").forEach(label => {
      label.hidden = hidden;
    });
  }

  function isVisible(element) {
    if (element.hidden || element.getClientRects().length === 0) {
      return false;
    }

    let current = element;

    while (current instanceof Element) {
      const styles = window.getComputedStyle(current);

      if (
        styles.display === "none" ||
        styles.visibility === "hidden" ||
        styles.visibility === "collapse" ||
        styles.opacity === "0"
      ) {
        return false;
      }

      if (current.hidden) {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  }

  function getAnswerButtonTarget(questionInput) {
    const matchingTable = questionInput.closest(matchingTableSelector);

    if (!isVisible(questionInput) && matchingTable && isVisible(matchingTable)) {
      return matchingTable;
    }

    if (isVisible(questionInput)) {
      return questionInput;
    }

    let visibleAncestor = null;
    let current = questionInput.parentElement;

    while (current) {
      if (isVisible(current)) {
        if (!visibleAncestor) {
          visibleAncestor = current;
        }

        if (current.matches(matchingTableSelector)) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return visibleAncestor || questionInput;
  }

  function moveMatchingTableAnswerElements(answer, questionId) {
    const matchingAnswer = answer?.answer;

    log.info("Processing matching table element moves", {
      questionId,
      answer,
      matchingAnswer
    });

    if (
      matchingAnswer == null ||
      typeof matchingAnswer !== "object" ||
      Array.isArray(matchingAnswer)
    ) {
      log.warn("Matching table answer has no movable answer object", {
        questionId,
        answer
      });
      return;
    }

    Object.entries(matchingAnswer).forEach(([targetId, sourceIds]) => {
      const targetElement = document.getElementById(targetId);

      log.info("Matching table target lookup", {
        questionId,
        targetId,
        targetFound: Boolean(targetElement),
        sourceIds
      });

      if (!targetElement || !Array.isArray(sourceIds)) {
        log.warn("Matching table target or source IDs not found", {
          questionId,
          targetId
        });
        return;
      }

      sourceIds.forEach(sourceId => {
        const sourceElementId = String(sourceId);
        const sourceElement = document.getElementById(sourceElementId);

        log.info("Matching table source lookup", {
          questionId,
          targetId,
          sourceId: sourceElementId,
          sourceFound: Boolean(sourceElement)
        });

        if (!sourceElement) {
          log.warn("Matching table source element not found", {
            questionId,
            targetId,
            sourceId: sourceElementId
          });
          return;
        }

        if (
          sourceElement === targetElement ||
          sourceElement.contains(targetElement)
        ) {
          log.warn("Skipped invalid matching table element move", {
            questionId,
            targetId,
            sourceId: sourceElementId
          });
          return;
        }

        log.info("Moving matching table element", {
          questionId,
          sourceId: sourceElementId,
          targetId,
          sourceParentId: sourceElement.parentElement?.id || null
        });
        targetElement.append(sourceElement);
        log.info("Moved matching table element", {
          questionId,
          sourceId: sourceElementId,
          targetId,
          newParentId: sourceElement.parentElement?.id || null
        });
      });
    });
  }

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
    label.hidden = addedElementsHidden;

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
    const wrapperTarget = getAnswerButtonTarget(questionInput);
    const matchingTable = questionInput.closest(matchingTableSelector);
    const matchingTableTarget = wrapperTarget.matches(matchingTableSelector)
      ? wrapperTarget
      : matchingTable;
    const isMatchingTableQuestion = Boolean(matchingTableTarget);

    log.info("Answer button target detected", {
      questionId: id,
      isMatchingTableQuestion,
      questionInputId: questionInput.id,
      matchingTableId: matchingTableTarget?.id || null
    });

    wrapper.className = "openedu-question-wrapper input";
    wrapper.dataset.questionId = id;

    button.className = "openedu-load-answers-button";
    button.type = "button";
    button.hidden = true;
    button.textContent = "Загрузить ответ";
    button.setAttribute("aria-label", `Загрузить ответы для вопроса ${id}`);

    answerStatus.className = "openedu-answer-status";
    answerStatus.hidden = addedElementsHidden;

    button.addEventListener("click", () => {
      const answer = answers[id];

      console.info("[OpenEdu SyncShare] Answer button clicked", {
        questionId: id,
        isMatchingTableQuestion,
        matchingTableId: matchingTableTarget?.id || null,
        answer
      });

      if (answer == null) {
        answerStatus.textContent = "Ответ не найден :(";
        log.warn("Answer not found", { questionId: id });
        return;
      }

      const isMatchingAnswer = answer?.answer &&
        typeof answer.answer === "object" &&
        !Array.isArray(answer.answer);

      console.info("[OpenEdu SyncShare] Answer format detected", {
        questionId: id,
        isMatchingTableQuestion,
        isMatchingAnswer,
        answerType: typeof answer
      });

      if (isMatchingTableQuestion || isMatchingAnswer) {
        log.info("Loading matching table answer", {
          questionId: id,
          answer
        });
        let serializedAnswer;

        try {
          serializedAnswer = JSON.stringify(answer);
        } catch (error) {
          answerStatus.textContent = "Не удалось подготовить ответ :(";
          log.error("Failed to serialize matching table answer", {
            questionId: id,
            error
          });
          return;
        }

        const answerContainer = matchingTableTarget || questionInput;
        const answerField = answerContainer.matches("input, textarea")
          ? answerContainer
          : answerContainer.querySelector(
            'input[type="hidden"], textarea, input[type="text"]'
          );

        if (!answerField) {
          answerStatus.textContent = "Поле ответа не найдено :(";
          log.warn("Matching table answer field not found", {
            questionId: id
          });
          return;
        }

        answerStatus.textContent = "";
        answerField.value = serializedAnswer;
        answerField.dispatchEvent(new Event("input", { bubbles: true }));
        answerField.dispatchEvent(new Event("change", { bubbles: true }));
        moveMatchingTableAnswerElements(answer, id);
        return;
      }

      const textInput = questionInput.querySelector('input[type="text"]');

      if (textInput) {
        console.info("[OpenEdu SyncShare] Using regular text answer field", {
          questionId: id,
          inputId: textInput.id,
          answerType: typeof answer
        });
        answerStatus.textContent = "";
        textInput.value = typeof answer === "object"
          ? JSON.stringify(answer)
          : String(answer);
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
        const selectedValues = new Set(getAnswerValues(answer));

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
    wrapperTarget.parentNode.insertBefore(wrapper, wrapperTarget);

    wrapper.append(button, answerStatus, wrapperTarget);

    log.info("Added answer button to question input", { questionId: id });
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

  function getAnswerValues(answer) {
    if (Array.isArray(answer)) {
      return answer.map(value => String(value));
    }

    return String(answer)
      .split("&")
      .map(value => value.trim());
  }

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
          answerStatus.hidden = addedElementsHidden;
          return;
        }

        button.hidden = addedElementsHidden;
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
      updateAnswerControls();

    } catch (error) {
      log.error("Failed to get answers", error);
    }
  }

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setAddedElementsVisibility(!addedElementsHidden);
    }
  });

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

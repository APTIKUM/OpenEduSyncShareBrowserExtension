(function () {
  const log = OpenEduLogger.createLogger("Content");

  window.addEventListener("openedu-problem-check", event => {
    chrome.runtime.sendMessage({
      type: "PROBLEM_CHECK_CORRECT",
      url: event.detail?.url,
      body: event.detail?.body
    }).catch(error => {
      log.error("Failed to notify background about problem_check", error);
    });
  });

  const questionGeneralIdPrefix = "problem_";
  const questionInputIdPrefixes = [
    "input_",
    "inputtype_",
    "formulaequationinput_"
  ];

  const questionGeneralSelector = `[id^="${questionGeneralIdPrefix}"]`;
  const questionInputSelector = questionInputIdPrefixes
    .map(prefix => `[id^="${prefix}"]`)
    .join(", ");
  const matchingTableSelector = "table";
  const legacyMatchingTableSelector =
    '[data-type="MatchingTableVueApp"]';

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

  function getQuestionInputId(questionInput) {
    const prefix = questionInputIdPrefixes.find(candidate =>
      questionInput.id.startsWith(candidate)
    );

    if (!prefix || questionInput.id.length <= prefix.length) {
      return null;
    }

    const questionId = questionInput.id.slice(prefix.length);

    return questionId.split("_").length === 3 ? questionId : null;
  }

  function isPreferredQuestionInput(questionInput) {
    return questionInput.id.startsWith("input_");
  }

  function findPreferredQuestionInput(questionId) {
    return Array.from(document.querySelectorAll(questionInputSelector))
      .find(questionInput =>
        isPreferredQuestionInput(questionInput) &&
        getQuestionInputId(questionInput) === questionId
      ) || null;
  }

  function removeAnswerButtonWrapper(questionInput) {
    const wrapper = Array.from(document.querySelectorAll(
      ".openedu-question-wrapper.input[data-question-input-id]"
    )).find(candidate =>
      candidate.dataset.questionInputId === questionInput.id
    );

    if (!wrapper) {
      return;
    }

    const wrapperTarget = wrapper.lastElementChild;

    if (wrapperTarget) {
      wrapper.replaceWith(wrapperTarget);
    } else {
      wrapper.remove();
    }

    questionInput.removeAttribute(markerAttribute);
  }

  function removeDuplicateAnswerButtons(questionInput, questionId) {
    const preferredInput = isPreferredQuestionInput(questionInput)
      ? questionInput
      : findPreferredQuestionInput(questionId);

    if (!preferredInput) {
      return;
    }

    document.querySelectorAll(
      ".openedu-question-wrapper.input[data-question-id]"
    ).forEach(wrapper => {
      if (
        wrapper.dataset.questionId === questionId &&
        wrapper.dataset.questionInputId !== preferredInput.id
      ) {
        const duplicateInput = document.getElementById(
          wrapper.dataset.questionInputId
        );

        if (duplicateInput) {
          removeAnswerButtonWrapper(duplicateInput);
        } else {
          wrapper.remove();
        }
      }
    });
  }

  function getAnswerInput(questionInput, questionId) {
    return findPreferredQuestionInput(questionId) || questionInput;
  }

  function findMatchingTable(questionInput) {
    const containingTable = questionInput.closest(matchingTableSelector);

    if (containingTable) {
      return containingTable;
    }

    return questionInput.closest(".problem")
      ?.querySelector(matchingTableSelector) || null;
  }

  function getMatchingTableTarget(matchingTable) {
    return matchingTable?.closest(legacyMatchingTableSelector) ||
      matchingTable;
  }

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
    const matchingTable = findMatchingTable(questionInput);
    const matchingTableTarget = getMatchingTableTarget(matchingTable);

    if (
      !isVisible(questionInput) &&
      matchingTableTarget &&
      isVisible(matchingTableTarget)
    ) {
      return matchingTableTarget;
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

        if (
          current.matches(matchingTableSelector) ||
          current.matches(legacyMatchingTableSelector)
        ) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return visibleAncestor || questionInput;
  }

  function findMatchingTableElement(matchingTable, elementId) {
    if (matchingTable.id === elementId) {
      return matchingTable;
    }

    const elements = Array.from(document.querySelectorAll("[id]"))
      .filter(element => element.id === elementId);
    const tables = Array.from(
      document.querySelectorAll(matchingTableSelector)
    );
    const tableIndex = tables.indexOf(matchingTable);

    if (tableIndex < 0) {
      return null;
    }

    const elementInTable = elements.find(element =>
      matchingTable.contains(element)
    );

    if (elementInTable) {
      return elementInTable;
    }

    return elements[tableIndex] || null;
  }

  function moveMatchingTableAnswerElements(
    answer,
    questionId,
    matchingTable
  ) {
    const matchingAnswer = answer?.answer;

    if (
      matchingAnswer == null ||
      typeof matchingAnswer !== "object" ||
      Array.isArray(matchingAnswer)
    ) {
      log.warn("Matching table answer has no movable answer object", {
        questionId,
        answer
      });
      return false;
    }

    if (!matchingTable) {
      log.warn("Matching table container not found; skipped element moves", {
        questionId
      });
      return false;
    }

    for (const [targetId, sourceIds] of Object.entries(matchingAnswer)) {
      const targetElement = findMatchingTableElement(matchingTable, targetId);

      if (!targetElement || !Array.isArray(sourceIds)) {
        log.warn("Matching table target or source IDs not found", {
          questionId,
          targetId
        });
        return false;
      }

      for (const sourceId of sourceIds) {
        const sourceElementId = String(sourceId);
        const sourceElement = findMatchingTableElement(
          matchingTable,
          sourceElementId
        );

        if (!sourceElement) {
          log.warn("Matching table source element not found", {
            questionId,
            targetId,
            sourceId: sourceElementId
          });
          return false;
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
          return false;
        }

        targetElement.append(sourceElement);
      }
    }

    return true;
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
    if (questionInput.hasAttribute(markerAttribute)) {
      return false;
    }

    const id = getQuestionInputId(questionInput);

    if (!id) {
      return false;
    }

    if (
      !isPreferredQuestionInput(questionInput) &&
      findPreferredQuestionInput(id)
    ) {
      removeAnswerButtonWrapper(questionInput);
      return false;
    }

    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    const answerStatus = document.createElement("span");
    const wrapperTarget = getAnswerButtonTarget(questionInput);
    const matchingTable = findMatchingTable(questionInput);
    const matchingTableTarget = wrapperTarget.matches(
      `${matchingTableSelector}, ${legacyMatchingTableSelector}`
    )
      ? wrapperTarget
      : matchingTable;

    wrapper.className = "openedu-question-wrapper input";
    wrapper.dataset.questionId = id;
    wrapper.dataset.questionInputId = questionInput.id;

    button.className = "openedu-load-answers-button";
    button.type = "button";
    button.hidden = true;
    button.textContent = "Загрузить ответ";
    button.setAttribute("aria-label", `Загрузить ответы для вопроса ${id}`);

    answerStatus.className = "openedu-answer-status";
    answerStatus.hidden = addedElementsHidden;

    button.addEventListener("click", () => {
      const answer = answers[id];
      answerStatus.classList.remove("openedu-answer-status-warning");
      const currentMatchingTable = findMatchingTable(questionInput);
      const currentMatchingTableTarget = currentMatchingTable || (
        matchingTableTarget?.isConnected ? matchingTableTarget : null
      );
      const isCurrentMatchingTableQuestion = Boolean(
        currentMatchingTableTarget
      );

      if (answer == null) {
        answerStatus.textContent = "Ответ не найден :(";
        log.warn("Answer not found", { questionId: id });
        return;
      }

      const isMatchingAnswer = answer?.answer &&
        typeof answer.answer === "object" &&
        !Array.isArray(answer.answer);

      if (isCurrentMatchingTableQuestion && isMatchingAnswer) {
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

        const answerField = getAnswerInput(questionInput, id);

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
        const updatedMatchingTable = wrapper.querySelector(
          matchingTableSelector
        ) || currentMatchingTableTarget;
        const elementsMoved = moveMatchingTableAnswerElements(
          answer,
          id,
          updatedMatchingTable
        );

        if (elementsMoved === false) {
          answerStatus.hidden = false;
          answerStatus.classList.add("openedu-answer-status-warning");
          answerStatus.textContent =
            'Не удалось визуализировать ответы. Попробуйте нажать кнопку "Отправить" — ответы должны появиться :)';
        } else {
          answerStatus.hidden = true;
        }
        return;
      }

      const answerInput = getAnswerInput(questionInput, id);
      const selectInput = answerInput.matches("select")
        ? answerInput
        : answerInput.querySelector("select");

      if (selectInput) {
        const selectedValues = new Set(
          Array.isArray(answer)
            ? answer.map(value => String(value))
            : [String(answer)]
        );
        const matchingOptions = Array.from(selectInput.options)
          .filter(option => selectedValues.has(option.value));

        if (matchingOptions.length === 0) {
          log.warn("Select answer option not found", {
            questionId: id,
            answer
          });
          return;
        }

        for (const option of selectInput.options) {
          option.selected = selectedValues.has(option.value);
        }

        answerStatus.textContent = "";
        selectInput.dispatchEvent(new Event("input", { bubbles: true }));
        selectInput.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      const textInput = answerInput.matches('input[type="text"], textarea')
        ? answerInput
        : answerInput.querySelector('input[type="text"], textarea');

      if (textInput) {
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
        if (!radioInput.checked) {
          radioInput.click();
        }
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
            input.click();
          }
        });

        answerStatus.textContent = "";
        return;
      }

      log.warn("Text, select, radio, or checkbox answer input not found", {
        questionId: id
      });
    });

    questionInput.setAttribute(markerAttribute, "true");
    wrapperTarget.parentNode.insertBefore(wrapper, wrapperTarget);

    wrapper.append(button, answerStatus, wrapperTarget);

    removeDuplicateAnswerButtons(questionInput, id);
    return true;
  }

  function processQuestions(root) {
    function processElement(element) {
      // if (element.matches(questionGeneralSelector)) {
      //   if (wrapQuestionGeneral(element)) processedProblems++;
      // }

      if (element.matches(questionInputSelector)) {
        AddAnswerButtonToQuestionInput(element);
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
  }

  function scanPage() {
    processQuestions(document);

    void requestAnswers();
  }

  scanPage();

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
          .map(getQuestionInputId)
          .filter(Boolean)
      )
    ];

    if (queries.length === 0) return;

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

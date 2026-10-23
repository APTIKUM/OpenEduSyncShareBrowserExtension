(function () {
  const requestSuffix = "problem_check";

  function isProblemCheckRequest(url) {
    try {
      return new URL(url, window.location.href).pathname.endsWith(
        requestSuffix
      );
    } catch {
      return false;
    }
  }

  function parseRequestBody(body) {
    if (typeof body !== "string" && !(body instanceof URLSearchParams)) {
      return body;
    }

    const parameters = new URLSearchParams(body);
    const parsedBody = {};

    for (const [rawKey, value] of parameters) {
      const isMultipleValue = rawKey.endsWith("[]");
      const keyWithoutArray = isMultipleValue
        ? rawKey.slice(0, -2)
        : rawKey;
      const key = keyWithoutArray.startsWith("input_")
        ? keyWithoutArray.slice("input_".length)
        : keyWithoutArray;
      let parsedValue = value;

      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep regular form values as strings.
      }

      if (isMultipleValue) {
        if (!Array.isArray(parsedBody[key])) {
          parsedBody[key] = [];
        }

        parsedBody[key].push(parsedValue);
      } else {
        parsedBody[key] = parsedValue;
      }
    }

    return parsedBody;
  }

  function getInputKey(name) {
    const key = name.endsWith("[]") ? name.slice(0, -2) : name;
    return key.startsWith("input_") ? key.slice("input_".length) : key;
  }

  function getCorrectChoice(input, documentFragment) {
    const label = Array.from(
      documentFragment.querySelectorAll("label")
    ).find(candidate => candidate.htmlFor === input.id);

    return label?.classList.contains("choicegroup_correct") === true;
  }

  function getWrongAnswers(input) {
    const container = input.closest(".capa_inputtype");
    const wrongAnswers = new Set();

    container?.querySelectorAll(".message").forEach(message => {
      try {
        const details = JSON.parse(message.textContent);

        if (Array.isArray(details.wrong_answers)) {
          details.wrong_answers.forEach(answer => {
            wrongAnswers.add(String(answer));
          });
        }
      } catch {
        // The message is not necessarily JSON.
      }
    });

    return wrongAnswers;
  }

  function removeWrongAnswers(answer, wrongAnswers) {
    if (
      answer == null ||
      typeof answer !== "object"
    ) {
      return answer;
    }

    if (Array.isArray(answer)) {
      return answer
        .filter(value => !wrongAnswers.has(String(value)))
        .map(value => removeWrongAnswers(value, wrongAnswers));
    }

    return Object.fromEntries(
      Object.entries(answer)
        .filter(([key]) => !wrongAnswers.has(key))
        .map(([key, value]) => [key, removeWrongAnswers(value, wrongAnswers)])
    );
  }

  function getCorrectRequestBody(responseBody, requestBody) {
    if (
      typeof responseBody?.contents !== "string" ||
      requestBody == null ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody)
    ) {
      return requestBody;
    }

    const documentFragment = new DOMParser().parseFromString(
      responseBody.contents,
      "text/html"
    );
    const correctBody = {};
    const choiceValues = new Map();

    documentFragment.querySelectorAll("input[name]").forEach(input => {
      const key = getInputKey(input.name);

      if (!Object.prototype.hasOwnProperty.call(requestBody, key)) {
        return;
      }

      if (input.type === "checkbox" || input.type === "radio") {
        if (!getCorrectChoice(input, documentFragment)) {
          return;
        }

        if (!choiceValues.has(key)) {
          choiceValues.set(key, []);
        }

        choiceValues.get(key).push(input.value);
        return;
      }

      if (input.type !== "text") {
        return;
      }

      const wrongAnswers = getWrongAnswers(input);
      const answer = requestBody[key];
      let parsedAnswer = answer;

      if (typeof answer === "string") {
        try {
          parsedAnswer = JSON.parse(answer);
        } catch {
          // Keep regular text answers as strings.
        }
      }

      const status = input.closest(".capa_inputtype")?.querySelector(".status");
      if (status?.classList.contains("incorrect")) {
        return;
      }

      correctBody[key] = removeWrongAnswers(parsedAnswer, wrongAnswers);
    });

    choiceValues.forEach((values, key) => {
      correctBody[key] = requestBody[key] instanceof Array
        ? values
        : values[0];
    });

    if (Object.prototype.hasOwnProperty.call(requestBody, "problem_id")) {
      correctBody.problem_id = requestBody.problem_id;
    }

    return correctBody;
  }

  function getAnswersToSave(responseBody, requestBody) {
    const currentScore = Number(responseBody?.current_score);
    const totalPossible = Number(responseBody?.total_possible);

    if (
      Number.isFinite(currentScore) &&
      Number.isFinite(totalPossible)
    ) {
      if (currentScore === totalPossible) {
        return requestBody;
      }

      if (currentScore <= 0 || currentScore >= totalPossible) {
        return null;
      }

      if (typeof responseBody?.contents !== "string") {
        return null;
      }
    } else if (typeof responseBody?.contents !== "string") {
      return null;
    }

    return getCorrectRequestBody(responseBody, requestBody);
  }

  function notifyIfCorrect(url, responseBody, requestBody) {
    const correctRequestBody = getAnswersToSave(responseBody, requestBody);
    const answerKeys = correctRequestBody &&
      Object.keys(correctRequestBody).filter(key => key !== "problem_id");

    if (!answerKeys || answerKeys.length === 0) {
      return;
    }

    window.dispatchEvent(new CustomEvent("openedu-problem-check", {
      detail: {
        url,
        body: correctRequestBody
      }
    }));
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const request = args[0];
    const options = args[1];
    const requestUrl = typeof request === "string"
      ? request
      : request?.url || String(request);
    let requestBody = options?.body;

    if (requestBody === undefined && request instanceof Request) {
      try {
        requestBody = await request.clone().text();
      } catch (error) {
        requestBody = `[Unable to read request body: ${error.message}]`;
      }
    }

    const parsedRequestBody = isProblemCheckRequest(requestUrl)
      ? parseRequestBody(requestBody)
      : undefined;

    const response = await originalFetch.apply(this, args);

    if (isProblemCheckRequest(response.url)) {
      try {
        const body = await response.clone().json();
        notifyIfCorrect(response.url, body, parsedRequestBody);
      } catch {
        // Ignore non-JSON responses from problem_check.
      }
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._openEduRequestUrl = url;
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const requestUrl = this._openEduRequestUrl || this.responseURL;
    const parsedRequestBody = isProblemCheckRequest(requestUrl)
      ? parseRequestBody(args[0])
      : undefined;

    this.addEventListener("load", function () {
      const responseUrl = this.responseURL || this._openEduRequestUrl;

      if (!isProblemCheckRequest(responseUrl)) {
        return;
      }

      try {
        notifyIfCorrect(
          responseUrl,
          JSON.parse(this.responseText),
          parsedRequestBody
        );
      } catch {
        // Ignore non-JSON responses from problem_check.
      }
    });

    return originalSend.apply(this, args);
  };
})();

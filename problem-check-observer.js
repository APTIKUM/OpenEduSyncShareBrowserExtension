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
        if (
          parsedValue &&
          typeof parsedValue === "object" &&
          !Array.isArray(parsedValue) &&
          Object.hasOwn(parsedValue, "answer")
        ) {
          parsedValue = parsedValue.answer;
        }
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

  function logRequestBody(url, body) {
    const parsedBody = parseRequestBody(body);

    console.info("[OpenEdu SyncShare] problem_check request body:", {
      url,
      body: parsedBody
    });

    return parsedBody;
  }

  function notifyIfCorrect(url, responseBody, requestBody) {
    if (responseBody?.success !== "correct") {
      return;
    }

    window.dispatchEvent(new CustomEvent("openedu-problem-check", {
      detail: {
        url,
        body: requestBody
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
      ? logRequestBody(requestUrl, requestBody)
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
      ? logRequestBody(requestUrl, args[0])
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

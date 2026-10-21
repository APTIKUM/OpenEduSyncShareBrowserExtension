(function () {
  const frameType = window.top === window ? "top" : "iframe";
  const logPrefix = "[OpenEdu SyncShare][" + frameType + "]";
  console.log(logPrefix, "Extension started", {
    url: window.location.href,
    frame: window.top === window ? "top" : "iframe"
  });

  const problemSelector = '[id^="problem_"]';
  const wrapperClass = "openedu-problem-wrapper";
  const markerAttribute = "data-openedu-problem-processed";

  function wrapProblem(problem) {
    if (
      problem.hasAttribute(markerAttribute) ||
      !problem.id.startsWith("problem_") ||
      problem.id.length <= "problem_".length
    ) {
      return false;
    }

    const wrapper = document.createElement("div");
    const problemIdPart = problem.id.slice("problem_".length);
    const label = document.createElement("span");

    wrapper.className = wrapperClass;
    wrapper.dataset.problemId = problemIdPart;
    label.className = "openedu-problem-label";
    label.textContent = problemIdPart;
    label.setAttribute("aria-label", "Problem ID");

    problem.setAttribute(markerAttribute, "true");
    problem.parentNode.insertBefore(wrapper, problem);
    wrapper.append(label, problem);
    console.log(logPrefix, "Problem highlighted:", {
      element: problem,
      id: problem.id,
      idPart: problemIdPart
    });
    return true;
  }

  function processProblems(root) {
    let processedCount = 0;

    if (root instanceof Element && root.matches(problemSelector)) {
      if (wrapProblem(root)) {
        processedCount += 1;
      }
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(problemSelector).forEach(function (problem) {
        if (wrapProblem(problem)) {
          processedCount += 1;
        }
      });
    }

    if (processedCount > 0) {
      console.log(logPrefix, "Processed problems:", processedCount);
    }
  }

  function scanPage(reason) {
    const problems = document.querySelectorAll(problemSelector);
    console.log(logPrefix, "Scanning page:", reason, {
      matches: problems.length,
      ids: Array.from(problems).map(function (element) {
        return element.id;
      })
    });
    processProblems(document);
  }

  scanPage("initial");

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processProblems(node);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

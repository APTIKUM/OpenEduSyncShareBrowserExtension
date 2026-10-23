# OpenEdu SyncShare

Chrome extension for [OpenEdu](https://openedu.ru/) that adds problem IDs to
the page and helps load previously saved answers.

For each question, the extension shows the part of its ID after `problem_` or
`input_` and adds a button for loading a saved answer. Answers are requested
from the local API at `https://localhost:7100/api/answers/query`.

The extension also monitors `problem_check` responses and sends answers to
`https://localhost:7100/api/answers/set`. When the response reports a full
score, the submitted answers are saved as correct. For partially correct
responses, correct answers are extracted from the returned data.

Press **Escape** to hide or show the IDs, answer buttons, and answer statuses.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open or refresh [openedu.ru](https://openedu.ru/).

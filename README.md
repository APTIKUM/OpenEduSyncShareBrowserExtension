# OpenEdu Problem Highlighter

A minimal Chrome extension that finds `div` elements whose IDs start with
`problem_` on [openedu.ru](https://apps.openedu.ru/).

Each matching element is wrapped in a subtle border. The part of its ID after
`problem_` is shown as a small label above the element.

The extension also monitors `problem_check` responses. When a response contains
`"success": "correct"`, it sends a GET request to the local API endpoint
`/api/healthcheck`.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open or refresh [openedu.ru](https://openedu.ru/).

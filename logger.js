(function (root, factory) {
  const logger = factory();
  root.OpenEduLogger = logger;
})(globalThis, function () {
  const PREFIX = "[OpenEdu SyncShare]";
  const DEBUG_ENABLED = true;

  function createLogger(moduleName) {
    const prefix = `${PREFIX}[${moduleName}]`;

    return {
      debug(...args) {
        if (DEBUG_ENABLED) console.debug(prefix, ...args);
      },
      info(...args) {
        console.info(prefix, ...args);
      },
      warn(...args) {
        console.warn(prefix, ...args);
      },
      error(...args) {
        console.error(prefix, ...args);
      }
    };
  }

  return { createLogger };
});

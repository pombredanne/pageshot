/** Error handling support

    This takes any unexpected exceptions and surfaces them as errors for
    the user.  This is described in error-handling.md

    Also includes helpers/wrappers to catch unexpected exceptions
    */
const panels = require("sdk/panel");
const self = require("sdk/self");

const panel = panels.Panel({
  contentURL: self.data.url("error-panel.html"),
  contentScriptFile: self.data.url("error-panel.js"),
  height: 200,
  width: 350
});

panel.port.on("close", function () {
  panel.hide();
});

/** Should be called when any unexpected error happens */
exports.unhandled = function (error) {
  // TODO: remove this circular dependency
  panel.show({position: require("./main").shootButton});
  panel.port.emit("showError", error);
};

/** Turns an exception object (likely Error) into what might be a kind of
    useful error message (as should be passed to unhandled) */
exports.makeError = function (error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      help: "An unexpected error occurred"
    };
  }
  return error;
};

/** Adds something to the promise to catch and display exceptions

    Use like:

        watchPromise(asyncFunction().then(function () {
          ... code ...
        }));

    This should catch a rejection of the promise, or an exception of
    the .then() handler.
    */
exports.watchPromise = function (promise) {
  return promise.catch(function (error) {
    let exc = exports.makeError(error);
    console.log("Promise rejected with error:", exc);
    exports.unhandled(exc);
    return error;
  });
};

/** Wrap the given function so any exceptions raised will end up going to
    unhandled().

    Also takes an optional context argument, just a convenience instead of
    calling `func.bind(context)` yourself.

    Also watches any promise returned by the function (FIXME: probably it
    shouldn't do this)
    */
exports.watchFunction = function (func, context) {
  if (context) {
    func = func.bind(context);
  }
  return function () {
    let result;
    try {
      result = func.apply(this, arguments);
    } catch (e) {
      console.error("Error in", func.name, ":", e+"");
      exports.unhandled(exports.makeError(e));
      throw e;
    }
    if (result && typeof result == "object" && result.then) {
      exports.watchPromise(result);
    }
    return result;
  };
};

/** Watches a worker.  This just means it listens for the `alertError` message
    on the worker's port. */
exports.watchWorker = function (worker) {
  worker.port.on("alertError", function (error) {
    console.log("Error from worker:", worker.url.replace(/.*\//, ""), ":", JSON.stringify(error));
    exports.unhandled(error);
  });
  // Workers also automatically emit an error message:
  worker.port.on("error", function (exc) {
    console.log("Uncaught error from worker:", worker.url.replace(/.*\//, ""), ":", exc+"");
    exports.unhandled(exports.makeError(exc));
  });
  return worker;
};

/** Immediately runs a function and catches any errors, an alternative
    to try/catch */
exports.watchRun = function (func, context) {
  try {
    func.run(context || this);
  } catch (e) {
    exports.unhandled(exports.makeError(e));
    throw e;
  }
};

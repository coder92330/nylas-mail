//
// NOTE: This file is manually copied over from the edgehill repo into N1. You
// must manually update both files. We can't use a sym-link because require
// paths don't work properly.
//

const raven = require('raven');

const app = (process.type === 'renderer') ? require('electron').remote.app : require('electron').app;

module.exports = (function (...args) {
  function ErrorReporter(modes) {
    this.reportError = this.reportError.bind(this)
    this.inSpecMode = modes.inSpecMode
    this.inDevMode = modes.inDevMode
    this.resourcePath = modes.resourcePath

    if (!this.inSpecMode) {
      this._setupSentry();
    }

    const bind = function (fn, me) { return function () { return fn.apply(me, ...args); }; };
    this.onDidLogAPIError = bind(this.onDidLogAPIError, this);
  }

  ErrorReporter.prototype.onDidLogAPIError = function (error, statusCode, message) {
  }

  ErrorReporter.prototype._setupSentry = function () {
    // Initialize the Sentry connector
    this.client = new raven.Client('https://7a32cb0189ff4595a55c98ffb7939c46:f791c3c402b343068bed056b8b504dd5@sentry.nylas.com/4');

    if (typeof NylasEnv !== 'undefined' && NylasEnv !== null && NylasEnv.config) {
      this.client.setUserContext({id: NylasEnv.config.get('nylas.identity.id')});
    }

    this.client.on('error', function (e) {
      console.log(e.reason);
      console.log(e.statusCode);
      return console.log(e.response);
    });
  }

  ErrorReporter.prototype.reportError = function (err, extra) {
    if (this.inSpecMode || this.inDevMode) { return }

    // It's possible for there to be more than 1 sentry capture object.
    // If an error comes from multiple plugins, we report a unique event
    // for each plugin since we want to group by individual pluginId
    const captureObjects = this._prepareSentryCaptureObjects(err, extra)
    for (let i = 0; i < captureObjects.length; i++) {
      this.client.captureError(err, captureObjects[i])
    }
  };

  ErrorReporter.prototype.getVersion = function () {
    if (typeof NylasEnv !== 'undefined' && NylasEnv) {
      return NylasEnv.getVersion();
    }
    if (typeof app !== 'undefined' && app) {
      return app.getVersion();
    }
    return null;
  };

  ErrorReporter.prototype._prepareSentryCaptureObjects = function (error, extra) {
    let captureObjects = this._prepareSentryCaptureObjects(error, extra)
    // Never send user auth tokens
    if (error.requestOptions && error.requestOptions.auth) {
      delete error.requestOptions.auth;
    }

    // Never send message bodies
    if (error.requestOptions && error.requestOptions.body && error.requestOptions.body.body) {
      delete error.requestOptions.body.body;
    }

    if (extra && extra.pluginIds && extra.pluginIds.length > 0) {
      captureObjects = [];
      for (let i = 0; i < extra.pluginIds.length; i++) {
        captureObjects.push({
          extra: extra,
          tags: {
            platform: process.platform,
            version: this.getVersion(),
            pluginId: extra.pluginIds[i],
          },
        });
      }
      return captureObjects
    }
    return [{
      extra: extra,
      tags: {
        platform: process.platform,
        version: this.getVersion(),
      },
    }]
  }

  return ErrorReporter;
})();

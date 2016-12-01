/* eslint global-require: 0 */

import _ from 'underscore'
import {remote} from 'electron'
import NylasLongConnection from './nylas-long-connection'
import NylasAPIRequest from './nylas-api-request'
import Account from './models/account'
import Message from './models/message'
import Actions from './actions'
import DatabaseStore from './stores/database-store'

// A 0 code is when an error returns without a status code, like "ESOCKETTIMEDOUT"
const TimeoutErrorCodes = [0, "ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET", "ENETDOWN", "ENETUNREACH"]
const PermanentErrorCodes = [400, 401, 402, 403, 404, 405, 429, 500, "ENOTFOUND", "ECONNREFUSED", "EHOSTDOWN", "EHOSTUNREACH"]
const CancelledErrorCode = [-123, "ECONNABORTED"]
const SampleTemporaryErrorCode = 504

// Lazy-loaded
let AccountStore = null


class NylasAPIChangeLockTracker {
  constructor() {
    this._locks = {}
  }

  acceptRemoteChangesTo(klass, id) {
    const key = `${klass.name}-${id}`
    return this._locks[key] === undefined
  }

  increment(klass, id) {
    const key = `${klass.name}-${id}`
    this._locks[key] = this._locks[key] || 0
    this._locks[key] += 1
  }

  decrement(klass, id) {
    const key = `${klass.name}-${id}`
    if (!this._locks[key]) return
    this._locks[key] -= 1
    if (this._locks[key] <= 0) {
      delete this._locks[key]
    }
  }

  print() {
    console.log("The following models are locked:")
    console.log(this._locks)
  }
}


class NylasAPI {

  constructor() {
    this._lockTracker = new NylasAPIChangeLockTracker()
    this.APIRoot = "http://localhost:2578"

    this._apiObjectToClassMap = {
      file: require('./models/file').default,
      event: require('./models/event').default,
      label: require('./models/label').default,
      folder: require('./models/folder').default,
      thread: require('./models/thread').default,
      draft: require('./models/message').default,
      account: require('./models/account').default,
      message: require('./models/message').default,
      contact: require('./models/contact').default,
      calendar: require('./models/calendar').default,
    }

    this.TimeoutErrorCodes = TimeoutErrorCodes
    this.PermanentErrorCodes = PermanentErrorCodes
    this.CancelledErrorCode = CancelledErrorCode
    this.SampleTemporaryErrorCode = SampleTemporaryErrorCode
    this.LongConnectionStatus = NylasLongConnection.Status
  }

  longConnection = (opts) => {
    const connection = new NylasLongConnection(this, opts.accountId, opts)
    connection.onResults(opts.onResults)
    return connection
  }

  startLongConnection = (opts) => {
    this.longConnection(opts).start()
  }

  /*
  If we make a request that `returnsModel` and we get a 404, we want to handle
  it intelligently and in a centralized way. This method identifies the object
  that could not be found and purges it from local cache.

  Handles: /account/<nid>/<collection>/<id>
  */
  handleModel404 = (modelUrl) => {
    const url = require('url')
    const {pathname} = url.parse(modelUrl, true)
    const components = pathname.split('/')

    let collection = null
    let klassId = null
    let klass = null
    if (components.length === 3) {
      collection = components[1]
      klassId = components[2]
      klass = this._apiObjectToClassMap[collection.slice(0, -1)] // Warning: threads => thread
    }

    if (klass && klassId && klassId.length > 0) {
      if (!NylasEnv.inSpecMode()) {
        console.warn(`Deleting ${klass.name}:${klassId} due to API 404`)
      }

      DatabaseStore.inTransaction((t) =>
        t.find(klass, klassId).then((model) => {
          if (model) {
            return t.unpersistModel(model)
          }
          return Promise.resolve()
        })
      )
    }
    return Promise.resolve()
  }

  handleAuthenticationFailure = (modelUrl, apiToken, apiName) => {
    // Prevent /auth errors from presenting auth failure notices
    if (!apiToken) return Promise.resolve()

    AccountStore = AccountStore || require('./stores/account-store')
    const account = AccountStore.accounts().find((acc) => {
      const localMatch = AccountStore.tokensForAccountId(acc.id).localSync === apiToken;
      const cloudMatch = AccountStore.tokensForAccountId(acc.id).n1Cloud === apiToken;
      return localMatch || cloudMatch;
    })

    if (account) {
      let syncState = Account.SYNC_STATE_AUTH_FAILED
      if (apiName === "N1CloudAPI") {
        syncState = Account.N1_CLOUD_AUTH_FAILED
      }
      Actions.updateAccount(account.id, {syncState})
    }
    return Promise.resolve()
  }

  /*
   Returns a Promise that resolves when any parsed out models (if any)
   have been created and persisted to the database.
  */
  _handleModelResponse = (jsons) => {
    if (!jsons) {
      return Promise.reject(new Error("handleModelResponse with no JSON provided"))
    }

    let response = jsons
    if (!(response instanceof Array)) {
      response = [response]
    }
    if (response.length === 0) {
      return Promise.resolve([])
    }

    const type = response[0].object
    const Klass = this._apiObjectToClassMap[type]
    if (!Klass) {
      console.warn(`NylasAPI::handleModelResponse: Received unknown API object type: ${type}`)
      return Promise.resolve([])
    }

    // Step 1: Make sure the list of objects contains no duplicates, which cause
    // problems downstream when we try to write to the database.
    const uniquedJSONs = _.uniq(response, false, (model) => { return model.id })
    if (uniquedJSONs.length < response.length) {
      console.warn("NylasAPI::handleModelResponse: called with non-unique object set. Maybe an API request returned the same object more than once?")
    }

    // Step 2: Filter out any objects we've locked (usually because we successfully
    // deleted them moments ago).
    const unlockedJSONs = _.filter(uniquedJSONs, (json) => {
      if (this._lockTracker.acceptRemoteChangesTo(Klass, json.id) === false) {
        if (json && json._delta) {
          json._delta.ignoredBecause = "Model is locked, possibly because it's already been deleted."
        }
        return false
      }
      return true
    })

    if (unlockedJSONs.length === 0) {
      return Promise.resolve([])
    }

    // Step 3: Retrieve any existing models from the database for the given IDs.
    const ids = _.pluck(unlockedJSONs, 'id')
    return DatabaseStore.findAll(Klass)
    .where(Klass.attributes.id.in(ids))
    .then((models) => {
      const existingModels = {}
      for (const model of models) {
        existingModels[model.id] = model
      }

      const responseModels = []
      const changedModels = []

      // Step 4: Merge the response data into the existing data for each model,
      // skipping changes when we already have the given version
      unlockedJSONs.forEach((json) => {
        let model = existingModels[json.id]

        const isSameOrNewerVersion = model && model.version && json.version && model.version >= json.version
        const isAlreadySent = model && model.draft === false && json.draft === true

        if (isSameOrNewerVersion) {
          if (json && json._delta) {
            json._delta.ignoredBecause = `JSON v${json.version} <= model v${model.version}`
          }
        } else if (isAlreadySent) {
          if (json && json._delta) {
            json._delta.ignoredBecause = `Model ${model.id} is already sent!`
          }
        } else {
          model = model || new Klass()
          model.fromJSON(json)
          changedModels.push(model)
        }
        responseModels.push(model)
      })

      // Step 5: Save models that have changed, and then return all of the models
      // that were in the response body.
      DatabaseStore.inTransaction((t) =>
        t.persistModels(changedModels)
      )
      .then(() => {
        return Promise.resolve(responseModels)
      })
    })
  }

  _attachMetadataToResponse = (jsons, metadataToAttach) => {
    if (!metadataToAttach) return
    for (const obj of jsons) {
      if (metadataToAttach[obj.id]) {
        obj.metadata = metadataToAttach[obj.id]
      }
    }
  }

  getThreads = (accountId, params = {}, requestOptions = {}) => {
    const requestSuccess = requestOptions.success
    requestOptions.success = (json) => {
      let messages = []
      for (const result of json) {
        if (result.messages) {
          messages = messages.concat(result.messages)
        }
      }
      if (messages.length > 0) {
        this._attachMetadataToResponse(messages, requestOptions.metadataToAttach)
        this._handleModelResponse(messages)
      }
      if (requestSuccess) {
        requestSuccess(json)
      }
    }

    this.getCollection(accountId, 'threads', params, requestOptions)
  }

  getCollection = (accountId, collection, params = {}, requestOptions = {}) => {
    if (!accountId) {
      throw (new Error("getCollection requires accountId"))
    }
    const requestSuccess = requestOptions.success
    new NylasAPIRequest({
      api: this,
      options: _.extend(requestOptions, {
        path: `/${collection}`,
        accountId: accountId,
        qs: params,
        returnsModel: false,
        success: (jsons) => {
          this._attachMetadataToResponse(jsons, requestOptions.metadataToAttach)
          this._handleModelResponse(jsons)
          if (requestSuccess) {
            requestSuccess(jsons)
          }
        },
      }),
    }).run()
  }

  makeDraftDeletionRequest = (draft) => {
    if (!draft.serverId) return
    this.incrementRemoteChangeLock(Message, draft.serverId)
    new NylasAPIRequest({
      api: this,
      options: {
        path: `/drafts/${draft.serverId}`,
        accountId: draft.accountId,
        method: "DELETE",
        body: {version: draft.version},
        returnsModel: false,
      },
    }).run()
    return
  }

  incrementRemoteChangeLock = (klass, id) => {
    this._lockTracker.increment(klass, id)
  }

  decrementRemoteChangeLock = (klass, id) => {
    this._lockTracker.decrement(klass, id)
  }

  accessTokenForAccountId = (aid) => {
    AccountStore = AccountStore || require('./stores/account-store')
    return AccountStore.tokensForAccountId(aid).localSync
  }

  /*
  IMPORTANT: In order to auth a plugin, you must have first:

  1. Have an application registered on developer.nylas.com
  2. Have someone on the Nylas platform team mark that application as a
     "plugin" by flipping a bit on Redwood.
  3. Have that application's API ID and API Secret registered in the
     edgehill-sever config (etc/config.yaml and the corresponding prod
     ansible setup) under APP_IDS and APP_SECRETS respectfully. The key
     you use is the `appName`
  4. On developer.nylas.com, you must create a callback url that points
     to: https://edgehill.nylas.com/plugins/auth/<appName> where
     `appName` is the heading used in the edgehill-server deploy config.

  This method Returns a promise that will resolve if the user is
  successfully authed to the plugin backend, and will reject if the auth
  fails for any reason.

  Inside the promise, we:

  1. Ask the API whether this plugin is authed to this account already,
     and resolve if true.
  2. If not, we display a dialog to the user asking whether to auth this
     plugin.
  3. If the user says yes to the dialog, then we send an auth request to
     the API to auth this plugin.

  The returned promise will reject on the failure of any of these 3
  steps, namely:

  1. The API request to check that the account is authed failed. This
     may mean that the plugin's Nylas Application is invalid, or that the
     Nylas API couldn't be reached.
  2. The user declined the plugin auth prompt.
  3. The API request to auth this account to the plugin failed. This may
     mean that the plugin server couldn't be reached or failed to respond
     properly when authing the account, or that the Nylas API couldn't be
     reached.
  */
  authPlugin = (pluginId, pluginName, accountOrId) => {
    if (!this.pluginsSupported) {
      return Promise.reject(new Error('Sorry, this feature is only available when N1 is running against the hosted version of the Nylas Sync Engine.'))
    }

    let account = accountOrId
    if (!(accountOrId instanceof Account)) {
      AccountStore = AccountStore || require('./stores/account-store')
      account = AccountStore.accountForId(accountOrId)
    }

    if (!account) {
      return Promise.reject(new Error('Invalid account'))
    }

    const cacheKey = `plugins.${pluginId}.lastAuth.${account.id}`
    if (NylasEnv.config.get(cacheKey)) {
      return Promise.resolve()
    }

    return new NylasAPIRequest({
      api: this,
      options: {
        returnsModel: false,
        method: "GET",
        accountId: account.id,
        path: `/auth/plugin?client_id=${pluginId}`,
      },
    }).run().then((result) => {
      if (result.authed) {
        NylasEnv.config.set(cacheKey, Date.now())
        return Promise.resolve()
      }

      // NOTE: Uncomment this line if we want to prompt the users to
      // explicitly allow permission for each of these plugins:
      // return @_requestPluginAuth(pluginName, account).then =>

      return new NylasAPIRequest({
        api: this,
        options: {
          returnsModel: false,
          method: "POST",
          accountId: account.id,
          path: "/auth/plugin",
          body: {client_id: pluginId},
          json: true,
        },
      }).run().then(() => {
        NylasEnv.config.set(cacheKey, Date.now())
        return Promise.resolve()
      })
    })
  }

  _requestPluginAuth = (pluginName, account) => {
    return new Promise((resolve, reject) => {
      remote.dialog.showMessageBox({
        title: "Plugin Offline Email Access",
        message: `The N1 plugin ${pluginName} requests offline access to your email.`,
        detail: `The ${pluginName} plugin would like to be able to access your email account ${account.emailAddress} while you are offline. Only grant offline access to plugins you trust. You can review and revoke Offline Access for plugins at any time from Preferences > Plugins.`,
        buttons: ["Grant access", "Cancel"],
        type: 'info',
      }, (result) => {
        if (result === 0) {
          resolve()
        } else {
          reject()
        }
      })
    })
  }

  unauthPlugin = (pluginId, accountId) => {
    return new NylasAPIRequest({
      api: this,
      options: {
        returnsModel: false,
        method: "DELETE",
        accountId: accountId,
        path: `/auth/plugin?client_id=${pluginId}`,
      },
    }).run()
  }
}

export default new NylasAPI()

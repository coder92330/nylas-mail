Reflux = require "reflux"
Actions = require "../actions"
Message = require "../models/message"
DatabaseStore = require "./database-store"
NamespaceStore = require "./namespace-store"
async = require 'async'
_ = require 'underscore-plus'

MessageStore = Reflux.createStore
  init: ->
    @_setStoreDefaults()
    @_registerListeners()


  ########### PUBLIC #####################################################

  items: -> @_items
  itemLocalIds: -> @_itemsLocalIds

  ########### PRIVATE ####################################################

  _setStoreDefaults: ->
    @_items = []
    @_itemsLocalIds = {}
    @_threadId = null

  _registerListeners: ->
    @listenTo DatabaseStore, @_onDataChanged
    @listenTo Actions.selectThreadId, @_onSelectThreadId

  _onDataChanged: (change) ->
    return unless change.objectClass == Message.name
    return unless @_threadId
    inDisplayedThread = _.some change.objects, (obj) =>
      obj.threadId == @_threadId
    return unless inDisplayedThread
    @_fetchFromCache()

  _onSelectThreadId: (threadId) ->
    return if @_threadId == threadId

    @_threadId = threadId
    @_items = []
    @trigger(@)

    # Fetch messages from cache. Fetch a few now,
    # and debounce loading all of them
    @_fetchFromCache({preview: true})
    @_fetchFromCacheDebounced()

    # Fetch messages from API, only if the user
    # sits on this message for a moment
    @_fetchFromAPIDebounced()

  _fetchFromCache: (options = {}) ->
    loadedThreadId = @_threadId

    query = DatabaseStore.findAll(Message, threadId: loadedThreadId)
    query.limit(2) if options.preview
    query.then (items) =>
      localIds = {}
      async.each items, (item, callback) ->
        return callback() unless item.draft
        DatabaseStore.localIdForModel(item).then (localId) ->
          localIds[item.id] = localId
          callback()
      , =>
        # Check to make sure that our thread is still the thread we were
        # loading items for. Necessary because this takes a while.
        return unless loadedThreadId == @_threadId
        @_items = items
        @_itemsLocalIds = localIds
        @trigger(@)

  _fetchFromCacheDebounced: _.debounce ->
    @_fetchFromCache()
  , 100

  _fetchFromAPIDebounced: _.debounce ->
    return unless @_threadId?
    # Fetch messages from API, which triggers an update to the database,
    # which results in DatabaseStore triggering and us repopulating. No need
    # to listen for a callback or promise!
    namespace = NamespaceStore.current()
    atom.inbox.getCollection(namespace.id, 'messages', {thread_id: @_threadId}) if namespace
    atom.inbox.getCollection(namespace.id, 'drafts', {thread_id: @_threadId}) if namespace
  , 350

module.exports = MessageStore

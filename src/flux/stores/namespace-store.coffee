Actions = require '../actions'
Namespace = require '../models/namespace'
DatabaseStore = require './database-store'
_ = require 'underscore-plus'

{Listener, Publisher} = require '../modules/reflux-coffee'
CoffeeHelpers = require '../coffee-helpers'

###
Public: The NamespaceStore listens to changes to the available namespaces in
the database and exposes the currently active Namespace via {::current}
###
class NamespaceStore
  @include: CoffeeHelpers.includeModule

  @include Publisher
  @include Listener

  constructor: ->
    @_items = []
    @_current = null

    @listenTo Actions.selectNamespaceId, @onSelectNamespaceId
    @listenTo DatabaseStore, @onDataChanged
    @populateItems()

  populateItems: =>
    DatabaseStore.findAll(Namespace).then (namespaces) =>
      current = _.find namespaces, (n) -> n.id == @_current?.id
      current = namespaces?[0] unless current

      if current isnt @_current or not _.isEqual(namespaces, @_namespaces)
        @_current = current
        @_namespaces = namespaces
        @trigger(@)

  # Inbound Events

  onDataChanged: (change) =>
    return unless change && change.objectClass == Namespace.name
    @populateItems()

  onSelectNamespaceId: (id) =>
    return if @_current?.id is id
    @_current = _.find @_namespaces, (n) -> n.id == @_current.id
    @trigger(@)

  # Exposed Data

  # Public: Returns an {Array} of {Namespace} objects
  items: =>
    @_namespaces

  # Public: Returns the currently active {Namespace}.
  current: =>
    @_current

module.exports = new NamespaceStore()

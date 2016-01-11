_ = require 'underscore'
NylasStore = require 'nylas-store'
WorkspaceStore = require './workspace-store'
AccountStore = require './account-store'
Account = require '../models/account'
MailboxPerspective = require '../../mailbox-perspective'
CategoryStore = require './category-store'
Actions = require '../actions'

class FocusedPerspectiveStore extends NylasStore
  constructor: ->
    @listenTo CategoryStore, @_onCategoryStoreChanged
    @listenTo AccountStore, @_onAccountStoreChanged

    @listenTo Actions.focusMailboxPerspective, @_onFocusMailView
    @listenTo Actions.focusDefaultMailboxPerspectiveForAccount, @_onFocusAccount
    @listenTo Actions.searchQueryCommitted, @_onSearchQueryCommitted

    @_onCategoryStoreChanged()
    @_setupFastAccountCommands()
    @_setupFastAccountMenu()

  # Inbound Events

  _onAccountStoreChanged: ->
    @_setupFastAccountMenu()

  _onCategoryStoreChanged: ->
    if not @_current
      @_setPerspective(@_defaultPerspective())
    else
      account = @_current.account
      catId   = @_current.categoryId()
      if catId and not CategoryStore.byId(account, catId)
        @_setPerspective(@_defaultPerspective())

  _onFocusMailView: (filter) =>
    return if filter.isEqual(@_current)
    if WorkspaceStore.Sheet.Threads
      Actions.selectRootSheet(WorkspaceStore.Sheet.Threads)
    Actions.searchQueryCommitted('')
    @_setPerspective(filter)

  _onFocusAccount: (accountId) =>
    account = AccountStore.accountForId(accountId) unless account instanceof Account
    return unless account
    category = CategoryStore.getStandardCategory(account, "inbox")
    return unless category
    @_setPerspective(MailboxPerspective.forCategory(account, category))

  _onSearchQueryCommitted: (query="", account) ->
    if typeof(query) != "string"
      query = query[0].all

    if query.trim().length > 0
      @_currentBeforeSearch ?= @_current
      @_setPerspective(MailboxPerspective.forSearch(account, query))
    else if query.trim().length is 0
      @_currentBeforeSearch ?= @_defaultPerspective()
      @_setPerspective(@_currentBeforeSearch)
      @_currentBeforeSearch = null

  # TODO Update unified MailboxPerspective
  _defaultPerspective: (account = AccountStore.accounts()[0])->
    category = CategoryStore.getStandardCategory(account, "inbox")
    return null unless category
    return MailboxPerspective.forCategory(account, category)
    # MailboxPerspective.unified()

  _setPerspective: (filter) ->
    return if filter?.isEqual(@_current)
    @_current = filter
    @trigger()

  _setupFastAccountCommands: ->
    commands = {}
    [0..8].forEach (index) =>
      key = "application:select-account-#{index}"
      commands[key] = => @_onFocusAccount(AccountStore.accounts()[index])
    NylasEnv.commands.add('body', commands)

  _setupFastAccountMenu: ->
    windowMenu = _.find NylasEnv.menu.template, ({label}) -> MenuHelpers.normalizeLabel(label) is 'Window'
    return unless windowMenu
    submenu = _.reject windowMenu.submenu, (item) -> item.account
    return unless submenu
    idx = _.findIndex submenu, ({type}) -> type is 'separator'
    return unless idx > 0

    accountMenuItems = AccountStore.accounts().map (item, idx) =>
      {
        label: item.emailAddress,
        command: "application:select-account-#{idx}",
        account: true
      }

    submenu.splice(idx + 1, 0, accountMenuItems...)
    windowMenu.submenu = submenu
    NylasEnv.menu.update()

  # Public Methods

  current: -> @_current ? null

module.exports = new FocusedPerspectiveStore()

_ = require 'underscore-plus'
React = require 'react'
{Actions, Utils, FocusedContentStore, WorkspaceStore} = require 'inbox-exports'
{RetinaImg} = require 'ui-components'

# Note: These always have a thread, but only sometimes get a
# message, depending on where in the UI they are being displayed.

ReplyButton = React.createClass
  render: ->
    <button className="btn btn-toolbar"
            data-tooltip="Reply"
            onClick={@_onReply}>
      <RetinaImg name="toolbar-reply.png" />
    </button>

  _onReply: (e) ->
    return unless Utils.nodeIsVisible(e.currentTarget)
    Actions.composeReply(threadId: FocusedContentStore.focusedId('thread'))
    e.stopPropagation()

ReplyAllButton = React.createClass
  render: ->
    <button className="btn btn-toolbar"
            data-tooltip="Reply All"
            onClick={@_onReplyAll}>
      <RetinaImg name="toolbar-reply-all.png" />
    </button>

  _onReplyAll: (e) ->
    return unless Utils.nodeIsVisible(e.currentTarget)
    Actions.composeReplyAll(threadId: FocusedContentStore.focusedId('thread'))
    e.stopPropagation()

ForwardButton = React.createClass
  render: ->
    <button className="btn btn-toolbar"
            data-tooltip="Forward"
            onClick={@_onForward}>
      <RetinaImg name="toolbar-forward.png" />
    </button>

  _onForward: (e) ->
    return unless Utils.nodeIsVisible(e.currentTarget)
    Actions.composeForward(threadId: FocusedContentStore.focusedId('thread'))
    e.stopPropagation()

ArchiveButton = React.createClass
  render: ->
    <button className="btn btn-toolbar btn-archive"
            data-tooltip="Archive"
            onClick={@_onArchive}>
      <RetinaImg name="toolbar-archive.png" />
    </button>

  _onArchive: (e) ->
    return unless Utils.nodeIsVisible(e.currentTarget)
    if WorkspaceStore.selectedLayoutMode() is "list"
      Actions.archiveCurrentThread()
    else if WorkspaceStore.selectedLayoutMode() is "split"
      Actions.archiveAndNext()
    e.stopPropagation()


module.exports =
MessageToolbarItems = React.createClass
  getInitialState: ->
    threadIsSelected: FocusedContentStore.focusedId('thread')?

  render: ->
    classes = React.addons.classSet
      "message-toolbar-items": true
      "hidden": !@state.threadIsSelected

    <div className={classes}>
      <ArchiveButton ref="archiveButton" />
    </div>

  componentDidMount: ->
    @_unsubscribers = []
    @_unsubscribers.push FocusedContentStore.listen @_onChange

  componentWillUnmount: ->
    unsubscribe() for unsubscribe in @_unsubscribers

  _onChange: -> _.defer =>
    return unless @isMounted()
    @setState
      threadIsSelected: FocusedContentStore.focusedId('thread')?

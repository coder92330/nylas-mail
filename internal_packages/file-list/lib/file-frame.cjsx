React = require 'react'
_ = require "underscore-plus"
{Utils, FileDownloadStore, Actions} = require 'inbox-exports'
{Spinner, EventedIFrame} = require 'ui-components'
FileFrameStore = require './file-frame-store'

module.exports =
FileFrame = React.createClass
  displayName: 'FileFrame'

  render: ->
    src = if @state.ready then @state.filepath else ''
    if @state.file
      <div className="file-frame-container">
        <EventedIFrame src={src} />
        <Spinner visible={!@state.ready} />
      </div>
    else
      <div></div>

  getInitialState: ->
    @getStateFromStores()

  componentDidMount: ->
    @_unsubscribers = []
    @_unsubscribers.push FileFrameStore.listen @_onChange

  componentWillUnmount: ->
    unsubscribe() for unsubscribe in @_unsubscribers

  getStateFromStores: ->
    file: FileFrameStore.file()
    filepath: FileDownloadStore.pathForFile(FileFrameStore.file())
    ready: FileFrameStore.ready()

  _onChange: ->
    @setState(@getStateFromStores())

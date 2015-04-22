React = require 'react'
_ = require 'underscore-plus'
EmailFrame = require './email-frame'
MessageParticipants = require "./message-participants"
MessageTimestamp = require "./message-timestamp"
{Utils,
 Actions,
 MessageUtils,
 ComponentRegistry,
 FileDownloadStore} = require 'inbox-exports'
{RetinaImg,  RegisteredRegion} = require 'ui-components'
Autolinker = require 'autolinker'

TransparentPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNikAQAACIAHF/uBd8AAAAASUVORK5CYII="
MessageBodyWidth = 740

module.exports =
MessageItem = React.createClass
  displayName: 'MessageItem'

  propTypes:
    thread: React.PropTypes.object.isRequired
    message: React.PropTypes.object.isRequired
    thread_participants: React.PropTypes.arrayOf(React.PropTypes.object)
    collapsed: React.PropTypes.bool

  mixins: [ComponentRegistry.Mixin]
  components: ['AttachmentComponent']

  getInitialState: ->
    # Holds the downloadData (if any) for all of our files. It's a hash
    # keyed by a fileId. The value is the downloadData.
    downloads: FileDownloadStore.downloadsForFileIds(@props.message.fileIds())
    showQuotedText: @_isForwardedMessage()
    detailedHeaders: false

  componentDidMount: ->
    @_storeUnlisten = FileDownloadStore.listen(@_onDownloadStoreChange)

  componentWillUnmount: ->
    @_storeUnlisten() if @_storeUnlisten

  shouldComponentUpdate: (nextProps, nextState) ->
    not Utils.isEqualReact(nextProps, @props) or
    not Utils.isEqualReact(nextState, @state)

  render: ->
    if @props.collapsed
      @_renderCollapsed()
    else
      @_renderFull()

  _renderCollapsed: ->
    <div className={@props.className} onClick={@_toggleCollapsed}>
      <div className="message-item-area">
        <div className="collapsed-from">
          {@props.message.from?[0]?.displayFirstName()}
        </div>
        <div className="collapsed-snippet">
          {@props.message.snippet}
        </div>
        <div className="collapsed-timestamp">
          <MessageTimestamp date={@props.message.date} />
        </div>
      </div>
    </div>

  _renderFull: ->
    <div className={@props.className}>
      <div className="message-item-area">
        {@_renderHeader()}
        {@_renderAttachments()}
        <EmailFrame showQuotedText={@state.showQuotedText}>
          {@_formatBody()}
        </EmailFrame>
        <a className={@_quotedTextClasses()} onClick={@_toggleQuotedText}></a>
      </div>
    </div>

  _renderHeader: ->
    <header className="message-header">

      <div className="message-header-right">
        <MessageTimestamp className="message-time selectable"
                          isDetailed={@state.detailedHeaders}
                          date={@props.message.date} />

        <RegisteredRegion className="message-indicator"
                          location="MessageIndicator"
                          message={@props.message}/>

        {if @state.detailedHeaders then @_renderMessageActionsInline() else @_renderMessageActionsTooltip()}
      </div>

      <MessageParticipants to={@props.message.to}
                           cc={@props.message.cc}
                           bcc={@props.message.bcc}
                           from={@props.message.from}
                           subject={@props.message.subject}
                           onClick={=> @setState detailedHeaders: true}
                           thread_participants={@props.thread_participants}
                           isDetailed={@state.detailedHeaders}
                           message_participants={@props.message.participants()} />

      {@_renderCollapseControl()}

    </header>

  _renderAttachments: ->
    attachments = @_attachmentComponents()
    if attachments.length > 0
      <div className="attachments-area">{attachments}</div>
    else
      <div></div>

  _quotedTextClasses: -> React.addons.classSet
    "quoted-text-control": true
    'no-quoted-text': (Utils.quotedTextIndex(@props.message.body) is -1)
    'show-quoted-text': @state.showQuotedText

  _renderMessageActionsInline: ->
    @_renderMessageActions()

  _renderMessageActionsTooltip: ->
    return <span></span>
    ## TODO: For now leave blank. There may be an alternative UI in the
    #future.
    # <span className="msg-actions-tooltip"
    #       onClick={=> @setState detailedHeaders: true}>
    #   <RetinaImg name={"message-show-more.png"}/></span>

  _renderMessageActions: ->
    <div className="message-actions-wrap">
      <div className="message-actions-ellipsis" onClick={@_onShowActionsMenu}>
        <RetinaImg name={"message-actions-ellipsis.png"}/>
      </div>
      <RegisteredRegion className="message-actions"
                        location="MessageAction"
                        thread={@props.thread}
                        message={@props.message}>
        <button className="btn btn-icon" onClick={@_onReply}>
          <RetinaImg name={"message-reply.png"}/>
        </button>
        <button className="btn btn-icon" onClick={@_onReplyAll}>
          <RetinaImg name={"message-reply-all.png"}/>
        </button>
        <button className="btn btn-icon" onClick={@_onForward}>
          <RetinaImg name={"message-forward.png"}/>
        </button>
      </RegisteredRegion>
    </div>

  _onReply: ->
    tId = @props.thread.id; mId = @props.message.id
    Actions.composeReply(threadId: tId, messageId: mId) if (tId and mId)

  _onReplyAll: ->
    tId = @props.thread.id; mId = @props.message.id
    Actions.composeReplyAll(threadId: tId, messageId: mId) if (tId and mId)

  _onForward: ->
    tId = @props.thread.id; mId = @props.message.id
    Actions.composeForward(threadId: tId, messageId: mId) if (tId and mId)
 
  _onReport: (issueType) ->
    {Contact, Message, DatabaseStore, NamespaceStore} = require 'inbox-exports'

    draft = new Message
      from: [NamespaceStore.current().me()]
      to: [new Contact(name: "Nilas Team", email: "feedback@nilas.com")]
      date: (new Date)
      draft: true
      subject: "Feedback - Message Display Issue (#{issueType})"
      namespaceId: NamespaceStore.current().id
      body: @props.message.body

    DatabaseStore.persistModel(draft).then ->
      DatabaseStore.localIdForModel(draft).then (localId) ->
        Actions.sendDraft(localId)

        remote = require('remote')
        dialog = remote.require('dialog')
        dialog.showMessageBox remote.getCurrentWindow(), {
          type: 'warning'
          buttons: ['OK'],
          message: "Thank you."
          detail: "The contents of this message have been sent to the Edgehill team and we added to a test suite."
        }

  _onShowActionsMenu: ->
    remote = require('remote')
    Menu = remote.require('menu')
    MenuItem = remote.require('menu-item')

    # Todo: refactor this so that message actions are provided
    # dynamically. Waiting to see if this will be used often.
    menu = new Menu()
    menu.append(new MenuItem({ label: 'Report Issue: Quoted Text', click: => @_onReport('Quoted Text')}))
    menu.append(new MenuItem({ label: 'Report Issue: Rendering', click: => @_onReport('Rendering')}))
    menu.popup(remote.getCurrentWindow())

  _renderCollapseControl: ->
    if @state.detailedHeaders
      <div className="collapse-control"
           style={top: "4px", left: "-17px"}
           onClick={=> @setState detailedHeaders: false}>
        <RetinaImg name={"message-disclosure-triangle-active.png"}/>
      </div>
    else
      <div className="collapse-control inactive"
           style={top: "3px"}
           onClick={=> @setState detailedHeaders: true}>
        <RetinaImg name={"message-disclosure-triangle.png"}/>
      </div>

  # Eventually, _formatBody will run a series of registered body transformers.
  # For now, it just runs a few we've hardcoded here, which are all synchronous.
  _formatBody: ->
    return "" unless @props.message and @props.message.body

    body = @props.message.body

    # Apply the autolinker pass to make emails and links clickable
    body = Autolinker.link(body, {twitter: false})

    # Find inline images and give them a calculated CSS height based on
    # html width and height, when available. This means nothing changes size
    # as the image is loaded, and we can estimate final height correctly.
    # Note that MessageBodyWidth must be updated if the UI is changed!

    while (result = MessageUtils.cidRegex.exec(body)) isnt null
      imgstart = body.lastIndexOf('<', result.index)
      imgend = body.indexOf('/>', result.index)

      if imgstart != -1 and imgend > imgstart
        imgtag = body.substr(imgstart, imgend - imgstart)
        width = imgtag.match(/width[ ]?=[ ]?['"]?(\d*)['"]?/)?[1]
        height = imgtag.match(/height[ ]?=[ ]?['"]?(\d*)['"]?/)?[1]
        if width and height
          scale = Math.min(1, MessageBodyWidth / width)
          style = " style=\"height:#{height * scale}px;\" "
          body = body.substr(0, imgend) + style + body.substr(imgend)

    # Replace cid:// references with the paths to downloaded files
    for file in @props.message.files
      continue if _.find @state.downloads, (d) -> d.fileId is file.id
      cidLink = "cid:#{file.contentId}"
      fileLink = "#{FileDownloadStore.pathForFile(file)}"
      body = body.replace(cidLink, fileLink)

    # Replace remaining cid:// references - we will not display them since they'll
    # throw "unknown ERR_UNKNOWN_URL_SCHEME". Show a transparent pixel so that there's
    # no "missing image" region shown, just a space.
    body = body.replace(MessageUtils.cidRegex, "src=\"#{TransparentPixel}\"")

    body

  _toggleQuotedText: ->
    @setState
      showQuotedText: !@state.showQuotedText

  _toggleCollapsed: ->
    Actions.toggleMessageIdExpanded(@props.message.id)

  _formatContacts: (contacts=[]) ->

  _attachmentComponents: ->
    return [] unless @props.message.body

    AttachmentComponent = @state.AttachmentComponent
    attachments = _.filter @props.message.files, (f) =>
      inBody = f.contentId? and @props.message.body.indexOf(f.contentId) > 0
      not inBody and f.filename.length > 0

    attachments.map (file) =>
      <AttachmentComponent file={file} key={file.id} download={@state.downloads[file.id]}/>

  _isForwardedMessage: ->
    Utils.isForwardedMessage(@props.message)

  _onDownloadStoreChange: ->
    @setState
      downloads: FileDownloadStore.downloadsForFileIds(@props.message.fileIds())

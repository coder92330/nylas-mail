_ = require 'underscore-plus'

File = require './file'
Model = require './model'
Contact = require './contact'
Actions = require '../actions'
Attributes = require '../attributes'
MarkMessageReadTask = require '../tasks/mark-message-read'
{generateTempId} = require './utils'

class Message extends Model

  @attributes: _.extend {}, Model.attributes,

    'to': Attributes.Collection
      modelKey: 'to'
      itemClass: Contact

    'cc': Attributes.Collection
      modelKey: 'cc'
      itemClass: Contact

    'bcc': Attributes.Collection
      modelKey: 'bcc'
      itemClass: Contact

    'from': Attributes.Collection
      modelKey: 'from'
      itemClass: Contact

    'date': Attributes.DateTime
      queryable: true
      modelKey: 'date'

    'body': Attributes.String
      modelKey: 'body'

    'files': Attributes.Collection
      modelKey: 'files'
      itemClass: File

    'unread': Attributes.Boolean
      queryable: true
      modelKey: 'unread'

    'snippet': Attributes.String
      modelKey: 'snippet'

    'threadId': Attributes.String
      queryable: true
      modelKey: 'threadId'
      jsonKey: 'thread_id'

    'subject': Attributes.String
      modelKey: 'subject'

    'draft': Attributes.Boolean
      modelKey: 'draft'
      jsonKey: 'draft'
      queryable: true

    'version': Attributes.String
      modelKey: 'version'
      queryable: true

  @naturalSortOrder: ->
    Message.attributes.date.descending()


  constructor: ->
    super
    @body ||= ""
    @subject ||= ""
    @to ||= []
    @cc ||= []
    @bcc ||= []
    @

  toJSON: ->
    json = super
    json.file_ids = @fileIds()
    json.object = 'draft' if @draft
    json

  fromJSON: (json={}) ->
    super (json)

    # Only change the `draft` bit if the incoming json has an `object`
    # property. Because of `DraftChangeSet`, it's common for incoming json
    # to be an empty hash. In this case we want to leave the pre-existing
    # draft bit alone.
    if json.object?
      @draft = (json.object is 'draft')

    for file in (@files ? [])
      file.namespaceId = @namespaceId
    return @

  markAsRead: ->
    task = new MarkMessageReadTask(@)
    Actions.queueTask(task)

  # We calculate the list of participants instead of grabbing it from
  # a parent because it is a better source of ground truth, and saves us
  # from more dependencies.
  participants: ->
    participants = {}
    contacts = _.union((@to ? []), (@cc ? []), (@from ? []))
    for contact in contacts
      if contact? and contact.email?.length > 0
        participants["#{(contact?.email ? "").toLowerCase().trim()} #{(contact?.name ? "").toLowerCase().trim()}"] = contact if contact?
    return _.values(participants)

  fileIds: ->
    _.map @files, (file) -> file.id

  uploadFiles: (paths = []) ->
    # TODO: DEPRECATE. MOVE TO STORE
    FileUploadTask = require '../tasks/file-upload-task'
    paths = [paths] if _.isString(paths)
    for path in paths
      Actions.queueTask(new FileUploadTask(path, @localId))


module.exports = Message

_ = require 'underscore'

Label = require './label'
Folder = require './folder'
Model = require './model'
Contact = require './contact'
Actions = require '../actions'
Attributes = require '../attributes'

Function::getter = (prop, get) ->
  Object.defineProperty @prototype, prop, {get, configurable: yes}

###
Public: The Thread model represents a Thread object served by the Nylas Platform API.
For more information about Threads on the Nylas Platform, read the
[Threads API Documentation](https://nylas.com/docs/api#threads)

## Attributes

`snippet`: {AttributeString} A short, ~140 character string with the content
   of the last message in the thread. Queryable.

`subject`: {AttributeString} The subject of the thread. Queryable.

`unread`: {AttributeBoolean} True if the thread is unread. Queryable.

`starred`: {AttributeBoolean} True if the thread is starred. Queryable.

`version`: {AttributeNumber} The version number of the thread.

`participants`: {AttributeCollection} A set of {Contact} models
   representing the participants in the thread.
   Note: Contacts on Threads do not have IDs.

`lastMessageTimestamp`: {AttributeDateTime} The timestamp of the
   last message on the thread.

This class also inherits attributes from {Model}

Section: Models
###
class Thread extends Model

  @attributes: _.extend {}, Model.attributes,
    'snippet': Attributes.String
      modelKey: 'snippet'

    'subject': Attributes.String
      queryable: true
      modelKey: 'subject'

    'unread': Attributes.Boolean
      queryable: true
      modelKey: 'unread'

    'starred': Attributes.Boolean
      queryable: true
      modelKey: 'starred'

    'version': Attributes.Number
      modelKey: 'version'

    'folders': Attributes.Collection
      queryable: true
      modelKey: 'folders'
      itemClass: Folder

    'labels': Attributes.Collection
      queryable: true
      modelKey: 'labels'
      itemClass: Label

    'participants': Attributes.Collection
      modelKey: 'participants'
      itemClass: Contact

    'lastMessageTimestamp': Attributes.DateTime
      queryable: true
      modelKey: 'lastMessageTimestamp'
      jsonKey: 'last_message_timestamp'

  @naturalSortOrder: ->
    Thread.attributes.lastMessageTimestamp.descending()

  @additionalSQLiteConfig:
    setup: ->
      ['CREATE INDEX IF NOT EXISTS ThreadListIndex ON Thread(last_message_timestamp DESC, namespace_id, id)']

  # Public: Returns true if the thread has a {Category} with the given ID.
  #
  # * `id` A {String} {Category} ID
  #
  hasCategoryId: (id) ->
    return false unless id
    for folder in (@folders ? [])
      return true if folder.id is id
    for label in (@labels ? [])
      return true if label.id is id
    return false
  hasLabelId: (id) -> @hasCategoryId(id)
  hasFolderId: (id) -> @hasCategoryId(id)

  # Public: Returns true if the thread has a {Category} with the given
  # name. Note, only `CategoryStore::standardCategories` have valid
  # `names`
  #
  # * `id` A {String} {Category} name
  #
  hasCategoryName: (name) ->
    return false unless name
    for folder in (@folders ? [])
      return true if folder.name is name
    for label in (@labels ? [])
      return true if label.name is name
    return false
  hasLabelName: (name) -> @hasCategoryName(name)
  hasFolderName: (name) -> @hasCategoryName(name)

module.exports = Thread

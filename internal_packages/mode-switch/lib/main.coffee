{ComponentRegistry} = require 'inbox-exports'
ModeToggle = require './mode-toggle'

module.exports =
  activate: (state) ->
    ComponentRegistry.register
      name: 'ModeToggle'
      view: ModeToggle
      role: 'Root:Center:Toolbar'

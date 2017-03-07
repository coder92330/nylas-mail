_ = require 'underscore'
React = require 'react'
{DatabaseStore,
 AccountStore,
 TaskQueue,
 Actions,
 Contact,
 Message} = require 'nylas-exports'
{InjectedComponentSet} = require 'nylas-component-kit'

DeveloperBarStore = require './developer-bar-store'
DeveloperBarTask = require './developer-bar-task'
DeveloperBarCurlItem = require './developer-bar-curl-item'
DeveloperBarLongPollItem = require './developer-bar-long-poll-item'


class DeveloperBar extends React.Component
  @displayName: "DeveloperBar"

  @containerRequired: false

  constructor: (@props) ->
    @state = _.extend @_getStateFromStores(),
      section: 'curl'
      filter: ''

  componentDidMount: =>
    @taskQueueUnsubscribe = TaskQueue.listen @_onChange
    @activityStoreUnsubscribe = DeveloperBarStore.listen @_onChange

  componentWillUnmount: =>
    @taskQueueUnsubscribe() if @taskQueueUnsubscribe
    @activityStoreUnsubscribe() if @activityStoreUnsubscribe

  render: =>
    <div className="developer-bar">
      <div className="controls">
        <div className="btn-container pull-left">
          <div className="btn" onClick={ => @_onExpandSection('queue')}>
            <span>Client Tasks ({@state.queue?.length})</span>
          </div>
        </div>
        <div className="btn-container pull-left">
          <div className="btn" onClick={ => @_onExpandSection('providerSyncbackRequests')}>
            <span>Provider Syncback Requests</span>
          </div>
        </div>
        <div className="btn-container pull-left">
          <div className="btn" onClick={ => @_onExpandSection('long-polling')}>
            {@_renderDeltaStates()}
            <span>Cloud Deltas</span>
          </div>
        </div>
        <div className="btn-container pull-left">
          <div className="btn" onClick={ => @_onExpandSection('curl')}>
            <span>Requests: {@state.curlHistory.length}</span>
          </div>
        </div>
        <div className="btn-container pull-left">
          <div className="btn" onClick={ => @_onExpandSection('local-sync')}>
            <span>Local Sync Engine</span>
          </div>
        </div>
      </div>
      {@_sectionContent()}
      <div className="footer">
        <div className="btn" onClick={@_onClear}>Clear</div>
        <input className="filter" placeholder="Filter..." value={@state.filter} onChange={@_onFilter} />
      </div>
    </div>

  _renderDeltaStates: =>
    _.map @state.longPollStates, (status, accountId) =>
      <div className="delta-state-wrap" key={accountId} >
        <div title={"Account #{accountId} - Cloud State: #{status}"} key={"#{accountId}-n1Cloud"} className={"activity-status-bubble state-" + status}></div>
      </div>

  _sectionContent: =>
    expandedDiv = <div></div>

    matchingFilter = (item) =>
      return true if @state.filter is ''
      return JSON.stringify(item).indexOf(@state.filter) >= 0

    if @state.section == 'curl'
      itemDivs = @state.curlHistory.filter(matchingFilter).map (item) ->
        <DeveloperBarCurlItem item={item} key={item.id}/>
      expandedDiv = <div className="expanded-section curl-history">{itemDivs}</div>

    else if @state.section == 'long-polling'
      itemDivs = @state.longPollHistory.filter(matchingFilter).map (item) ->
        <DeveloperBarLongPollItem item={item} ignoredBecause={item.ignoredBecause} key={"#{item.cursor}-#{item.timestamp}"}/>
      expandedDiv = <div className="expanded-section long-polling">{itemDivs}</div>

    else if @state.section == 'local-sync'
      expandedDiv = <div className="expanded-section local-sync">
        <InjectedComponentSet matching={{role: "Developer:LocalSyncUI"}} />
      </div>

    else if @state.section == 'providerSyncbackRequests'
      reqs = @state.providerSyncbackRequests.map (req) =>
        <div key={req.id}>&nbsp;{req.type}: {req.status} - {JSON.stringify(req.props)}</div>
      expandedDiv = <div className="expanded-section provider-syncback-requests">{reqs}</div>

    else if @state.section == 'queue'
      queue = @state.queue.filter(matchingFilter)
      queueDivs = for i in [@state.queue.length - 1..0] by -1
        task = @state.queue[i]
        # We need to pass the task separately because we want to update
        # when just that variable changes. Otherwise, since the `task`
        # pointer doesn't change, the `DeveloperBarTask` doesn't know to
        # update.
        status = @state.queue[i].queueState.status
        <DeveloperBarTask task={task}
                         key={task.id}
                         status={status}
                         type="queued" />

      queueCompleted = @state.completed.filter(matchingFilter)
      queueCompletedDivs = for i in [@state.completed.length - 1..0] by -1
        task = @state.completed[i]
        <DeveloperBarTask task={task}
                         key={task.id}
                         type="completed" />

      expandedDiv =
        <div className="expanded-section queue">
          <div className="btn queue-buttons"
               onClick={@_onDequeueAll}>Remove Queued Tasks</div>
          <div className="section-content">
            {queueDivs}
            <hr />
            {queueCompletedDivs}
          </div>
        </div>

      expandedDiv

  _onChange: =>
    @setState(@_getStateFromStores())

  _onClear: =>
    Actions.clearDeveloperConsole()

  _onFilter: (ev) =>
    @setState(filter: ev.target.value)

  _onDequeueAll: =>
    Actions.dequeueAllTasks()

  _onExpandSection: (section) =>
    @setState(@_getStateFromStores())
    @setState(section: section)

  _getStateFromStores: =>
    queue: TaskQueue._queue
    completed: TaskQueue._completed
    curlHistory: DeveloperBarStore.curlHistory()
    longPollHistory: DeveloperBarStore.longPollHistory()
    longPollStates: DeveloperBarStore.longPollStates()
    providerSyncbackRequests: DeveloperBarStore.providerSyncbackRequests()


module.exports = DeveloperBar

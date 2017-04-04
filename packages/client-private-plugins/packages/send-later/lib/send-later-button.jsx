import fs from 'fs';
import React, {Component, PropTypes} from 'react'
import ReactDOM from 'react-dom'
import {Actions, DateUtils, NylasAPIHelpers, DraftHelpers, FeatureUsageStore} from 'nylas-exports'
import {RetinaImg, FeatureUsedUpModal} from 'nylas-component-kit'
import SendLaterPopover from './send-later-popover'
import {PLUGIN_ID, PLUGIN_NAME} from './send-later-constants'
const {NylasAPIRequest, NylasAPI, N1CloudAPI} = require('nylas-exports')

const OPEN_TRACKING_ID = NylasEnv.packages.pluginIdFor('open-tracking')
const LINK_TRACKING_ID = NylasEnv.packages.pluginIdFor('link-tracking')

Promise.promisifyAll(fs);

class SendLaterButton extends Component {
  static displayName = 'SendLaterButton';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
    isValidDraft: PropTypes.func,
  };

  constructor() {
    super();
    this.state = {
      saving: false,
    };
  }

  componentDidMount() {
    this.mounted = true;
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.saving !== this.state.saving) {
      return true;
    }
    if (this._sendLaterDateForDraft(nextProps.draft) !== this._sendLaterDateForDraft(this.props.draft)) {
      return true;
    }
    return false;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  onAssignSendLaterDate = async (sendLaterDate, dateLabel) => {
    if (!this.props.isValidDraft()) { return }
    Actions.closePopover();

    const currentSendLaterDate = this._sendLaterDateForDraft(this.props.draft)
    if (currentSendLaterDate === sendLaterDate) { return }

    // Only check for feature usage and record metrics if this draft is not
    // already set to send later.
    if (!currentSendLaterDate) {
      if (!FeatureUsageStore.isUsable("send-later")) {
        this._showFeatureLimit()
        return
      }

      this.setState({saving: true});
      await FeatureUsageStore.useFeature('send-later')
      const sendInSec = Math.round(((new Date(sendLaterDate)).valueOf() - Date.now()) / 1000)
      Actions.recordUserEvent("Draft Send Later", {
        timeInSec: sendInSec,
        timeInLog10Sec: Math.log10(sendInSec),
        label: dateLabel,
      });
    }
    this.onSetMetadata(sendLaterDate);
  };

  onCancelSendLater = () => {
    Actions.closePopover();
    this.onSetMetadata(null);
  };

  onSetMetadata = async (sendLaterDate) => {
    if (!this.mounted) { return; }
    const {draft, session} = this.props;
    this.setState({saving: true});

    try {
      await NylasAPIHelpers.authPlugin(PLUGIN_ID, PLUGIN_NAME, draft.accountId);
      if (!this.mounted) { return; }

      if (!sendLaterDate) {
        session.changes.addPluginMetadata(PLUGIN_ID, {expiration: null});
      } else {
        session.changes.add({pristine: false})
        const draftContents = await DraftHelpers.prepareDraftForSyncback(session);
        const req = new NylasAPIRequest({
          api: NylasAPI,
          options: {
            path: `/drafts/build`,
            method: 'POST',
            body: draftContents,
            accountId: draft.accountId,
            returnsModel: false,
          },
        });

        const results = await req.run();
        const uploads = [];

        // Now, upload attachments to our blob service.
        for (const attachment of draftContents.uploads) {
          const uploadReq = new NylasAPIRequest({
            api: N1CloudAPI,
            options: {
              path: `/blobs`,
              method: 'PUT',
              blob: true,
              accountId: draft.accountId,
              returnsModel: false,
              formData: {
                id: attachment.id,
                file: fs.createReadStream(attachment.originPath),
              },
            },
          });
          await uploadReq.run();
          attachment.serverId = `${draftContents.accountId}-${attachment.id}`;
          uploads.push(attachment);
        }
        results.usesOpenTracking = draft.metadataForPluginId(OPEN_TRACKING_ID) != null;
        results.usesLinkTracking = draft.metadataForPluginId(LINK_TRACKING_ID) != null;
        session.changes.addPluginMetadata(
          PLUGIN_ID,
          Object.assign({expiration: sendLaterDate}, results, {uploads})
        );
      }

      // TODO: This currently doesn't do anything. Uncomment once it's necessary
      // Actions.ensureDraftSynced(draft.clientId);

      if (sendLaterDate && NylasEnv.isComposerWindow()) {
        NylasEnv.close();
      }
    } catch (error) {
      NylasEnv.reportError(error);
      NylasEnv.showErrorDialog(`Sorry, we were unable to schedule this message. ${error.message}`);
    }

    if (!this.mounted) { return }
    this.setState({saving: false})
  }

  onClick = () => {
    const buttonRect = ReactDOM.findDOMNode(this).getBoundingClientRect()
    Actions.openPopover(
      <SendLaterPopover
        sendLaterDate={this._sendLaterDateForDraft(this.props.draft)}
        onAssignSendLaterDate={this.onAssignSendLaterDate}
        onCancelSendLater={this.onCancelSendLater}
      />,
      {originRect: buttonRect, direction: 'up'}
    )
  };

  _sendLaterDateForDraft(draft) {
    if (!draft) {
      return null;
    }
    const messageMetadata = draft.metadataForPluginId(PLUGIN_ID) || {};
    return messageMetadata.expiration;
  }

  _showFeatureLimit() {
    const featureData = FeatureUsageStore.featureData("send-later");

    let headerText = "";
    let rechargeText = ""
    if (!featureData.quota) {
      headerText = "Send later not yet enabled";
      rechargeText = "Upgrade to Pro to start sending later"
    } else {
      headerText = "All delayed sends used";
      const next = FeatureUsageStore.nextPeriodString(featureData.period)
      rechargeText = `You’ll have ${featureData.quota} more chances to send later ${next}`
    }

    Actions.openModal({
      component: (
        <FeatureUsedUpModal
          modalClass="send-later"
          featureName="send later"
          headerText={headerText}
          iconUrl="nylas://send-later/assets/ic-send-later-modal@2x.png"
          rechargeText={rechargeText}
        />
      ),
      height: 575,
      width: 412,
    })
  }


  render() {
    let className = 'btn btn-toolbar btn-send-later';

    if (this.state.saving) {
      return (
        <button className={className} title="Saving send date..." tabIndex={-1} style={{order: -99}}>
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
            style={{width: 14, height: 14}}
          />
        </button>
      );
    }

    let sendLaterLabel = false;
    const sendLaterDate = this._sendLaterDateForDraft(this.props.draft);

    if (sendLaterDate) {
      className += ' btn-enabled';
      const momentDate = DateUtils.futureDateFromString(sendLaterDate);
      if (momentDate) {
        sendLaterLabel = <span className="at">Sending in {momentDate.fromNow(true)}</span>;
      } else {
        sendLaterLabel = <span className="at">Sending now</span>;
      }
    }
    return (
      <button className={className} title="Send later…" onClick={this.onClick} tabIndex={-1} style={{order: -99}}>
        <RetinaImg name="icon-composer-sendlater.png" mode={RetinaImg.Mode.ContentIsMask} />
        {sendLaterLabel}
        <span>&nbsp;</span>
        <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

export default SendLaterButton

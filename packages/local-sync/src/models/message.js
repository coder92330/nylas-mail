const crypto = require('crypto');
const {PromiseUtils, IMAPConnection} = require('isomorphic-core')
const {DatabaseTypes: {JSONType, JSONARRAYType}} = require('isomorphic-core');


module.exports = (sequelize, Sequelize) => {
  return sequelize.define('message', {
    accountId: { type: Sequelize.STRING, allowNull: false },
    version: Sequelize.INTEGER,
    headerMessageId: Sequelize.STRING,
    body: Sequelize.TEXT('long'),
    headers: JSONType('headers'),
    subject: Sequelize.STRING(500),
    snippet: Sequelize.STRING(255),
    hash: Sequelize.STRING(65),
    date: Sequelize.DATE,
    unread: Sequelize.BOOLEAN,
    starred: Sequelize.BOOLEAN,
    processed: Sequelize.INTEGER,
    to: JSONARRAYType('to'),
    from: JSONARRAYType('from'),
    cc: JSONARRAYType('cc'),
    bcc: JSONARRAYType('bcc'),
    replyTo: JSONARRAYType('replyTo'),
    folderImapUID: { type: Sequelize.STRING, allowNull: true},
    folderImapXGMLabels: { type: Sequelize.TEXT, allowNull: true},
  }, {
    indexes: [
      {
        unique: true,
        fields: ['hash'],
      },
    ],
    classMethods: {
      associate({Message, Folder, Label, File, Thread, MessageLabel}) {
        Message.belongsTo(Thread)
        Message.belongsTo(Folder)
        Message.belongsToMany(Label, {through: MessageLabel})
        Message.hasMany(File)
      },

      hashForHeaders(headers) {
        return crypto.createHash('sha256').update(headers, 'utf8').digest('hex');
      },
    },
    instanceMethods: {
      async setLabelsFromXGM(xGmLabels, {Label, preloadedLabels} = {}) {
        this.folderImapXGMLabels = JSON.stringify(xGmLabels);
        const labels = await Label.findXGMLabels(xGmLabels, {preloadedLabels})
        return this.setLabels(labels);
      },

      fetchRaw({account, db, logger}) {
        const settings = Object.assign({}, account.connectionSettings, account.decryptedCredentials())
        return PromiseUtils.props({
          folder: this.getFolder(),
          connection: IMAPConnection.connect({db, settings, logger}),
        })
        .then(({folder, connection}) => {
          return connection.openBox(folder.name)
          .then((imapBox) => imapBox.fetchMessage(this.folderImapUID))
          .then((message) => {
            if (message) {
              return Promise.resolve(`${message.headers}${message.parts.TEXT}`)
            }
            return Promise.reject(new Error(`Unable to fetch raw message for Message ${this.id}`))
          })
          .finally(() => connection.end())
        })
      },

      toJSON() {
        if (this.folder_id && !this.folder) {
          throw new Error("Message.toJSON called on a message where folder were not eagerly loaded.")
        }

        // When we request messages as a sub-object of a thread, we only
        // request the `id` field from the database. We still toJSON the
        // Message though and need to protect `this.date` from null
        // errors.
        return {
          id: `${this.id}`,
          account_id: this.accountId,
          object: 'message',
          body: this.body,
          subject: this.subject,
          snippet: this.snippet,
          to: this.to,
          from: this.from,
          cc: this.cc,
          bcc: this.bcc,
          reply_to: this.replyTo,
          date: this.date ? this.date.getTime() / 1000.0 : null,
          unread: this.unread,
          starred: this.starred,
          folder: this.folder,
          labels: this.labels,
          thread_id: this.threadId,
        };
      },
    },
  });
};

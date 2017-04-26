/* eslint global-require: 0 */
module.exports = {
  Provider: {
    Gmail: 'gmail',
    IMAP: 'imap',
  },
  Imap: require('imap'),
  Errors: require('./src/errors'),
  IMAPErrors: require('./src/imap-errors'),
  SMTPErrors: require('./src/smtp-errors'),
  loadModels: require('./src/load-models'),
  AuthHelpers: require('./src/auth-helpers'),
  PromiseUtils: require('./src/promise-utils'),
  DatabaseTypes: require('./src/database-types'),
  IMAPConnection: require('./src/imap-connection').default,
  IMAPConnectionPool: require('./src/imap-connection-pool'),
  MessageBodyUtils: require('./src/message-body-utils'),
  SendmailClient: require('./src/sendmail-client'),
  DeltaStreamBuilder: require('./src/delta-stream-builder'),
  HookTransactionLog: require('./src/hook-transaction-log'),
  HookIncrementVersionOnSave: require('./src/hook-increment-version-on-save'),
  BackoffScheduler: require('./src/backoff-schedulers').BackoffScheduler,
  ExponentialBackoffScheduler: require('./src/backoff-schedulers').ExponentialBackoffScheduler,
  CommonProviderSettings: require('imap-provider-settings').CommonProviderSettings,
  MetricsReporter: require('./src/metrics-reporter').default,
  MessageUtils: require('./src/message-utils'),
  TrackingUtils: require('./src/tracking-utils').default,
  ModelUtils: require('./src/model-utils').default,
  executeJasmine: require('./spec/jasmine/execute').default,
  StringUtils: require('./src/string-utils'),
  TLSUtils: require('./src/tls-utils'),
  DBUtils: require('./src/db-utils'),
  ShellUtils: require('./src/shell-utils'),
}

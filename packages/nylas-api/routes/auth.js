const Joi = require('joi');
const _ = require('underscore');
const google = require('googleapis');
const OAuth2 = google.auth.OAuth2;

const Serialization = require('../serialization');
const {
  IMAPConnection,
  DatabaseConnector,
  SyncPolicy,
  Provider,
} = require('nylas-core');

const {GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URL} = process.env;

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',  // email address
  'https://www.googleapis.com/auth/userinfo.profile',  // G+ profile
  'https://mail.google.com/',  // email
  'https://www.google.com/m8/feeds',  // contacts
  'https://www.googleapis.com/auth/calendar',  // calendar
];

const imapSmtpSettings = Joi.object().keys({
  imap_host: [Joi.string().ip().required(), Joi.string().hostname().required()],
  imap_port: Joi.number().integer().required(),
  imap_username: Joi.string().required(),
  imap_password: Joi.string().required(),
  smtp_host: [Joi.string().ip().required(), Joi.string().hostname().required()],
  smtp_port: Joi.number().integer().required(),
  smtp_username: Joi.string().required(),
  smtp_password: Joi.string().required(),
  ssl_required: Joi.boolean().required(),
}).required();

const exchangeSettings = Joi.object().keys({
  username: Joi.string().required(),
  password: Joi.string().required(),
  eas_server_host: [Joi.string().ip().required(), Joi.string().hostname().required()],
}).required();

const buildAccountWith = ({name, email, provider, settings, credentials}) => {
  return DatabaseConnector.forShared().then((db) => {
    const {AccountToken, Account} = db;

    return Account.find({
      where: {
        emailAddress: email,
        connectionSettings: JSON.stringify(settings),
      },
    }).then((existing) => {
      const account = existing || Account.build({
        name: name,
        provider: provider,
        emailAddress: email,
        connectionSettings: settings,
        syncPolicy: SyncPolicy.defaultPolicy(),
        lastSyncCompletions: [],
      })

      // always update with the latest credentials
      account.setCredentials(credentials);

      return account.save().then((saved) =>
        AccountToken.create({accountId: saved.id}).then((token) =>
          DatabaseConnector.prepareAccountDatabase(saved.id).thenReturn({
            account: saved,
            token: token,
          })
        )
      );
    });
  });
}

module.exports = (server) => {
  server.route({
    method: 'POST',
    path: '/auth',
    config: {
      description: 'Authenticates a new account.',
      notes: 'Notes go here',
      tags: ['accounts'],
      auth: false,
      validate: {
        query: {
          client_id: Joi.string().required(),
          n1_id: Joi.string(),
        },
        payload: {
          email: Joi.string().email().required(),
          name: Joi.string().required(),
          provider: Joi.string().required(),
          settings: Joi.alternatives().try(imapSmtpSettings, exchangeSettings),
        },
      },
      response: {
        schema: Joi.alternatives().try(
          Serialization.jsonSchema('Account'),
          Serialization.jsonSchema('Error')
        ),
      },
    },
    handler: (request, reply) => {
      const dbStub = {};
      const connectionChecks = [];
      const {settings, email, provider, name} = request.payload;

      if (provider === 'imap') {
        connectionChecks.push(IMAPConnection.connect({
          logger: request.logger,
          settings: settings,
          db: dbStub,
        }));
      }

      Promise.all(connectionChecks).then(() => {
        return buildAccountWith({
          name,
          email,
          provider: Provider.IMAP,
          settings: _.pick(settings, [
            'imap_host', 'imap_port',
            'smtp_host', 'smtp_port',
            'ssl_required',
          ]),
          credentials: _.pick(settings, [
            'imap_username', 'imap_password',
            'smtp_username', 'smtp_password',
          ]),
        })
      })
      .then(({account, token}) => {
        const response = account.toJSON();
        response.token = token.value;
        reply(Serialization.jsonStringify(response));
      })
      .catch((err) => {
        reply({error: err.message}).code(400);
      })
    },
  });

  server.route({
    method: 'GET',
    path: '/auth/gmail',
    config: {
      description: 'Redirects to Gmail OAuth',
      notes: 'Notes go here',
      tags: ['accounts'],
      auth: false,
    },
    handler: (request, reply) => {
      const oauthClient = new OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URL);
      reply.redirect(oauthClient.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
      }));
    },
  });

  server.route({
    method: 'GET',
    path: '/auth/gmail/oauthcallback',
    config: {
      description: 'Authenticates a new account.',
      notes: 'Notes go here',
      tags: ['accounts'],
      auth: false,
      validate: {
        query: {
          code: Joi.string().required(),
        },
      },
    },
    handler: (request, reply) => {
      const oauthClient = new OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URL);
      oauthClient.getToken(request.query.code, (err, tokens) => {
        if (err) {
          reply({error: err.message}).code(400);
          return;
        }
        oauthClient.setCredentials(tokens);
        google.oauth2({version: 'v2', auth: oauthClient}).userinfo.get((error, profile) => {
          if (error) {
            reply({error: error.message}).code(400);
            return;
          }

          const settings = {
            imap_username: profile.email,
            imap_host: 'imap.gmail.com',
            imap_port: 993,
            ssl_required: true,
          }
          const credentials = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            client_id: GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
          }
          Promise.all([
            IMAPConnection.connect({
              logger: request.logger,
              settings: Object.assign({}, settings, credentials),
              db: {},
            }),
          ])
          .then(() =>
            buildAccountWith({
              name: profile.name,
              email: profile.email,
              provider: Provider.Gmail,
              settings,
              credentials,
            })
          )
          .then(({account, token}) => {
            const response = account.toJSON();
            response.token = token.value;
            reply(Serialization.jsonStringify(response));
          })
          .catch((connectionErr) => {
            reply({error: connectionErr.message}).code(400);
          });
        });
      });
    },
  });
}

const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const {loadModels} = require('isomorphic-core')
const HookTransactionLog = require('./hook-transaction-log');
const HookIncrementVersionOnSave = require('./hook-increment-version-on-save');

require('./database-extensions'); // Extends Sequelize on require

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR);
}

class DatabaseConnector {
  constructor() {
    this._cache = {};
  }

  _sequelizePoolForDatabase(dbname) {
    if (process.env.DB_HOSTNAME) {
      return new Sequelize(dbname, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
        host: process.env.DB_HOSTNAME,
        dialect: "mysql",
        charset: 'utf8',
        logging: false,
        pool: {
          min: 1,
          max: 15,
          idle: 5000,
        },
        define: {
          charset: 'utf8',
          collate: 'utf8_general_ci',
        },
      });
    }

    return new Sequelize(dbname, '', '', {
      storage: path.join(STORAGE_DIR, `${dbname}.sqlite`),
      dialect: "sqlite",
      logging: false,
    })
  }

  _sequelizeForShared() {
    const sequelize = this._sequelizePoolForDatabase(`ebdb`);
    const db = loadModels(Sequelize, sequelize, {
      modelLocations: [
        {modelsSubpath: 'shared'},
        {modelsDir: path.join(__dirname, 'models')},
      ],
    })

    HookTransactionLog(db, sequelize);
    HookIncrementVersionOnSave(db, sequelize);

    db.sequelize = sequelize;
    db.Sequelize = Sequelize;

    return sequelize.authenticate().then(() =>
      sequelize.sync()
    ).thenReturn(db);
  }

  forShared() {
    this._cache.shared = this._cache.shared || this._sequelizeForShared();
    return this._cache.shared;
  }
}

module.exports = new DatabaseConnector()

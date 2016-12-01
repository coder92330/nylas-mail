module.exports = (sequelize, Sequelize) => {
  return sequelize.define('contact', {
    id: {type: Sequelize.STRING(65), primaryKey: true},
    accountId: { type: Sequelize.STRING, allowNull: false },
    version: Sequelize.INTEGER,
    name: Sequelize.STRING,
    email: Sequelize.STRING,
  }, {
    indexes: [
      {
        unique: true,
        fields: ['id'],
      },
    ],
    instanceMethods: {
      toJSON: function toJSON() {
        return {
          id: `${this.publicId}`,
          account_id: this.accountId,
          object: 'contact',
          email: this.email,
          name: this.name,
        }
      },
    },
  })
}

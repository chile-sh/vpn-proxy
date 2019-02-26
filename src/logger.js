'use strict'

const pino = require('pino')

module.exports = pino({
  prettyPrint: {
    levelFirst: true,
    translateTime: 'SYS:standard'
  }
})

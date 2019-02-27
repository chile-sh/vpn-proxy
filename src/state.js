'use strict'

module.exports = {
  publicIp: null,
  vpns: {},
  files: [],
  stats: {},

  availability: {
    isChecking: false,
    isAvailable: false,
    promise: Promise.resolve()
  }
}

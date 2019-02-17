'use strict'

require('dotenv').config()

const {
  VPN_USER,
  VPN_PASS,
  IMAGE_NAME = 'vpnproxy',
  DOCKER_PREFIX = 'proxy',
  PORT = 5050
} = process.env

module.exports = {
  user: VPN_USER,
  pass: VPN_PASS,
  imageName: IMAGE_NAME,
  dockerPrefix: DOCKER_PREFIX,
  reqLimit: 1,
  proxy: {
    startsFrom: 5000,
    port: PORT
  }
}

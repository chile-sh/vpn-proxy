'use strict'

const exitHook = require('async-exit-hook')
const http = require('http')
const httpProxy = require('http-proxy')
const logger = require('./logger')

const { sample, myIp, wait } = require('./helpers')
const config = require('../config')
const ovpn = require('./ovpn')
const state = require('./state')

const proxy = httpProxy.createProxyServer()

const vpnsReady = () => Object.keys(state.vpns)
  .filter(vpn => state.vpns[vpn].ready)

const checkAvailability = async () => new Promise(resolve => {
  const { availability } = state

  const check = () => {
    availability.isChecking = true
    const ready = vpnsReady()

    if (ready && ready.length) {
      resolve(ready)
      availability.isAvailable = true
      availability.isChecking = false
      return
    }

    availability.isAvailable = false
    logger.info(ready.length)

    setTimeout(check, 100)
  }

  check()
})

// Proxy server
const server = http.createServer(async (req, res) => {
  const { isAvailable, isChecking } = state.availability

  if (!isAvailable && !isChecking) {
    state.availability.promise = checkAvailability()
  }

  const available = await state.availability.promise

  const vpn = sample(available)
  logger.info({ vpn }, state.publicIp)

  proxy.web(req, res, {
    target: {
      host: 'localhost',
      port: state.vpns[vpn].port.proxy
    }
  }, err => logger.error(err.message))

  const last = ++state.vpns[vpn].count > config.reqLimit
  if (last) state.vpns[vpn].ready = false

  res.on('finish', () => last && renew(vpn))
})

const renew = async key => {
  const vpn = state.vpns[key]
  vpn.ready = false

  const stats = state.stats[vpn.id] || { connNum: 0 }
  state.stats[vpn.id] = stats

  try {
    const ready = vpnsReady()
    if (!ready || !ready.length) {
      state.availability.isAvailable = false
    }

    const { file, ip } = await ovpn.renew(vpn.id, key, stats.connNum++)
    logger.info('vpn.conn', state.publicIp !== ip, ip, file, stats.connNum)
    vpn.ready = true
    vpn.count = 0
  } catch (err) {
    logger.error(err)
  }
}

const main = async () => {
  state.publicIp = await myIp()
  logger.info('public ip', state.publicIp)

  await ovpn.docker.up()

  // Wait for containers to start (supervisord)
  const waitFor = 2000
  logger.info(`Waiting ${waitFor / 1000} seconds...`)
  await wait(waitFor)
  await Promise.all(Object.keys(state.vpns).map(renew))

  logger.info(`listening on port ${config.proxy.port}`)
  server.listen(config.proxy.port)
}

exitHook(async callback => {
  await ovpn.docker.down()
  logger.info('containers removed')
  callback()
})

main()

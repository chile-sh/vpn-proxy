'use strict'

const http = require('http')
const httpProxy = require('http-proxy')
const logger = require('./logger')
const exitHook = require('async-exit-hook')

const config = require('../config')
const { sample, myIp, wait } = require('./helpers')
const ovpn = require('./ovpn')
const state = require('./state')

const proxy = httpProxy.createProxyServer()

const checkAvailability = async () => new Promise(resolve => {
  const check = () => {
    const available = Object.keys(state.vpns)
      .filter(vpn => state.vpns[vpn].ready)

    if (available && available.length) {
      resolve(available)
      return
    }

    logger.info(available.length)

    setTimeout(check, 100)
  }

  check()
})

// Proxy server
const server = http.createServer(async (req, res) => {
  const available = await checkAvailability()

  const vpn = sample(available)
  logger.info({ vpn }, state.publicIp)

  proxy.web(req, res, {
    target: {
      host: 'localhost',
      port: state.vpns[vpn].port
    }
  }, e => console.error(e.message))

  const last = ++state.vpns[vpn].count > config.reqLimit
  if (last) state.vpns[vpn].ready = false

  // res.on('finish', () => last && renewVpn(vpn))
})

const getVpnFile = (vendor, num = 0) => {
  const arr = state.files
    .filter(f => f.vendor === vendor)
    .map(f => f.file)
  return arr[num % arr.length]
}

const main = async () => {
  await ovpn.docker.up()

  // Wait for containers to start (supervisord)
  const waitFor = 2000
  logger.info(`Waiting ${waitFor / 1000} seconds...`)
  await wait(waitFor)

  const pAll = Object.keys(state.vpns).map(async key => {
    const vpn = state.vpns[key]
    const stats = state.stats[vpn.id] || { connNum: 0 }
    state.stats[vpn.id] = stats

    try {
      const file = getVpnFile(vpn.id, stats.connNum++)
      logger.info('vpn.conn.filename', key, file)
      const res = await ovpn.connect(key, file)
      logger.info('vpn.conn', res)
    } catch (err) {
      logger.error(err)
    }
  })

  await Promise.all(pAll)

  logger.info(`listening on port ${config.proxy.port}`)
  server.listen(config.proxy.port)

  state.publicIp = await myIp()
  logger.info('public ip', state.publicIp)
}

exitHook(async callback => {
  await ovpn.docker.down()
  logger.info('containers removed')
  callback()
})

main()

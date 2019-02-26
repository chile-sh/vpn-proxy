'use strict'

const Docker = require('dockerode')
const fs = require('fs-extra')
const http = require('http')
const httpProxy = require('http-proxy')
const logger = require('./logger')
const exitHook = require('async-exit-hook')
const _ = require('lodash')
const jayson = require('jayson')

const config = require('../config')
const { sample, myIp, wait } = require('./helpers')

const docker = new Docker()
const proxy = httpProxy.createProxyServer()

const state = {
  publicIp: null,
  vpns: {},
  files: [],
  stats: {}
}

const getFiles = async id => {
  const dir = `./ovpn/${id}`
  const exists = await fs.exists(dir)

  if (!exists) throw Error(`Directory ${id} not found.`)
  return (await fs.readdir(dir)).filter(f => f.endsWith('.ovpn'))
}

const create = async (name, port, rpcPort) =>
  docker.createContainer({
    Image: config.imageName,
    name: `${config.dockerPrefix}-${name}`,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    StdinOnce: false,
    OpenStdin: false,
    Tty: true,
    Cmd: ['supervisord', '-n'],
    ExposedPorts: {
      '8118/tcp': {},
      '3000/tcp': {}
    },
    Volumes: {
      '/ovpn': {}
    },
    HostConfig: {
      PortBindings: {
        '8118/tcp': [{ HostIp: '127.0.0.1', HostPort: String(port) }],
        '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: String(rpcPort) }]
      },
      Dns: ['8.8.8.8', '8.8.4.4'],
      Binds: [`${__dirname}/../ovpn:/ovpn`],
      CapAdd: ['NET_ADMIN'],
      Devices: [{
        PathOnHost: '/dev/net/tun',
        PathInContainer: '/dev/net/tun',
        CgroupPermissions: 'rwm'
      }]
    }
  })

const getContainers = async () => {
  const all = await docker.listContainers({ all: true })
  return all.filter(c => c.Image === config.imageName)
}

// todo
const renewVpn = async (name, retry) => {
  logger.info('renew VPN', name)
  const vpn = state.vpns[name]

  const found = (await getContainers()).find(c =>
    c.Names[0] === `/${config.dockerPrefix}-${name}`
  )
  const container = docker.getContainer(found.Id)
  try {
    await container.stop()
    logger.info('stopped', name, found.Id)
    await container.remove({ force: true })
    logger.info('removed', name, found.Id)

    const newVpn = sample(state.filtered)
    await (await create(newVpn, vpn.port)).start()

    // Wait a little for openvpn to connect
    await wait(3000)

    state.vpns[newVpn] = {
      ...vpn,
      name: newVpn,
      ready: true,
      count: 0
    }

    delete state.vpns[name]
    logger.info(newVpn, 'started', 'on port', vpn.port)
  } catch (err) {
    logger.error(err.message)

    if (!retry) {
      logger.info('retrying...')
      renewVpn(name, true)
    }
  }
}

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

  res.on('finish', () => last && renewVpn(vpn))
})

const dockerUp = async () => Promise.all(config.ovpns
  .filter(vpn => vpn.enabled)
  .reduce(({ accum, vpns }, vpn, i, arr) => {
    const ports = _.times(vpn.maxClients, n => ({
      proxy: config.proxy.initialPort + accum + n,
      rpc: config.proxy.initialRpcPort + accum + n
    }))

    const vpnArr = [...vpns, { ...vpn, ports }]
    if (i === arr.length - 1) return vpnArr

    return { vpns: vpnArr, accum: accum + vpn.maxClients }
  }, { vpns: [], accum: 0 })
  .map(async vpn => {
    const { id, maxClients, ports } = vpn
    const files = await getFiles(id)

    state.files.push(...files.map(file => ({ vendor: id, file })))

    await Promise.all(ports.map(async (port, i) => {
      const contName = `${id}-${port.proxy}`
      const container = await create(contName, port.proxy, port.rpc)
      await container.start()

      state.vpns[contName] = {
        id,
        port,
        count: Math.floor(config.reqLimit / maxClients) * i,
        ready: false,
        rpc: jayson.client.tcp({ port: port.rpc })
      }

      logger.info(contName, 'started', 'on port', port)
    }))
  }))

const dockerDown = async () => Promise.all((await getContainers())
  .map(async ({ Id, Names }) => {
    const container = docker.getContainer(Id)
    try {
      await container.remove({ force: true })
      logger.info(Names[0], 'removed')
    } catch (e) {
      logger.error(e.message)
    }
  }))

const connect = async (vpnKey, name) =>
  new Promise((resolve, reject) => {
    const vpn = state.vpns[vpnKey]
    logger.info('vpn.rpc.connect', vpn.id, name)

    vpn.rpc.request('connect', [vpn.id, name], (err, response) => {
      if (err) return reject(err)
      resolve(response && response.result)
    })
  })

const disconnect = async vpnKey =>
  new Promise((resolve, reject) => {
    const vpn = state.vpns[vpnKey]
    vpn.rpc.request('disconnect', [vpn.id], (err, response) => {
      if (err) return reject(err)
      resolve(response && response.result)
    })
  })

const getVpnFile = (vendor, num = 0) => {
  const arr = state.files
    .filter(f => f.vendor === vendor)
    .map(f => f.file)
  return arr[num % arr.length]
}

const main = async () => {
  await dockerUp()

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
      const res = await connect(key, file)
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
  await dockerDown()
  logger.info('containers removed')
  callback()
})

main()

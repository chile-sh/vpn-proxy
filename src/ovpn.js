'use strict'

const Docker = require('dockerode')
const fs = require('fs-extra')
const config = require('../config')
const state = require('./state')
const logger = require('./logger')
const jayson = require('jayson')
const _ = require('lodash')

const docker = new Docker()

const getFiles = async id => {
  const dir = `./ovpn/${id}`
  const exists = await fs.exists(dir)

  if (!exists) throw Error(`Directory ${id} not found.`)
  return (await fs.readdir(dir)).filter(f => f.endsWith('.ovpn'))
}

const getContainers = async () => {
  const all = await docker.listContainers({ all: true })
  return all.filter(c => c.Image === config.imageName)
}

const createInstance = async (name, port, rpcPort) =>
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

const dockerUp = async () => {
  const filtered = config.ovpns.filter(vpn => vpn.enabled)

  const vpns = []
  let accum = 0

  for (const vpn of filtered) {
    const ports = _.times(vpn.maxClients, n => ({
      proxy: config.proxy.initialPort + accum + n,
      rpc: config.proxy.initialRpcPort + accum + n
    }))

    accum += vpn.maxClients
    vpns.push({ ...vpn, ports })
  }

  return Promise.all(vpns.map(async vpn => {
    const { id, maxClients, ports } = vpn
    const files = await getFiles(id)

    state.files.push(...files.map(file => ({ vendor: id, file })))

    await Promise.all(ports.map(async (port, i) => {
      const contName = `${id}-${port.proxy}`
      const container = await createInstance(contName, port.proxy, port.rpc)
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
}

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

const disconnect = async vpnKey => new Promise((resolve, reject) => {
  const vpn = state.vpns[vpnKey]
  vpn.rpc.request('disconnect', [vpn.id], (err, response) => {
    if (err) return reject(err)
    resolve(response && response.result)
  })
})

const getNet = vpnKey => new Promise((resolve, reject) => {
  state.vpns[vpnKey].rpc.request('getNet', [], (err, response) => {
    if (err) return reject(err)
    resolve(response && response.result)
  })
})

const renew = async (vpnId, vpnKey, num = 0) => {
  const net = await getNet(vpnKey)
  const file = getVpnFile(vpnId, num)

  if (net.tun0) await disconnect(vpnKey)
  const ip = await connect(vpnKey, file)

  return { file, ip }
}

const getVpnFile = (vendor, num = 0) => {
  const arr = state.files
    .filter(f => f.vendor === vendor)
    .map(f => f.file)
  return arr[num % arr.length]
}

module.exports = {
  getFiles,
  getVpnFile,
  getNet,
  connect,
  disconnect,
  renew,
  docker: {
    getContainers,
    up: dockerUp,
    down: dockerDown,
    create: createInstance
  }
}

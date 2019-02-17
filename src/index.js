'use strict'

const Docker = require('dockerode')
const fs = require('fs-extra')
const http = require('http')
const httpProxy = require('http-proxy')
const exitHook = require('async-exit-hook')

const config = require('./config')
const { sample, myIp } = require('./helpers')

const docker = new Docker()
const proxy = httpProxy.createProxyServer()

const state = {
  allFiles: [],
  publicIp: null
}

const create = async (name, port, auth = {}) => {
  if (!state.allFiles.find(n => n === name)) {
    throw Error(`ovpn file ${name} not found.`)
  }

  const created = await docker.createContainer({
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
      '8118/tcp': {}
    },
    Volumes: {
      '/ovpn': {}
    },
    Env: [
      `VPN_USER=${auth.user || config.user}`,
      `VPN_PASS=${auth.pass || config.pass}`,
      `OVPN_FILE=${name}`
    ],
    HostConfig: {
      PortBindings: {
        '8118/tcp': [{ HostIp: '127.0.0.1', HostPort: String(port) }]
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

  return created
}

const getContainers = async () => {
  const all = await docker.listContainers({ all: true })
  return all.filter(c => c.Image === config.imageName)
}

const renewVpn = async (name, retry) => {
  console.log('renew VPN', name)
  const vpn = state.vpns[name]

  const found = (await getContainers()).find(c =>
    c.Names[0] === `/${config.dockerPrefix}-${name}`
  )
  const container = docker.getContainer(found.Id)
  try {
    await container.stop()
    console.log('stopped', name, found.Id)
    await container.remove({ force: true })
    console.log('removed', name, found.Id)

    const newVpn = sample(state.filtered)
    const _newCont = await create(newVpn, vpn.port)
    await _newCont.start()

    state.vpns[newVpn] = {
      ...vpn,
      name: newVpn,
      ready: true,
      count: 0
    }

    delete state.vpns[name]
    console.log(newVpn, 'started', 'on port', vpn.port)
  } catch (err) {
    console.error(err.message)

    if (!retry) {
      console.log('retrying...')
      renewVpn(name, true)
    }
  }
}

// Proxy server
const server = http.createServer((req, res) => {
  const available = Object.keys(state.vpns)
    .filter(vpn => state.vpns[vpn].ready)
  const vpn = sample(available)
  console.log({ vpn }, state.publicIp)
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

// Default regex for US and Chilean VPNs
const initialConfig = async (regex = '^(us|cl)') => {
  state.allFiles = await fs.readdir('./ovpn')
  state.filtered = state.allFiles
    .filter(f => f.endsWith('ovpn'))
    .filter(s => new RegExp(regex).test(s))

  state.vpns = sample(state.filtered, 6).reduce((obj, vpn, i) => ({
    ...obj,
    [vpn]: {
      name: vpn,
      port: config.proxy.startsFrom + i,
      count: 0,
      ready: false
    }
  }), {})

  return state.vpns
}

const main = async () => {
  await initialConfig()
  console.log('state.vpns', state.vpns)

  await Promise.all(Object.values(state.vpns).map(async vpn => {
    const _newCont = await create(vpn.name, vpn.port)
    await _newCont.start()

    state.vpns[vpn.name].ready = true

    console.log(vpn.name, 'started', 'on port', vpn.port)
  }))

  console.log(state.vpns)
  console.log('listening on port 5050')
  server.listen(config.proxy.port)
  state.publicIp = await myIp()
  console.log('public ip', state.publicIp)
}

exitHook(async callback => {
  const containers = await getContainers()

  await Promise.all(containers.map(async ({ Id, Names }) => {
    const container = docker.getContainer(Id)
    try {
      await container.remove({ force: true })
      console.log(Names[0], 'removed')
    } catch (e) {
      console.error(e.message)
    }
  }))

  callback()
})

main()

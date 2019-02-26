#!/usr/bin/env node

'use strict'

const { spawn } = require('child_process')
const jayson = require('jayson/promise')
const os = require('os')

const PORT = 3000

let ovpn = null

const server = jayson.server({
  connect: ([vpn, name, timeout]) => new Promise((resolve, reject) => {
    console.log('connect', { vpn, name, timeout })

    if (ovpn) {
      const err = Error('already running, use `disconnect`')
      console.error('connect:err', err)
      return reject(err.message)
    }

    if (!vpn || !name) {
      return reject(Error('`vpn` or `name` parameter missing'))
    }

    ovpn = spawn('openvpn', [name], {
      cwd: `/ovpn/${vpn}`,
      killSignal: 'SIGINT'
    })

    const _timeout = setTimeout(() => {
      const err = Error(`Couldn't connect: Timeout error`)
      err.code = 'timeout'
      reject(err)
      ovpn.kill()
    }, (timeout || 10) * 1000)

    ovpn.stdout.on('data', data => {
      const str = data.toString()
      console.log('connect:stdout', str)
      if (/route add/.test(str)) {
        clearTimeout(_timeout)
        resolve(str.match(/route add\s([^ ]+)\s/)[1])
      }
    })

    ovpn.stderr.on('data', err => {
      clearTimeout(_timeout)
      console.log('connect:stderr', err.toString())
      reject(err.toString())
    })
  }),

  disconnect: args => new Promise((resolve, reject) => {
    console.log('disconnect', args)
    if (ovpn) {
      ovpn.on('close', (code, signal) => {
        resolve({ code, signal })
        ovpn = null
      })

      return ovpn.kill()
    }

    reject(Error('Not connected'))
  }),

  getNet: (args, callback) => {
    callback(null, os.networkInterfaces())
  }
})

console.log('listening on port', PORT)
server.tcp().listen(PORT)

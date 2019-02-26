'use strict'

const _ = require('lodash')
const axios = require('axios')

exports.sample = (arr, num) => {
  if (!num) return _.sample(arr)
  return _.shuffle(arr).slice(0, num)
}

exports.myIp = async () => {
  const { data } = await axios('https://api.ipify.org/?format=json')
  return data.ip
}

exports.wait = async (ms = 1000) =>
  new Promise(resolve => setTimeout(resolve, ms))

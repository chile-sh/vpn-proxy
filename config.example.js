const {
  IMAGE_NAME = 'vpnproxy',
  DOCKER_PREFIX = 'proxy'
} = process.env

module.exports = {
  imageName: IMAGE_NAME,
  dockerPrefix: DOCKER_PREFIX,
  reqLimit: 30,
  ovpns: [
    { id: 'default', enabled: false, maxClients: 5 },
    { id: 'nordvpn', enabled: false, maxClients: 6 },
    { id: 'pia', enabled: false, maxClients: 5 },
    { id: 'surfshark', enabled: false, maxClients: 6 }
  ],
  proxies: [
    {
      id: 'luminati',
      defaultConf: {
        user: 'user',
        password: 'password',
        port: 22225,
        host: 'zproxy.lum-superproxy.io',
        proto: 'http'
      },
      list: [
        { user: 'lum-customer-zone-zone1' },
        { user: 'lum-customer-zone-zone2' },
        { user: 'lum-customer-zone-zone3', password: 'override' }
      ]
    }
  ],
  proxy: {
    initialPort: 9000,
    initialRpcPort: 3000,
    port: 5000
  }
}

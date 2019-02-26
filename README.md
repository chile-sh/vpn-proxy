# vpn-proxy

HTTP proxies through VPNs.

This project was inspired by [ProxyDock](https://github.com/pry0cc/ProxyDock), which is a script that converts your OpenVPN files into proxies.

vpn-proxy is like ProxyDock, but on steroids. It creates a unique proxy server that
automatically switches ips between all your `ovpn` files.

This way, you can have a cheap Luminati-like proxy service (using VPN services like CyberGhost), useful for web-scraping, data analytics and more.

## Installation

> TODO

Set ovpn files password
```bash
$ VPN_USER=user
$ VPN_PASS=password
$ printf "$VPN_USER\n$VPN_PASS" > auth.txt
$ for f in $(cd ovpn; bash -c ls); do echo "auth-user-pass auth.txt" >> VPN/$f; done
```

# License
GNU General Public License v3.0

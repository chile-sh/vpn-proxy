#!/bin/bash

printf "$VPN_USER\n$VPN_PASS" > auth.txt
openvpn --config ovpn/$OVPN_FILE --auth-user-pass auth.txt

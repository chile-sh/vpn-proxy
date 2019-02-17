FROM alpine:3.7

EXPOSE 8118

RUN apk add --no-cache \
  git bash supervisor python iptables \
  openvpn privoxy

# OpenVPN
ADD config/openvpn/supervisord-openvpn.ini /etc/supervisor.d/supervisord-openvpn.ini
ADD config/openvpn/openvpn-start.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/openvpn-start.sh

# Privoxy
ADD config/privoxy/privoxy-start.sh /usr/local/bin/
ADD config/privoxy/supervisord-privoxy.ini /etc/supervisor.d/supervisord-privoxy.ini
RUN sed -i'' 's/127\.0\.0\.1:8118/0\.0\.0\.0:8118/' /etc/privoxy/config && \
    sed -i'' 's/enable-edit-actions\ 0/enable-edit-actions\ 1/' /etc/privoxy/config && \
    sed -i'' 's/#max-client-connections/max-client-connections/' /etc/privoxy/config && \
    sed -i'' 's/accept-intercepted-requests\ 0/accept-intercepted-requests\ 1/' /etc/privoxy/config
RUN chmod +r /etc/privoxy/config && chmod +x /usr/local/bin/privoxy-start.sh

CMD ["supervisord", "-n"]
VOLUME [ "/ovpn" ]

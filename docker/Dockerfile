FROM node:alpine

RUN apk add --no-cache supervisor openvpn privoxy

# supervisor
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisord.conf

# OpenVPN
ADD openvpn/supervisord-openvpn.ini /etc/supervisor.d/supervisord-openvpn.ini
ADD openvpn ./ovpn-server
RUN cd ovpn-server && yarn link
EXPOSE 3000

# Privoxy
ADD privoxy/privoxy-start.sh /usr/local/bin/
ADD privoxy/supervisord-privoxy.ini /etc/supervisor.d/supervisord-privoxy.ini
RUN sed -i'' 's/127\.0\.0\.1:8118/0\.0\.0\.0:8118/' /etc/privoxy/config && \
    sed -i'' 's/enable-edit-actions\ 0/enable-edit-actions\ 1/' /etc/privoxy/config && \
    sed -i'' 's/#max-client-connections/max-client-connections/' /etc/privoxy/config && \
    sed -i'' 's/accept-intercepted-requests\ 0/accept-intercepted-requests\ 1/' /etc/privoxy/config
RUN chmod +r /etc/privoxy/config && chmod +x /usr/local/bin/privoxy-start.sh
EXPOSE 8118

CMD ["supervisord", "-n"]
VOLUME [ "/ovpn" ]

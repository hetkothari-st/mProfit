#!/bin/sh
set -e
PORT=${PORT:-3000}
API_URL=${API_URL:-http://api:3001}
RESOLVER_RAW=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
# IPv6 addresses must be wrapped in brackets for nginx resolver directive.
case "$RESOLVER_RAW" in
  *:*) RESOLVER="[$RESOLVER_RAW]" ;;
  *)   RESOLVER="$RESOLVER_RAW" ;;
esac
sed -e "s|\${PORT}|$PORT|g" \
    -e "s|\${API_URL}|$API_URL|g" \
    -e "s|\${RESOLVER}|$RESOLVER|g" \
    /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'

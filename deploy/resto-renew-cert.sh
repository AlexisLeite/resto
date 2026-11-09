#!/bin/bash
set -euo pipefail
umask 077
cert_dir=/etc/nginx/tls/resto-tsnet
cert_name=devmachine.tail31d281.ts.net
renew_dir=$(mktemp -d "$cert_dir/.renew.XXXXXX")
trap 'rm -rf "$renew_dir"' EXIT
/usr/bin/tailscale cert --min-validity=720h --cert-file "$renew_dir/server.crt" --key-file "$renew_dir/server.key" "$cert_name"
openssl x509 -in "$renew_dir/server.crt" -noout -checkhost "$cert_name"
openssl x509 -in "$renew_dir/server.crt" -noout -checkend 86400
if cmp -s "$renew_dir/server.crt" "$cert_dir/server.crt" && cmp -s "$renew_dir/server.key" "$cert_dir/server.key"; then
    exit 0
fi
install -m 600 "$renew_dir/server.key" "$cert_dir/server.key"
install -m 644 "$renew_dir/server.crt" "$cert_dir/server.crt"
/usr/sbin/nginx -t
systemctl reload nginx

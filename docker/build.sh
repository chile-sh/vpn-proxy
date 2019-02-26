#!/bin/bash

export $(egrep -v '^#' ../.env | xargs)

docker build -t ${IMAGE_NAME:-vpnproxy} . --no-cache

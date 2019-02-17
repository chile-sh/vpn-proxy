#!/bin/bash

export $(egrep -v '^#' ../.env | xargs)

PREFIX=${DOCKER_PREFIX:-proxy}

docker build -t $PREFIX .

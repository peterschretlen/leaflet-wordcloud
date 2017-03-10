#!/usr/bin/env bash
set -e

NAME=demo
TAG=map_prototype
HUBID=gbipeter

echo "Building and pushing ${NAME}:${TAG}"

docker build -t ${HUBID}/${NAME}:${TAG} .
docker push ${HUBID}/${NAME}:${TAG}
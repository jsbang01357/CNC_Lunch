#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22.22 이상을 먼저 설치한 뒤 다시 실행해 주세요."
  read -r answer
  exit 1
fi
npm start

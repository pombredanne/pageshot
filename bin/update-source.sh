#!/usr/bin/env bash
set -e

if [ ! -e .git ] ; then
  echo "Error: $0 must be run from the root of the pageshot checkout"
  exit 3
fi

export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use 0.12
git pull
npm install
gulp lib-addon transforms
if [ -e ./pageshot.xpi ] ; then
  echo "Updating XPI"
  if [ ! -e ./pageshot.update.rdf ] ; then
    echo "Missing pageshot.update.rdf"
    exit 2
  fi
  mkdir -p server/dist/xpi
  mv ./pageshot.xpi server/dist/xpi/
  mv ./pageshot.update.rdf server/dist/xpi/
fi
mv server/dist-production server/dist-production.obsolete
mv server/dist server/dist-production
rm -r server/dist-production.obsolete
sudo service pageshot restart

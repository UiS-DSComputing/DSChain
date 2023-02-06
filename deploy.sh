#!/bin/bash

export NAME=$1
export VERSION=1
export SEQ=1

LABEL="${NAME}_${VERSION}"

echo 'bulid ...'
yarn build
mkdir -p build

echo "compile ..."
source $FABRIC_HOME/test-network/peer1-env.sh
peer lifecycle chaincode package ${NAME}_${VERSION}.tar.gz --path . --lang node --label "${NAME}_${VERSION}"
echo "install ..."
peer lifecycle chaincode install "${NAME}_${VERSION}.tar.gz"
peer lifecycle chaincode queryinstalled

source $FABRIC_HOME/test-network/peer2-env.sh
peer lifecycle chaincode install "${NAME}_${VERSION}.tar.gz"
peer lifecycle chaincode queryinstalled

echo "extract CC_PACKAGE_ID"
CC_PACKAGE_ID=`peer lifecycle chaincode queryinstalled --output json | jq -r --arg LABEL "$LABEL" '.installed_chaincodes | to_entries | map(select(.value.label == $LABEL)) | map(.value)[0].package_id'`
echo $CC_PACKAGE_ID

echo "approve for my org ..."
source $FABRIC_HOME/test-network/peer1-env.sh
peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --channelID mychannel --name ${NAME} --version $VERSION --package-id $CC_PACKAGE_ID --sequence $SEQ --tls --cafile "${FABRIC_HOME}/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
source $FABRIC_HOME/test-network/peer2-env.sh
peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --channelID mychannel --name ${NAME} --version $VERSION --package-id $CC_PACKAGE_ID --sequence $SEQ --tls --cafile "${FABRIC_HOME}/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

echo "check commit readiness ..."
peer lifecycle chaincode checkcommitreadiness --channelID mychannel --name ${NAME} --version $VERSION --sequence $SEQ --tls --cafile "${FABRIC_HOME}/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" --output json

# echo "commit..."
peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --channelID mychannel --name $NAME --version $VERSION --sequence $SEQ --tls --cafile "${FABRIC_HOME}/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" --peerAddresses localhost:7051 --tlsRootCertFiles "${FABRIC_HOME}/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" --peerAddresses localhost:9051 --tlsRootCertFiles "${FABRIC_HOME}/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

peer lifecycle chaincode querycommitted --channelID mychannel --name ${NAME} --cafile "${FABRIC_HOME}/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

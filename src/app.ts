/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from "@grpc/grpc-js";
import {
  connect,
  Contract,
  Identity,
  Signer,
  signers,
} from "@hyperledger/fabric-gateway";
import * as crypto from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { TextDecoder } from "util";

const channelName = envOrDefault("CHANNEL_NAME", "mychannel");
const chaincodeName = envOrDefault("CHAINCODE_NAME", "t8");
const mspId = envOrDefault("MSP_ID", "Org1MSP");

// Path to crypto materials.
const cryptoPath = envOrDefault(
  "CRYPTO_PATH",
  path.resolve(
    __dirname,
    "..",
    "..",
    "test-network",
    "organizations",
    "peerOrganizations",
    "org1.example.com"
  )
);
console.log("cryptoPath: ", cryptoPath);
// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
  "KEY_DIRECTORY_PATH",
  path.resolve(cryptoPath, "users", "User1@org1.example.com", "msp", "keystore")
);
console.log("keyDirectoryPath: ", keyDirectoryPath);
// Path to user certificate.
const certPath = envOrDefault(
  "CERT_PATH",
  path.resolve(
    cryptoPath,
    "users",
    "User1@org1.example.com",
    "msp",
    "signcerts",
    "User1@org1.example.com-cert.pem"
  )
);
console.log("certPath: ", certPath);

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
  "TLS_CERT_PATH",
  path.resolve(cryptoPath, "peers", "peer0.org1.example.com", "tls", "ca.crt")
);
console.log("tlsCertPath: ", tlsCertPath);
// Gateway peer endpoint.
const peerEndpoint = envOrDefault("PEER_ENDPOINT", "localhost:7051");

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault("PEER_HOST_ALIAS", "peer0.org1.example.com");

const utf8Decoder = new TextDecoder();
const assetId = `asset${Date.now()}`;

async function main(): Promise<void> {
  await displayInputParameters();

  // The gRPC client connection should be shared by all Gateway connections to this endpoint.
  const client = await newGrpcConnection();

  const gateway = connect({
    client,
    identity: await newIdentity(),
    signer: await newSigner(),
    // Default timeouts for different gRPC calls
    evaluateOptions: () => {
      return { deadline: Date.now() + 5000 }; // 5 seconds
    },
    endorseOptions: () => {
      return { deadline: Date.now() + 15000 }; // 15 seconds
    },
    submitOptions: () => {
      return { deadline: Date.now() + 5000 }; // 5 seconds
    },
    commitStatusOptions: () => {
      return { deadline: Date.now() + 60000 }; // 1 minute
    },
  });

  try {
    // Get a network instance representing the channel where the smart contract is deployed.
    const network = gateway.getNetwork(channelName);

    // Get the smart contract from the network.
    const contract = network.getContract(chaincodeName);

    // // Initialize a set of asset data on the ledger using the chaincode 'InitLedger' function.
    try {
      await init(contract);
    } catch (e) {}
    // // Return all the current assets on the ledger.
    await readAllOrgs(contract);

    try {
      await readOrg(contract, "Org1MSP");
    } catch (e) {}

    try {
      await readOrg(contract, "Org2MSP");
    } catch (e) {}

    // Access
    const WRITE = 0x001;
    const READ = 0x010;
    const DELETE = 0x100;
    try {
      await updateOrgAccess(contract, "Org2MSP", WRITE | READ);
    } catch (e) {}
    await readAllOrgs(contract);
    await readAllOrgKeys(contract);
    await addOrg(contract, "Org2MSP", WRITE);
    await readAllOrgKeys(contract);
    try {
      await updateOrgAccess(contract, "Org2MSP", WRITE | READ);
    } catch (e) {}
    await readAllOrgs(contract);
    await removeOrg(contract, "Org2MSP");
    await readAllOrgs(contract);
  } finally {
    gateway.close();
    client.close();
  }
}

main().catch((error) => {
  console.error("******** FAILED to run the application:", error);
  process.exitCode = 1;
});

async function newGrpcConnection(): Promise<grpc.Client> {
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    "grpc.ssl_target_name_override": peerHostAlias,
  });
}

async function newIdentity(): Promise<Identity> {
  const credentials = await fs.readFile(certPath);
  return { mspId, credentials };
}

async function newSigner(): Promise<Signer> {
  const files = await fs.readdir(keyDirectoryPath);
  const keyPath = path.resolve(keyDirectoryPath, files[0]);
  const privateKeyPem = await fs.readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

/**
 * This type of transaction would typically only be run once by an application the first time it was started after its
 * initial deployment. A new version of the chaincode deployed later would likely not need to run an "init" function.
 */
async function init(contract: Contract): Promise<void> {
  console.log("\n--> Init");

  // await contract.submitTransaction("InitLedger");
  await contract.submitTransaction("Init");

  console.log("*** Transaction committed successfully");
}

/**
 * Evaluate a transaction to query ledger state.
 */
async function readAllOrgs(contract: Contract): Promise<void> {
  console.log("\n--> ReadAllOrgs");

  const resultBytes = await contract.evaluateTransaction("ReadAllOrgs");

  const resultJson = utf8Decoder.decode(resultBytes);
  const result = JSON.parse(resultJson);
  console.log("*** Result:", result);
}

async function readOrg(contract: Contract, orgId: string): Promise<void> {
  console.log("\n--> ReadOrg");
  const resultBytes = await contract.evaluateTransaction("ReadOrg", orgId);
  const resultJson = utf8Decoder.decode(resultBytes);
  console.log("*** Result:", resultJson);
}

async function isAdmin(contract: Contract): Promise<void> {
  console.log("\n--> ReadOrg");
  const resultBytes = await contract.evaluateTransaction("IsAdmin");
  const resultJson = utf8Decoder.decode(resultBytes);
  console.log("*** Result:", resultJson);
}

async function checkOrgAccess(
  contract: Contract,
  orgId: string
): Promise<void> {
  console.log("\n--> CheckOrgAccess");
  const resultBytes = await contract.evaluateTransaction(
    "checkOrgAccess",
    orgId
  );
  const resultJson = utf8Decoder.decode(resultBytes);
  console.log("*** Result:", resultJson);
}

async function updateOrgAccess(
  contract: Contract,
  orgId: string,
  access: number
): Promise<void> {
  console.log("\n--> UpdateOrgAccess");
  await contract.submitTransaction("UpdateOrgAccess", orgId, `${access}`);
}

async function addOrg(
  contract: Contract,
  orgId: string,
  access: number
): Promise<void> {
  console.log("\n--> AddOrg");
  await contract.submitTransaction("AddOrg", orgId, `${access}`);
}
async function removeOrg(contract: Contract, orgId: string): Promise<void> {
  console.log("\n--> RemoveOrg");
  await contract.submitTransaction("RemoveOrg", orgId);
}
async function readAllOrgKeys(contract: Contract): Promise<void> {
  console.log("\n--> ReadAllOrgKeys");
  const resultBytes = await contract.evaluateTransaction("ReadAllOrgKeys");
  const resultJson = utf8Decoder.decode(resultBytes);
  console.log("*** Result:", resultJson);
}

function envOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
async function displayInputParameters(): Promise<void> {
  console.log(`channelName:       ${channelName}`);
  console.log(`chaincodeName:     ${chaincodeName}`);
  console.log(`mspId:             ${mspId}`);
  console.log(`cryptoPath:        ${cryptoPath}`);
  console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
  console.log(`certPath:          ${certPath}`);
  console.log(`tlsCertPath:       ${tlsCertPath}`);
  console.log(`peerEndpoint:      ${peerEndpoint}`);
  console.log(`peerHostAlias:     ${peerHostAlias}`);
}

/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dotenv from "dotenv";
dotenv.config();

import express, { Express, Request, Response } from "express";

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

const utf8Decoder = new TextDecoder();

const WRITE = 0x001;
const READ = 0x010;
const DELETE = 0x100;

class Controller {
  channelName: string = envOrDefault("CHANNEL_NAME", "mychannel");
  chaincodeName: string = envOrDefault("CHAINCODE_NAME", "test");
  mspId: string= envOrDefault("MSP_ID", "Org1MSP");
  cryptoPath: string = envOrDefault(
    "CRYPTO_PATH",
    path.resolve(__dirname,
                 "..",
                 "..",
                 "test-network",
                 "organizations",
                 "peerOrganizations",
                 "org1.example.com"
                ));
  keyDirectoryPath: string = envOrDefault(
    "KEY_DIRECTORY_PATH",
    path.resolve(this.cryptoPath, "users", "User1@org1.example.com", "msp", "keystore"));
  // Path to user certificate.
  certPath: string = envOrDefault(
    "CERT_PATH",
    path.resolve(this.cryptoPath,
                 "users",
                 "User1@org1.example.com",
                 "msp",
                 "signcerts",
                 "User1@org1.example.com-cert.pem"
                ));
  // Path to peer tls certificate.
  tlsCertPath: string = envOrDefault(
    "TLS_CERT_PATH",
    path.resolve(this.cryptoPath, "peers", "peer0.org1.example.com", "tls", "ca.crt")
  );
  // Gateway peer endpoint.
  peerEndpoint: string = envOrDefault("PEER_ENDPOINT", "localhost:7051");
  // Gateway peer SSL host name override.
  peerHostAlias: string = envOrDefault("PEER_HOST_ALIAS", "peer0.org1.example.com");

  contract: Contract | undefined | null;
  constructor() {
  }

  async getInputParameters() {
    return {
      channelName: this.channelName,
      chaincodeName: this.chaincodeName,
      cryptoPath: this.cryptoPath,
      keyDirectoryPath: this.keyDirectoryPath,
      certPath: this.certPath,
      tlsCertPath: this.tlsCertPath,
      peerEndpoint: this.peerEndpoint,
      peerHostAlias: this.peerHostAlias,
    };
  }
  async newGrpcConnection(): Promise<grpc.Client> {
    const tlsRootCert = await fs.readFile(this.tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(this.peerEndpoint, tlsCredentials, {
      "grpc.ssl_target_name_override": this.peerHostAlias,
    });
  }
  async newIdentity(): Promise<Identity> {
    const credentials = await fs.readFile(this.certPath);
    return { mspId: this.mspId, credentials };
  }
  async newSigner(): Promise<Signer> {
    const files = await fs.readdir(this.keyDirectoryPath);
    const keyPath = path.resolve(this.keyDirectoryPath, files[0]);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
  }
  async init() {
    const client = await this.newGrpcConnection();

    const gateway = connect({
      client,
      identity: await this.newIdentity(),
      signer: await this.newSigner(),
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

    // Get a network instance representing the channel where the smart contract is deployed.
    const network = gateway.getNetwork(this.channelName);

    // Get the smart contract from the network.
    this.contract = network.getContract(this.chaincodeName);
    return this.contract;
  }

  toJson(payload: string) {
    return JSON.parse(payload);
  }

  async contractCall(funcName: string, args: Array<any>) {
    await this.contract?.submitTransaction(funcName, ...args);
  }
  async contractQuery(funcName: string, args: Array<any>) {
    const resultBytes = await this.contract?.evaluateTransaction(funcName, ...args);
    const resultJson = utf8Decoder.decode(resultBytes);
    console.log(`${funcName}: ${resultJson}`);
    return this.toJson(resultJson);
  }

  // WRITE
  async Init(): Promise<void> {
    await this.contract?.submitTransaction("Init");
  }

  async UpdateOrgAccess(
    orgId: string,
    access: number
  ): Promise<void> {
    await this.contract?.submitTransaction("UpdateOrgAccess", orgId, `${access}`);
  }

  async AddOrg(
    orgId: string,
    access: number
  ): Promise<void> {
    await this.contract?.submitTransaction("AddOrg", orgId, `${access}`);
  }
  async RemoveOrg(orgId: string): Promise<void> {
    await this.contract?.submitTransaction("RemoveOrg", orgId);
  }
  // READ
  async ReadAllOrgs(): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction("ReadAllOrgs");
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }

  async ReadOrg(orgId: string): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction("ReadOrg", orgId);
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }

  async IsAdmin(): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction("IsAdmin");
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }

  async CheckOrgAccess(
    orgId: string
  ): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction(
      "CheckOrgAccess",
      orgId
    );
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }

  async CheckUserAccess(
    orgId: string,
    userId: string
  ): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction(
      "CheckUserAccess",
      orgId,
      userId,
    );
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }

  async ReadAllOrgKeys(): Promise<any> {
    const resultBytes = await this.contract?.evaluateTransaction("ReadAllOrgKeys");
    const resultJson = utf8Decoder.decode(resultBytes);
    return this.toJson(resultJson);
  }
}

const app: Express = express();
const PORT = process.env.PORT || 18000;

app.use(express.json());
const controller = new Controller();

app.listen(PORT, async () => {
  await controller.init();
  console.log(`Server is running at ::${PORT}`);
});

app.get("/health", async (req, res) => {
  try {
    return res.json({status: 'success'});
  } catch (err) {
    return res.json({status: 'fail'});
  }
});

app.get("/inputParameters", async (req, res) => {
  try {
    const ret = await controller.getInputParameters();
    return res.json({status: 'success', ...ret});
  } catch (err) {
    return res.json({status: 'fail'});
  }
});

app.get('/contractQuery', async (req, res) => {
  try {
    const {funcName, args = []} = req.query;
    console.log('funName:', funcName);
    console.log('args:', args, typeof args);
    // @ts-ignore
    const ret = await controller.contractQuery(funcName as string, JSON.parse(args) as Array<any>);
    const resp = {};
    // @ts-ignore
    resp[funcName] = ret;
    return res.json({status: 'success', ...resp});
  } catch (err) {
    console.log(err);
    return res.json({status: 'fail', msg: err?.details[0]?.message});
  }
});

app.post('/contractCall', async (req, res) => {
  try {
    const {funcName, args = []} = req.body;
    console.log('funName:', funcName);
    console.log('args:', args, typeof args);
    // @ts-ignore
    await controller.contractCall(funcName as string, args as Array<string>);
    return res.json({status: 'success'});
  } catch (err) {
    console.log(err);
    return res.json({status: 'fail', msg: err?.details[0]?.message});
  }
});
function envOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

import { PeaqSDK } from "./index";

import { config } from "dotenv";
config();

if (
  !process.env.MACHINE_STATION_FACTORY_CONTRACT_ADDRESS ||
  !process.env.CONTRACT_OWNER_PRIVATE_KEY ||
  !process.env.MACHINE_OWNER_PRIVATE_KEY ||
  !process.env.SEED_PHRASE ||
  !process.env.API_KEY ||
  !process.env.PROJECT_API_KEY ||
  !process.env.PEAQ_SERVICE_URL ||
  !process.env.RPC_URL ||
  !process.env.CHAIN_ID
) {
  throw new Error("Environment variables not set");
}

const ENVS: { [key: string]: string } = {
  RPC_URL: process.env.RPC_URL,
  CHAIN_ID: process.env.CHAIN_ID,
  MACHINE_STATION_FACTORY_CONTRACT_ADDRESS:
    process.env.MACHINE_STATION_FACTORY_CONTRACT_ADDRESS,
  CONTRACT_OWNER_PRIVATE_KEY: process.env.CONTRACT_OWNER_PRIVATE_KEY,
  MACHINE_OWNER_PRIVATE_KEY: process.env.MACHINE_OWNER_PRIVATE_KEY,
  PEAQ_SERVICE_URL: process.env.PEAQ_SERVICE_URL,
  API_KEY: process.env.API_KEY,
  PROJECT_API_KEY: process.env.PROJECT_API_KEY,
  SEED_PHRASE: process.env.SEED_PHRASE,
};

const createDid = async () => {
  console.log("Deploy Machine and create DID");

  const sdk = new PeaqSDK({
    rpcUrl: ENVS.RPC_URL,
    chainId: parseInt(ENVS.CHAIN_ID),
    machineStationFactoryContractAddress:
      ENVS.MACHINE_STATION_FACTORY_CONTRACT_ADDRESS,
    ownerPrivateKey: ENVS.CONTRACT_OWNER_PRIVATE_KEY,
    machineOwnerPrivateKey: ENVS.MACHINE_OWNER_PRIVATE_KEY,
    serviceUrl: ENVS.PEAQ_SERVICE_URL,
    apiKey: ENVS.API_KEY,
    projectApiKey: ENVS.PROJECT_API_KEY,
    depinSeed: ENVS.SEED_PHRASE,
  });

  // 1. Deploy a machine smart account
  console.log("Deploying machine smart account...");
  const machineAddress = await sdk.machineStationFactory.deploySmartAccount();

  console.log(`Machine deployed at: ${machineAddress}`);

  const email = "gonzalo@thinkanddev.com";
  const tag = "TEST";

  // 2. Add DID attribute
  console.log("Adding DID attribute to machine...");
  const didReceipt = await sdk.identity.addAttribute({
    didAddress: machineAddress,
    email,
    tag,
  });

  console.log(`DID created. Transaction hash: ${didReceipt?.hash}`);

  return {
    machineAddress,
    didTransactionHash: didReceipt?.hash,
  };
};

const storageData = async () => {
  console.log("Store Data");

  const sdk = new PeaqSDK({
    rpcUrl: ENVS.RPC_URL,
    chainId: parseInt(ENVS.CHAIN_ID),
    machineStationFactoryContractAddress:
      ENVS.MACHINE_STATION_FACTORY_CONTRACT_ADDRESS,
    ownerPrivateKey: ENVS.CONTRACT_OWNER_PRIVATE_KEY,
    machineOwnerPrivateKey: ENVS.MACHINE_OWNER_PRIVATE_KEY,
    serviceUrl: ENVS.PEAQ_SERVICE_URL,
    apiKey: ENVS.API_KEY,
    projectApiKey: ENVS.PROJECT_API_KEY,
    depinSeed: ENVS.SEED_PHRASE,
  });

  const email = "test@example.com";
  const tag = "TEST-SDK-STORAGE";
  const tags = [tag, "20_TEST-SDK-STORAGE", "30_TEST-SDK-STORAGE"];

  console.log("Storing data...");
  const receipt = await sdk.storage.storeData({
    customTag: tag,
    email,
    tag,
    tags,
  });

  console.log(`Data stored. Transaction hash: ${receipt?.hash}`);
  console.log("Test completed successfully");

  return {
    storageTransactionHash: receipt?.hash,
  };
};

const main = async () => {
  const results = {
    machine: await createDid(),
    storage: await storageData(),
  };
  console.log("All tasks completed successfully");
  console.log("Tasks results:", JSON.stringify(results, null, 2));
};

main();

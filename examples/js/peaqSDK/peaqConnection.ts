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

const createDid = async (email, tag, didAddress: string) => {
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

  const didReceipt = await sdk.identity.addAttribute({
    didAddress,
    email,
    tag,
  });

  return didReceipt?.hash;
};

const storageData = async (email, tag, tags) => {
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

  const receipt = await sdk.storage.storeData({
    customTag: tag,
    email,
    tag,
    tags,
  });

  return receipt?.hash;
};

const deploySmartAccount = async () => {
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

  const machineAddress = await sdk.machineStationFactory.deploySmartAccount();
  return machineAddress;
};

const main = async () => {
  const email = "test@example.com";
  const tag = "TEST-SDK-STORAGE";
  const tags = [tag, "20_TEST-SDK-STORAGE", "30_TEST-SDK-STORAGE"];

  console.log("");
  console.log("Deploying machine smart account...");
  const machineAddress = await deploySmartAccount();
  console.log(`Machine smart account deployed at: ${machineAddress}`);

  console.log("");
  console.log("Adding DID attribute to machine...");
  const didTransactionHash = await createDid(email, tag, machineAddress);
  console.log(`DID created. Transaction hash: ${didTransactionHash}`);

  console.log("");
  console.log("Storing data...");
  const storageTransactionHash = await storageData(email, tag, tags);
  console.log(`Data stored. Transaction hash: ${storageTransactionHash}`);

  console.log("");
  console.log("All tasks completed successfully");
};

main();

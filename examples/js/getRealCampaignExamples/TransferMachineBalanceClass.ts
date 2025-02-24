import { AbiItem } from "web3-utils";
import { ethers } from "ethers";
import { abi } from "../MachineStationFactoryABI.json";
import { config } from "dotenv";
config();

const rpcURL = process.env.RPC_URL;
const chainID = process.env.CHAIN_ID;

if (!rpcURL || !chainID) {
  throw new Error("RPC URL or Chain ID not provided");
}

// Contract details
const MachineStationFactoryContractAddress =
  process.env.MACHINE_STATION_FACTORY_CONTRACT_ADDRESS;

if (!MachineStationFactoryContractAddress) {
  throw new Error("Machine Station Factory Contract Address not provided");
}

const contract = new ethers.ContractFactory(
  abi as AbiItem[],
  MachineStationFactoryContractAddress
);

// Wallet details
const ownerPrivateKey = process.env.CONTRACT_OWNER_PRIVATE_KEY;
const machineOwnerPrivateKey = process.env.MACHINE_OWNER_PRIVATE_KEY;

if (!ownerPrivateKey || !machineOwnerPrivateKey) {
  throw new Error("Owner or Machine Owner Private Key not provided");
}

const provider = new ethers.JsonRpcProvider(rpcURL);
const ownerAccount = new ethers.Wallet(ownerPrivateKey, provider);
const machineOwnerAccount = new ethers.Wallet(machineOwnerPrivateKey, provider);

class TransferMachineBalanceClass {
  async executeTransfer(machineAddress: string, recipientAddress: string) {
    let nonce = this.getRandomNonce();

    // Get signatures from both the station owner and machine owner
    const ownerSignature = await this.ownerSignTypedData(
      machineAddress,
      recipientAddress,
      nonce
    );
    console.log("Owner signature: ", ownerSignature);

    const machineOwnerSignature = await this.machineOwnerSignTypedData(
      machineAddress,
      recipientAddress,
      nonce
    );
    console.log("Machine owner signature: ", machineOwnerSignature);

    if (!ownerSignature || !machineOwnerSignature) {
      throw new Error("Invalid signature");
    }

    await this.executeMachineTransferBalance(
      machineAddress,
      recipientAddress,
      nonce,
      ownerSignature,
      machineOwnerSignature
    );
  }

  async ownerSignTypedData(
    machineAddress: string,
    recipientAddress: string,
    nonce: BigInt
  ): Promise<string> {
    const domain = {
      name: "MachineStationFactory",
      version: "1",
      chainId: chainID,
      verifyingContract: MachineStationFactoryContractAddress,
    };

    const types = {
      ExecuteMachineTransferBalance: [
        { name: "machineAddress", type: "address" },
        { name: "recipientAddress", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      machineAddress: machineAddress,
      recipientAddress: recipientAddress,
      nonce: nonce,
    };

    return await ownerAccount.signTypedData(domain, types, message);
  }

  async machineOwnerSignTypedData(
    machineAddress: string,
    recipientAddress: string,
    nonce: BigInt
  ): Promise<string> {
    // Note: This signature is used by the Machine Smart Account internally
    // The domain and types should match what the Machine Smart Account expects
    const domain = {
      name: "MachineSmartAccount",
      version: "1",
      chainId: chainID,
      verifyingContract: machineAddress,
    };

    const types = {
      TransferMachineBalance: [
        { name: "recipientAddress", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      recipientAddress: recipientAddress,
      nonce: nonce,
    };

    return await machineOwnerAccount.signTypedData(domain, types, message);
  }

  async executeMachineTransferBalance(
    machineAddress: string,
    recipientAddress: string,
    nonce: BigInt,
    ownerSignature: string,
    machineOwnerSignature: string
  ): Promise<string | undefined> {
    const methodData = contract.interface.encodeFunctionData(
      "executeMachineTransferBalance",
      [
        machineAddress,
        recipientAddress,
        nonce,
        ownerSignature,
        machineOwnerSignature,
      ]
    );

    const txResponse = await this.sendTransaction(methodData);
    const receipt = await txResponse.wait();

    console.log("Execute Machine Transfer Balance Tx executed:", receipt?.hash);
    return receipt?.hash;
  }

  getRandomNonce(): BigInt {
    const now = BigInt(Date.now());
    const randomPart = BigInt(Math.floor(Math.random() * 1e18));
    return now * randomPart;
  }

  // Helper function to sign and send transactions
  async sendTransaction(
    methodData: string
  ): Promise<ethers.TransactionResponse> {
    const tx = {
      to: MachineStationFactoryContractAddress,
      data: methodData,
    };

    return await ownerAccount.sendTransaction(tx);
  }
}

// Example usage
const executeTransfer = async () => {
  const executor = new TransferMachineBalanceClass();

  // Replace with actual machine address and recipient address
  const machineAddress = process.env.MACHINE_ADDRESS;
  const recipientAddress =
    process.env.RECIPIENT_ADDRESS || ownerAccount.address;

  if (!machineAddress || !recipientAddress) {
    throw new Error("Machine address or recipient address not provided");
  }

  try {
    await executor.executeTransfer(machineAddress, recipientAddress);
  } catch (error) {
    console.error("Error executing machine transfer balance: ", error);
  }
};

executeTransfer().catch(console.error);

import { ethers } from "ethers";
import { Keyring } from "@polkadot/keyring";
import { u8aToHex, stringToU8a } from "@polkadot/util";
import { mnemonicGenerate, cryptoWaitReady } from "@polkadot/util-crypto";
import axios from "axios";
import { Sdk } from "@peaq-network/sdk";
import { CustomDocumentFields } from "@peaq-network/sdk/src/modules/did";

import { abi } from "../MachineStationFactoryABI.json";

/**
 * Configuration for PeaqSDK
 */
export interface PeaqSDKConfig {
  // Network configuration
  rpcUrl: string;
  chainId: number;
  contractAddress: string;

  // Authentication
  ownerPrivateKey: string;
  machineOwnerPrivateKey?: string;

  // Service endpoints and keys
  serviceUrl: string;
  apiKey: string;
  projectApiKey: string;

  // Optional DePIN seed for DID operations
  depinSeed?: string;
}

/**
 * Main SDK class for interacting with the Peaq network
 */
export class PeaqSDK {
  private provider: ethers.JsonRpcProvider;
  private ownerAccount: ethers.Wallet;
  private machineOwnerAccount?: ethers.Wallet;
  private contract: ethers.Contract;
  private abiCoder: ethers.AbiCoder;
  private config: PeaqSDKConfig;

  /**
   * Create a new PeaqSDK instance
   */
  constructor(config: PeaqSDKConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.ownerAccount = new ethers.Wallet(
      config.ownerPrivateKey,
      this.provider
    );

    if (config.machineOwnerPrivateKey) {
      this.machineOwnerAccount = new ethers.Wallet(
        config.machineOwnerPrivateKey,
        this.provider
      );
    }

    this.contract = new ethers.Contract(
      config.contractAddress,
      abi,
      this.ownerAccount
    );

    this.abiCoder = new ethers.AbiCoder();
  }

  /**
   * Machine operations
   */
  public machine = {
    /**
     * Deploy a new machine smart account
     */
    deploySmartAccount: async (params?: {
      machineOwnerAddress?: string;
    }): Promise<string> => {
      // Use provided address or default to the machineOwnerAccount address
      const machineOwner =
        params?.machineOwnerAddress || this.machineOwnerAccount?.address;

      if (!machineOwner) {
        throw new Error("Machine owner address is required");
      }

      const nonce = this.getRandomNonce();

      // Sign the deployment transaction
      const signature = await this.ownerSignTypedDataDeployMachineSmartAccount(
        machineOwner,
        nonce
      );

      try {
        // Encode the method call data
        const methodData = this.contract.interface.encodeFunctionData(
          "deployMachineSmartAccount",
          [machineOwner, nonce, signature]
        );

        // Send the transaction and get the receipt
        const txResponse = await this.sendTransaction(methodData);
        const receipt = await txResponse.wait();

        // Get the machine address from the event logs
        const logs = receipt?.logs;
        const eventSignature = ethers.id(
          "MachineSmartAccountDeployed(address)"
        );
        const log = logs?.find((log) => log.topics[0] === eventSignature);

        if (!log) {
          throw new Error(
            "MachineSmartAccountDeployed event not found in logs"
          );
        }

        // Extract the deployed address from the event log
        const rawDeployedAddress = log.topics[1];
        const deployedAddress = ethers.getAddress(
          `0x${rawDeployedAddress.slice(26)}`
        );

        return deployedAddress;
      } catch (error: any) {
        this.handleTransactionError(error);
        throw error;
      }
    },

    /**
     * Execute a transaction on a machine smart account
     */
    executeTransaction: async (params: {
      machineAddress: string;
      target: string;
      data: string;
    }): Promise<ethers.TransactionReceipt | null> => {
      const { machineAddress, target, data } = params;
      const nonce = this.getRandomNonce();

      if (!this.machineOwnerAccount) {
        throw new Error(
          "Machine owner private key is required for this operation"
        );
      }

      // Get signatures from both owner and machine owner
      const ownerSignature =
        await this.ownerSignTypedDataExecuteMachineTransaction(
          machineAddress,
          target,
          data,
          nonce
        );

      const machineOwnerSignature =
        await this.machineOwnerSignTypedDataExecuteMachine(
          machineAddress,
          target,
          data,
          nonce
        );

      try {
        // Encode the method call data
        const methodData = this.contract.interface.encodeFunctionData(
          "executeMachineTransaction",
          [
            machineAddress,
            target,
            data,
            nonce,
            ownerSignature,
            machineOwnerSignature,
          ]
        );

        // Send the transaction and get the receipt
        const txResponse = await this.sendTransaction(methodData);
        return await txResponse.wait();
      } catch (error: any) {
        this.handleTransactionError(error);
        throw error;
      }
    },
  };

  /**
   * Identity (DID) operations
   */
  public identity = {
    /**
     * Add a DID attribute to a machine
     */
    addAttribute: async (params: {
      machineAddress: string;
      didAddress: string;
      email: string;
      tag: string;
    }): Promise<ethers.TransactionReceipt | null> => {
      const { machineAddress, didAddress, email, tag } = params;
      const target = "0x0000000000000000000000000000000000000800";

      // Create email signature
      const emailSignature = await this.createEmailSignature({
        email,
        did_address: didAddress,
        tag,
      });

      // Generate DID document hash
      const didValue = await this.generateDIDHash(
        this.machineOwnerAccount?.address || "",
        didAddress,
        emailSignature
      );

      // Prepare function call data
      const addAttributeFunctionSignature =
        "addAttribute(address,bytes,bytes,uint32)";
      const createDidFunctionSelector = ethers
        .keccak256(ethers.toUtf8Bytes(addAttributeFunctionSignature))
        .substring(0, 10);

      const didName = `did:peaq:${machineAddress}#test`;
      const name = ethers.hexlify(ethers.toUtf8Bytes(didName));
      const didVal = ethers.hexlify(ethers.toUtf8Bytes(didValue));
      const validityFor = 0;

      const calldataParams = this.abiCoder.encode(
        ["address", "bytes", "bytes", "uint32"],
        [machineAddress, name, didVal, validityFor]
      );

      const calldata = calldataParams.replace("0x", createDidFunctionSelector);

      // Execute the transaction using the machine
      return await this.machine.executeTransaction({
        machineAddress,
        target,
        data: calldata,
      });
    },

    /**
     * Create machine with DID in one operation
     */
    createMachineWithDID: async (params: {
      email: string;
      tag: string;
      didAddress: string;
      machineOwnerAddress?: string;
    }): Promise<{
      machineAddress: string;
      transactionHash: string | undefined;
    }> => {
      // Step 1: Deploy machine
      const machineAddress = await this.machine.deploySmartAccount({
        machineOwnerAddress: params.machineOwnerAddress,
      });

      // Step 3: Add attribute
      const receipt = await this.identity.addAttribute({
        machineAddress,
        didAddress: params.didAddress,
        email: params.email,
        tag: params.tag,
      });

      return {
        machineAddress,
        transactionHash: receipt?.hash,
      };
    },
  };

  /**
   * Storage operations
   */
  public storage = {
    /**
     * Store data in peaq storage
     */
    storeData: async (params: {
      itemType?: string;
      email: string;
      tag: string;
      tags?: string[];
    }): Promise<ethers.TransactionReceipt | null> => {
      const { email, tag, tags } = params;
      const nonce = this.getRandomNonce();
      const target = "0x0000000000000000000000000000000000000801";

      // Generate item type if not provided
      const itemType = params.itemType || `${tag}-${Date.now()}`;

      // Register item type and tags
      await this.registerItemTypeAndTags({
        item_type: itemType,
        email,
        tag,
        tags: tags || [tag],
      });

      // Prepare function call data
      const addItemFunctionSignature = "addItem(bytes,bytes)";
      const addItemFunctionSelector = ethers
        .keccak256(ethers.toUtf8Bytes(addItemFunctionSignature))
        .substring(0, 10);

      const itemTypeHex = ethers.hexlify(ethers.toUtf8Bytes(itemType));
      const item = "TASK-COMPLETED";
      const itemHex = ethers.hexlify(ethers.toUtf8Bytes(item));

      const calldataParams = this.abiCoder.encode(
        ["bytes", "bytes"],
        [itemTypeHex, itemHex]
      );

      const calldata = calldataParams.replace("0x", addItemFunctionSelector);

      try {
        // Get signature
        const ownerSignature = await this.ownerSignTypedDataExecuteTransaction(
          target,
          calldata,
          nonce
        );

        // Encode the method call data
        const methodData = this.contract.interface.encodeFunctionData(
          "executeTransaction",
          [target, calldata, nonce, ownerSignature]
        );

        // Send the transaction and get the receipt
        const txResponse = await this.sendTransaction(methodData);
        return await txResponse.wait();
      } catch (error: any) {
        this.handleTransactionError(error);
        throw error;
      }
    },
  };

  // PRIVATE HELPER METHODS

  /**
   * Generate a random nonce
   */
  private getRandomNonce(): bigint {
    const now = BigInt(Date.now());
    const randomPart = BigInt(Math.floor(Math.random() * 1e18));
    return now * randomPart;
  }

  /**
   * Sign and send a transaction
   */
  private async sendTransaction(
    methodData: string
  ): Promise<ethers.TransactionResponse> {
    const tx = {
      to: this.config.contractAddress,
      data: methodData,
    };

    return await this.ownerAccount.sendTransaction(tx);
  }

  /**
   * Handle transaction errors
   */
  private handleTransactionError(error: any): void {
    console.error("Transaction failed. Error:", error);

    // Check if the error is a revert error with data
    if (error.data) {
      try {
        // Decode the revert error using the contract's ABI
        const iface = new ethers.Interface(this.contract.interface.fragments);
        const decodedError = iface.parseError(error.data);

        console.log("Decoded Error:", decodedError);
      } catch (decodeError) {
        console.error("Failed to decode error data:", decodeError);
      }
    }
  }

  /**
   * Sign typed data for deploying machine smart account
   */
  private async ownerSignTypedDataDeployMachineSmartAccount(
    machineOwner: string,
    nonce: bigint
  ): Promise<string> {
    const domain = {
      name: "MachineStationFactory",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: this.config.contractAddress,
    };

    const types = {
      DeployMachineSmartAccount: [
        { name: "machineOwner", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      machineOwner: machineOwner,
      nonce: nonce,
    };

    return await this.ownerAccount.signTypedData(domain, types, message);
  }

  /**
   * Sign typed data for machine owner to execute machine
   */
  private async machineOwnerSignTypedDataExecuteMachine(
    machineAddress: string,
    target: string,
    data: string,
    nonce: bigint
  ): Promise<string> {
    if (!this.machineOwnerAccount) {
      throw new Error(
        "Machine owner private key is required for this operation"
      );
    }

    const domain = {
      name: "MachineSmartAccount",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: machineAddress,
    };

    const types = {
      Execute: [
        { name: "target", type: "address" },
        { name: "data", type: "bytes" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      target: target,
      data: data,
      nonce: nonce,
    };

    return await this.machineOwnerAccount.signTypedData(domain, types, message);
  }

  /**
   * Sign typed data for owner to execute machine transaction
   */
  private async ownerSignTypedDataExecuteMachineTransaction(
    machineAddress: string,
    target: string,
    data: string,
    nonce: bigint
  ): Promise<string> {
    const domain = {
      name: "MachineStationFactory",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: this.config.contractAddress,
    };

    const types = {
      ExecuteMachineTransaction: [
        { name: "machineAddress", type: "address" },
        { name: "target", type: "address" },
        { name: "data", type: "bytes" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      machineAddress: machineAddress,
      target: target,
      data: data,
      nonce: nonce,
    };

    return await this.ownerAccount.signTypedData(domain, types, message);
  }

  /**
   * Sign typed data for executing a regular transaction
   */
  private async ownerSignTypedDataExecuteTransaction(
    target: string,
    data: string,
    nonce: bigint
  ): Promise<string> {
    const domain = {
      name: "MachineStationFactory",
      version: "1",
      chainId: this.config.chainId,
      verifyingContract: this.config.contractAddress,
    };

    const types = {
      ExecuteTransaction: [
        { name: "target", type: "address" },
        { name: "data", type: "bytes" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const message = {
      target: target,
      data: data,
      nonce: nonce,
    };

    return await this.ownerAccount.signTypedData(domain, types, message);
  }

  /**
   * Generate DID hash
   */
  private async generateDIDHash(
    machineOwnerAddress: string,
    didAddress: string,
    emailSignature: string
  ): Promise<string> {
    if (!this.config.depinSeed) {
      throw new Error("DePIN seed is required for DID operations");
    }

    const keyring = new Keyring({ type: "sr25519" });

    // Creating key pair for the DePin from seed
    const DePinPair = keyring.addFromUri(this.config.depinSeed);

    // Generating signature using DePinSeed and DIDSubjectPair's address as data
    const issuerSignature = u8aToHex(DePinPair.sign(stringToU8a(didAddress)));

    const customFields: CustomDocumentFields = {
      prefix: "peaq",
      controller: "5FEw7aWmqcnWDaMcwjKyGtJMjQfqYGxXmDWKVfcpnEPmUM7q",
      signature: {
        type: "Ed25519VerificationKey2020",
        issuer: DePinPair?.address,
        hash: issuerSignature,
      },
      services: [
        {
          id: "#emailSignature",
          type: "emailSignature",
          data: emailSignature,
        },
        {
          id: "#owner",
          type: "owner",
          data: machineOwnerAddress,
        },
      ],
    };

    const did_hash = await Sdk.generateDidDocument({
      address: didAddress,
      customDocumentFields: customFields,
    });

    return did_hash.value;
  }

  /**
   * Create email signature
   */
  private async createEmailSignature(data: any): Promise<string> {
    try {
      const response = await axios.post(
        `${this.config.serviceUrl}/v1/sign`,
        data,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            APIKEY: this.config.apiKey,
            "P-APIKEY": this.config.projectApiKey,
          },
        }
      );

      return response.data.signature;
    } catch (error) {
      console.error("Error creating email signature", error);
      throw error;
    }
  }

  /**
   * Register item type and tags
   */
  private async registerItemTypeAndTags(data: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.config.serviceUrl}/v1/data/store`,
        data,
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            APIKEY: this.config.apiKey,
            "P-APIKEY": this.config.projectApiKey,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Error registering itemType and tags", error);
      throw error;
    }
  }
}

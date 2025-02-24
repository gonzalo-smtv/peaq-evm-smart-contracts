import { AbiItem } from "web3-utils";
import { AbiCoder, ethers } from "ethers";
import axios from "axios";

import { abi } from "../MachineStationFactoryABI.json";
import { config } from "dotenv";
config();

const rpcURL = "https://erpc-async.agung.peaq.network";
const chainID = 9990;

// Contract details
const MachineStationFactoryContractAddress: string =
  "0xc1C79C29F5D2f689BaffC9EC3f2f627Ee9CC0333";
const contract = new ethers.ContractFactory(
  abi as AbiItem[],
  MachineStationFactoryContractAddress
);
const abiCoder = new AbiCoder();

// Wallet details
const ownerPrivateKey: string | undefined =
  process.env.CONTRACT_OWNER_PRIVATE_KEY ?? "";
const machineOwnerPrivateKey: string | undefined =
  process.env.MACHINE_OWNER_PRIVATE_KEY ?? "";

const provider = new ethers.JsonRpcProvider(rpcURL);
const ownerAccount = new ethers.Wallet(ownerPrivateKey, provider);
const machineOwnerAccount = new ethers.Wallet(machineOwnerPrivateKey, provider);

const PEAQ_SERVICE_URL =
  "https://lift-off-campaign-service-jx-devbr.jx.peaq.network";

const API_KEY = "aa69cb8e92b2e27eb26996fc9b02f6df24";
const PROJECT_API_KEY = "all_0821fcaa69";

const MachineSmartAccountAddress = "0x2AF327E94B0fC205895d6f223799b53BDEFf6696";

class PeaqGetRealCampaignClass {
  async submitGetRealStorageTx() {
    try {
      const nonce = this.getRandomNonce();
      const target = "0x0000000000000000000000000000000000000801";

      const addItemFunctionSignature = "addItem(bytes,bytes)";
      const addItemFunctionSelector = ethers
        .keccak256(ethers.toUtf8Bytes(addItemFunctionSignature))
        .substring(0, 10);

      let now = new Date().getTime();

      // Send data to peaq data storage service
      // replace <YOUR_CUSTOM_TASK_TAG> with your unique task identity tag used to track your tasks on-chain.
      // all item types are required to be constructed in this format
      // [<YOUR_CUSTOM_TASK_TAG>] + [-] + [a-zA-Z0-9-_]
      // we use the dash [-] to split the item type when the event parser receives the chain events
      // ItemType has to be unique on every requests
      const itemType = "CHA-" + now; // e.g "GET-REAL-CAMPAIGN-ITEM-TYPE-001", "GET-REAL-CAMPAIGN-ITEM-TYPE-002"

      // encode the item storage data for submission to peaq network
      const itemTypeHex = ethers.hexlify(ethers.toUtf8Bytes(itemType));
      const item = "TASK-COMPLETED";
      const itemHex = ethers.hexlify(ethers.toUtf8Bytes(item));

      console.log("itemType: ", itemType);
      console.log("itemTypeHex: ", itemTypeHex);
      console.log("itemHex: ", itemHex);

      const params = abiCoder.encode(
        ["bytes", "bytes"],
        [itemTypeHex, itemHex]
      );

      const calldata = params.replace("0x", addItemFunctionSelector);

      console.log("calldata: ", calldata);

      const postData = {
        item_type: itemType,
        email: "gonzalo@thinkanddev.com",
        tag: "CHA",
        tags: [
          "CHA",
          "CHA-R", // Referral
          "CHA-CPC", // Check-in
          "CHA-CPR", // Review
        ],
      };

      console.log("postData: ", postData);

      // register the itemType and tag or tags
      await this.registerItemTypeAndTags(postData);

      const ownerSignature = await this.ownerSignTypedDataExecuteTransaction(
        target,
        calldata,
        nonce
      );

      await this.executeTransaction(target, calldata, nonce, ownerSignature);
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async transferBalance() {
    let nonce = this.getRandomNonce();

    const signature = await this.machineOwnerSignTypedDataTransferBalance(
      machineOwnerAccount.address,
      nonce
    );

    await this.transferMachineBalance(
      machineOwnerAccount.address,
      nonce,
      signature
    );
  }

  async machineOwnerSignTypedDataTransferBalance(
    recipientAddress: string,
    nonce: BigInt
  ): Promise<string> {
    const domain = {
      name: "MachineSmartAccount",
      version: "1",
      chainId: chainID,
      verifyingContract: MachineSmartAccountAddress,
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

  async transferMachineBalance(
    recipientAddress: string,
    nonce: BigInt,
    signature: string
  ) {
    const methodData = contract.interface.encodeFunctionData(
      "transferMachineBalance",
      [recipientAddress, nonce, signature]
    );

    const tx = {
      to: MachineSmartAccountAddress,
      data: methodData,
    };

    const txResponse = await ownerAccount.sendTransaction(tx);
    const receipt = await txResponse.wait();

    console.log("Transfer Machine Balance Tx:", receipt?.hash);
  }

  async executeTransaction(
    target: string,
    data: string,
    nonce: BigInt,
    signature: string
  ): Promise<void> {
    try {
      // Encode the method call data
      const methodData = contract.interface.encodeFunctionData(
        "executeTransaction",
        [target, data, nonce, signature]
      );

      // Send the transaction and get the receipt
      const txResponse = await this.sendTransaction(methodData);

      let receipt = await txResponse.wait().finally();

      console.log("Normal Tx executed:", receipt?.hash);
    } catch (error: any) {
      console.error("Transaction failed. Error:", error);

      // Check if the error is a revert error with data
      if (error.data) {
        try {
          // Decode the revert error using the contract's ABI
          const iface = new ethers.Interface(contract.interface.fragments);
          const decodedError = iface.parseError(error.data);

          console.log("Decoded Error:", decodedError);

          // Extract error name and arguments
          // const { name, args } = decodedError;
          // console.log("Error Name:", name);
          // console.log("Arguments:", args);

          // if (name === "InvalidSignature") {
          //   console.error("InvalidSignature Error Details:");
          //   console.error("structHash:", args.structHash);
          //   console.error("nonce:", args.nonce.toString());
          // }
        } catch (decodeError) {
          console.error("Failed to decode error data:", decodeError);
        }
      } else {
        console.error("Transaction failed without revert data:", error);
      }
    }
  }

  async ownerSignTypedDataExecuteTransaction(
    target: string,
    data: string,
    nonce: BigInt
  ): Promise<string> {
    // Step 1: Define the EIP-712 Domain
    const domain = {
      name: "MachineStationFactory",
      version: "1",
      chainId: chainID,
      verifyingContract: MachineStationFactoryContractAddress,
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

    const signature = await ownerAccount.signTypedData(domain, types, message);

    return signature;
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

  getRandomNonce(): BigInt {
    const now = BigInt(Date.now());
    const randomPart = BigInt(Math.floor(Math.random() * 1e18));
    return now * randomPart;
  }

  // Function to register your item type and tags on campaign verification service
  async registerItemTypeAndTags(data: any) {
    try {
      console.log(
        "Registering itemType and tags on campaign verification service "
      );
      const response = await axios
        .post(`${PEAQ_SERVICE_URL}/v1/data/store`, data, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            APIKEY: API_KEY,
            "P-APIKEY": PROJECT_API_KEY,
          },
        })
        .then((response: any) => {
          return response.data;
        })
        .catch((err: any) => {
          console.error(err);
          throw err;
        });

      console.log("response: ", response);
      // Note: You may need to adjust the response handling based on the service's response structure
      return response.data;
    } catch (error) {
      console.error(
        "Error registering itemType and tags on campaign verification service",
        error
      );
      throw error;
    }
  }
}

// Main function to submit get real storage tx
const submitGetRealStorageTx = async () => {
  const campaignClass = new PeaqGetRealCampaignClass();

  try {
    await campaignClass.submitGetRealStorageTx();
  } catch (error) {
    console.error(" storage submission failed: Error:", error);
  }
};

submitGetRealStorageTx().catch(console.error);

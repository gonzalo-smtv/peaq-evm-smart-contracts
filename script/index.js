const { ethers } = require("ethers");

const { Keyring } = require("@polkadot/keyring");
const { mnemonicGenerate, cryptoWaitReady } = require("@polkadot/util-crypto");

// Generate a random mnemonic (12-word seed phrase)
const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
console.log("Seed phrase:", mnemonic);

function generateNewDidAddress() {
  cryptoWaitReady().then(() => {
    // Generate a new mnemonic
    const mnemonic = mnemonicGenerate();

    // Create a keyring instance
    const keyring = new Keyring({ type: "sr25519" });

    // Add a new account to the keyring
    const keyPair = keyring.addFromMnemonic(mnemonic);

    console.log("Generated Address:", keyPair.address);

    return {
      keyPair,
      mnemonic,
      address: keyPair.address,
    };
  });
}

generateNewDidAddress();

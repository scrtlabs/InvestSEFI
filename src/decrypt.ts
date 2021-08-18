import {
  SigningCosmWasmClient,
  EnigmaUtils,
  Secp256k1Pen,
  pubkeyToAddress,
  encodeSecp256k1Pubkey,
  BroadcastMode,
} from "secretjs";
import * as sha256 from "sha256";
import * as dotenv from "dotenv";
dotenv.config();

(async () => {
  let tx_encryption_seed = EnigmaUtils.GenerateNewSeed();
  if (process.env.TX_ENCRYPTION_SEED) {
    tx_encryption_seed = Uint8Array.from(
      sha256(process.env.TX_ENCRYPTION_SEED, { asBytes: true })
    );
  }

  const pen = await Secp256k1Pen.fromMnemonic(process.env.MNEMONICS);
  const address = pubkeyToAddress(encodeSecp256k1Pubkey(pen.pubkey), "secret");
  const secretjs = new SigningCosmWasmClient(
    "https://bridge-api-manager.azure-api.net",
    address,
    (signBytes) => pen.sign(signBytes),
    tx_encryption_seed,
    null,
    BroadcastMode.Sync
  );

  const tx = await secretjs.restClient.txById(process.env.TX_TO_DECRYPT);

  const errorBase64 = tx.raw_log.match(/encrypted: (.+?):/)[1];
  const errorCiphertext = atob(errorBase64);
  const nonce = atob(tx.tx.value.msg[4].value.msg).slice(0, 32);

  const plaintext = await secretjs.restClient.enigmautils.decrypt(
    errorCiphertext,
    nonce
  );
  console.log(Buffer.from(plaintext).toString("utf8"));
})();

function atob(ascii: string): Uint8Array {
  return new Uint8Array(Buffer.from(ascii, "base64"));
}

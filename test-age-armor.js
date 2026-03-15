// Minimal regression test for the extension's chosen API pattern:
// encrypt -> armor.encode -> armor.decode -> decrypt
//
// Run: node test-age-armor.js

import { generateIdentity, identityToRecipient, Encrypter, Decrypter, armor } from "age-encryption";

async function main() {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const message = "hello age";

  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const ciphertextBytes = await encrypter.encrypt(message);
  const armored = armor.encode(ciphertextBytes);

  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);

  const decrypted = await decrypter.decrypt(armor.decode(armored), "text");
  if (decrypted !== message) {
    throw new Error(`Roundtrip mismatch: expected ${message}, got ${decrypted}`);
  }
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
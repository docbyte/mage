import { generateIdentity, identityToRecipient, Encrypter, Decrypter, armor } from './age-bundle.js';

let ownKeys = [];
let foreignKeys = [];

document.addEventListener('DOMContentLoaded', () => {
  loadKeys();
  document.getElementById('generateKey').addEventListener('click', generateKeyPairHandler);
  document.getElementById('copyPublicKey').addEventListener('click', copyPublicKey);
  document.getElementById('deleteOwnKey').addEventListener('click', deleteOwnKey);
  document.getElementById('saveForeignKey').addEventListener('click', saveForeignKey);
  document.getElementById('deleteForeignKey').addEventListener('click', deleteForeignKey);
  document.getElementById('encrypt').addEventListener('click', encryptMessage);
  document.getElementById('decrypt').addEventListener('click', decryptMessage);
});

function loadKeys() {
  browser.storage.local.get(['ownKeys', 'foreignKeys']).then(result => {
    ownKeys = result.ownKeys || [];
    foreignKeys = result.foreignKeys || [];
    populateDropdowns();
  });
}

function populateDropdowns() {
  const ownPublicSelect = document.getElementById('ownPublicKeys');
  const encryptSelect = document.getElementById('encryptKey');
  const decryptSelect = document.getElementById('decryptKey');
  const foreignSelect = document.getElementById('foreignKeys');

  ownPublicSelect.innerHTML = '';
  encryptSelect.innerHTML = '';
  decryptSelect.innerHTML = '';
  foreignSelect.innerHTML = '';

  ownKeys.forEach((key, index) => {
    const option = new Option(key.name, index);
    ownPublicSelect.appendChild(option);
    const option2 = new Option(key.name, index);
    decryptSelect.appendChild(option2);
  });

  foreignKeys.forEach((key, index) => {
    const option = new Option(key.name, index);
    encryptSelect.appendChild(option);
    const option2 = new Option(key.name, index);
    foreignSelect.appendChild(option2);
  });
}

async function generateKeyPairHandler() {
  console.log('Generate key button clicked');
  const name = document.getElementById('keyName').value;
  if (!name) return alert('Name eingeben');
  try {
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);
    console.log('Generated identity:', identity, 'recipient:', recipient);
    ownKeys.push({name, privateKey: identity, publicKey: recipient});
    saveKeys();
    populateDropdowns();
    alert('Schlüsselpaar generiert und gespeichert');
  } catch (err) {
    console.error('Error generating key pair:', err);
    alert('Fehler bei Schlüsselgenerierung: ' + err.message);
  }
}

function copyPublicKey() {
  const index = document.getElementById('ownPublicKeys').value;
  if (index === '') return;
  navigator.clipboard.writeText(ownKeys[index].publicKey);
  alert('Public Key kopiert');
}

function saveForeignKey() {
  console.log('Save foreign key button clicked');
  const name = document.getElementById('foreignName').value;
  const publicKey = document.getElementById('foreignPublicKey').value;
  if (!name || !publicKey) return alert('Name und Public Key eingeben');
  try {
    foreignKeys.push({name, publicKey});
    saveKeys();
    populateDropdowns();
    alert('Fremder Public Key gespeichert');
  } catch (err) {
    console.error('Error saving foreign key:', err);
    alert('Fehler beim Speichern: ' + err.message);
  }
}

function deleteOwnKey() {
  const index = document.getElementById('ownPublicKeys').value;
  if (index === '') return alert('Keinen eigenen Schlüssel ausgewählt');
  const keyName = ownKeys[index]?.name;
  if (!confirm(`Schlüssel "${keyName}" wirklich löschen?`)) return;
  ownKeys.splice(index, 1);
  saveKeys();
  populateDropdowns();
}

function deleteForeignKey() {
  const index = document.getElementById('foreignKeys').value;
  if (index === '') return alert('Keinen fremden Schlüssel ausgewählt');
  const keyName = foreignKeys[index]?.name;
  if (!confirm(`Fremden Schlüssel "${keyName}" wirklich löschen?`)) return;
  foreignKeys.splice(index, 1);
  saveKeys();
  populateDropdowns();
}

function encryptMessage() {
  const message = document.getElementById('message').value;
  const index = document.getElementById('encryptKey').value;
  if (!message || index === '') return alert('Nachricht und Schlüssel auswählen');
  console.log('Encrypting message:', message);
  const publicKey = foreignKeys[index].publicKey;
  console.log('Using public key:', publicKey);
  const encrypter = new Encrypter();
  encrypter.addRecipient(publicKey);
  encrypter.encrypt(message).then(encryptedBytes => {
    const encrypted = armor.encode(encryptedBytes);
    console.log('Encrypted result:', encrypted);
    navigator.clipboard.writeText(encrypted);
    alert('Verschlüsselte Nachricht kopiert');
  }).catch(err => {
    console.error('Encrypt error:', err);
    alert('Fehler bei Verschlüsselung: ' + err.message);
  });
}

function decryptMessage() {
  const encrypted = document.getElementById('encryptedMessage').value;
  const index = document.getElementById('decryptKey').value;
  if (!encrypted || index === '') return alert('Verschlüsselte Nachricht und Schlüssel auswählen');
  console.log('Decrypting armored string:', JSON.stringify(encrypted));
  const privateKey = ownKeys[index].privateKey;
  // Don't log private keys.
  const decrypter = new Decrypter();
  decrypter.addIdentity(privateKey);
  // The age library's `decrypt()` expects the raw encrypted bytes, not the ASCII armor.
  // Our UI uses armored text (-----BEGIN AGE ENCRYPTED FILE----- ...), so decode first.
  let normalized = encrypted.trim();
  // Common copy/paste pitfall: users copy a JSON-stringified value with quotes and \n escapes.
  // Try to recover by JSON.parsing it.
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      // ignore; we'll try other normalizations below
    }
  }
  // If it still contains literal backslash-n sequences, convert them.
  if (!normalized.includes('\n') && normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  normalized = normalized.replace(/\r\n/g, '\n');
  let ciphertext;
  try {
    ciphertext = armor.decode(normalized);
  } catch (err) {
    console.error('Armor decode error:', err);
    alert('Ungültiges AGE-Armor-Format: ' + (err?.message ?? String(err)));
    return;
  }

  decrypter.decrypt(ciphertext, 'text').then(decrypted => {
    document.getElementById('decryptedMessage').value = decrypted;
  }).catch(err => {
    console.error('Decrypt error:', err);
    alert('Entschlüsselung fehlgeschlagen: ' + err.message);
  });
}

function saveKeys() {
  browser.storage.local.set({ownKeys, foreignKeys});
}
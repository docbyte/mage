# Mage – Firefox AGE Encryption Extension

This browser extension provides easy **AGE encryption and decryption** directly inside Firefox.

It uses the modern `age-encryption` JavaScript API, bundled for browser usage.

---

## 🔧 Installation

1. Download the extension (.xpi) here:

   **[➡️ mage-extension.xpi](dist/mage-extension.xpi)**

2. Open Firefox → `about:debugging#/runtime/this-firefox`
3. Click **“Load Temporary Add-on…”**
4. Select the downloaded `.xpi` file

---

## ✨ Features

- Generate AGE keypairs
- Store own & foreign public keys
- Encrypt messages using AGE
- Decrypt armored AGE messages
- Copy encrypted output to clipboard

---

## 📦 Development

### Build the bundled crypto library

```
npm run build
```

This produces:

```
age-bundle.js
```

### Build distributable extension

```
npm run build
```

The final `.xpi` file is placed under:

```
dist/mage-extension.xpi
```

---

## 📁 Project Structure

```
manifest.json          # Firefox extension manifest
background.js          # Browser action handler
page.html              # UI
page.js                # UI logic + AGE wrapper
age-bundle.js          # Bundled age-encryption API
dist/                  # Output folder containing .xpi
```

---

## 📜 License

MIT

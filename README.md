# Aurora Launcher

Aurora Launcher is an independent desktop launcher for Minecraft: Java Edition, built for Windows using Electron, React, and TypeScript.

## Project status

Aurora Launcher is currently under active development.

Implemented features include:

- Downloading official Minecraft version metadata
- Downloading and verifying the Minecraft client
- Downloading libraries, assets, and native files
- SHA-1 file verification
- Multiple Minecraft version profiles
- Configurable Java path, RAM, and game directory
- Microsoft OAuth 2.0 authentication using Authorization Code Flow with PKCE
- Minecraft ownership and profile verification
- Launching Minecraft for licensed Microsoft accounts
- Game installation progress and launcher logs

## Authentication and licensing

Aurora Launcher uses the official Microsoft sign-in page in the user's system browser.

The launcher:

- Does not collect Microsoft passwords
- Does not store or use a client secret
- Does not provide cracked or unlicensed access
- Does not bypass Minecraft ownership verification
- Enables the full game only for accounts confirmed by Minecraft Services as owning Minecraft: Java Edition

The Microsoft Entra application is configured as a public/native client with the following redirect URI:

```text
http://localhost
# Local-Share

Local-Share is a simple, zero-setup, high-speed network utility designed to share files and messages directly between your laptop/desktop and mobile devices over your local network. It doesn't rely on internet connectivity, slow external servers, or cumbersome USB cables.

For more details on the motivation behind this project, see [WHY_CREATED.md](WHY_CREATED.md).

## Features
- **Real-Time Sharing:** Instantly communicate and transfer files via Socket.IO.
- **No Internet Connectivity Required:** Works entirely locally over your home or office Wi-Fi network.
- **Privacy First:** Data goes straight from point A to point B without any external routing or server storage.
- **Easy Pairing:** Simply scan a dynamically generated QR Code with your mobile device to connect.
- **No File Size Limits:** Share files of any size at the highest speed your local network allows.

## Prerequisites
- **Node.js** installed on your computer.
- Both the host computer and the receiving device (e.g., your mobile phone) must be connected to the **same Wi-Fi network**.

## How to Run it

The absolute simplest way to start up Local-Share on a Windows PC is to use the provided batch file:

1. Double-click on `Start-LocalShare.bat`.
2. A terminal window will open up running the local server.
3. Your default web browser will automatically open and navigate to `http://localhost:3000`.

### Manual Start (Alternative)
If you prefer running it from the command line:

```bash
# 1. Install dependencies (only required the first time)
npm install

# 2. Start the server
npm start
```
Then, manually open your browser and go to `http://localhost:3000`.

## How to Use It

1. Once the application is running, viewing the web interface on your desktop will display a **QR Code**.
2. Open your mobile phone's camera and **scan the QR Code**.
3. Your phone will immediately open the Local-Share interface in its web browser. 
4. You can now instantly transfer files or send text messages back and forth safely and reliably!

## Note
Files shared during the session are ephemeral and do not persist beyond the session. The server acts strictly as a temporary, high-speed conduit.

---
**Author:** Subham Banerjee | [GitHub](https://github.com/tfxpanda0p)

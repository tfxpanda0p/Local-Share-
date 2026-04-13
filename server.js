const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
// selfsigned removed
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const crypto = require('crypto');

const app = express();

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (let name of Object.keys(interfaces)) {
        for (let iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIp = getLocalIp();

const server = http.createServer(app);

const io = socketIo(server, {
    maxHttpBufferSize: 1e8, // 100MB
    pingTimeout: 60000
});

const PORT = process.env.PORT || 3000;
const SESSION_TOKEN = crypto.randomBytes(8).toString('hex');

const uploadsDir = path.join(__dirname, 'uploads');

// Clear uploads folder.
function clearUploads() {
    if (fs.existsSync(uploadsDir)) {
        fs.readdirSync(uploadsDir).forEach((file) => {
            const filePath = path.join(uploadsDir, file);
            try {
                fs.unlinkSync(filePath);
            } catch(e) {}
        });
    } else {
        fs.mkdirSync(uploadsDir);
    }
}

// Clear on startup
clearUploads();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // preserve original extension securely
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_'));
    }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    const token = req.headers['authorization'];
    if (token !== SESSION_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.originalname, type: req.file.mimetype });
});

// Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token === SESSION_TOKEN) {
        next();
    } else {
        next(new Error("Unauthorized"));
    }
});

function getDeviceType(ua) {
    if (!ua) return 'Unknown Device';
    if (/mobile/i.test(ua)) {
        if (/iphone|ipad|ipod/i.test(ua)) return 'Mobile (iOS)';
        if (/android/i.test(ua)) return 'Mobile (Android)';
        return 'Mobile';
    }
    if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) return 'Laptop (Mac)';
    if (/windows/i.test(ua)) return 'Laptop (Windows)';
    if (/linux/i.test(ua)) return 'Laptop/Desktop (Linux)';
    return 'Laptop/Desktop';
}

io.on('connection', (socket) => {
    const userAgent = socket.request.headers['user-agent'];
    const deviceType = getDeviceType(userAgent);
    socket.deviceType = deviceType;

    console.log(`[+] Device connected: ${socket.id} - ${deviceType}`);
    
    socket.on('message', (data) => {
        data.deviceType = socket.deviceType;
        console.log(`[DATA] ${socket.id} (${socket.deviceType}) sent: ${data.type === 'file' ? data.filename : 'text message'}`);
        // Broadcast to everyone else
        socket.broadcast.emit('message', data);
    });

    socket.on('disconnect', () => {
        console.log(`[-] Device disconnected: ${socket.id} - ${socket.deviceType}`);
        // Removed ephemeral clearing on disconnect so files stay visible while server is running
    });
});

const connectUrl = `http://${localIp}:${PORT}/?token=${SESSION_TOKEN}`;

// Endpoint to get QR code data if needed by the frontend (restricted to localhost)
app.get('/api/info', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const isLocalhost = clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1';
    
    if (!isLocalhost) {
        return res.status(403).json({ error: 'Access denied. You must scan the QR code to connect.' });
    }

    qrcode.toDataURL(connectUrl, { color: { dark: '#ffffff', light: '#00000000' } }, (err, url) => {
        res.json({ qrCodeUrl: url, connectUrl, token: SESSION_TOKEN });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n===========================================`);
    console.log(`LocalShare is running on PORT ${PORT}`);
    console.log(`\nScan the QR code below on your mobile device:`);
    console.log(`Or visit directly: ${connectUrl}`);
    console.log(`===========================================\n`);
    
    // Output QR terminal
    qrcodeTerminal.generate(connectUrl, { small: true });

    // Handle shutting down
    const cleanup = () => {
        console.log('\nShutting down server. Purging data...');
        clearUploads();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
});

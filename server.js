// Import required modules
const express = require('express');              // Web framework
const http = require('http');                    // HTTP server
const socketIo = require('socket.io');           // Real-time communication
const multer = require('multer');                // File upload handling
const path = require('path');                    // File path utilities
const fs = require('fs');                        // File system operations
const os = require('os');                        // OS-level utilities
const qrcodeTerminal = require('qrcode-terminal'); // Show QR in terminal
const qrcode = require('qrcode');                // Generate QR image
const crypto = require('crypto');                // Generate secure tokens

const app = express();

/**
 * Get local IP address of the machine
 * Used to create a shareable URL for other devices
 */
function getLocalIp() {
    const interfaces = os.networkInterfaces();

    // Loop through all network interfaces
    for (let name of Object.keys(interfaces)) {
        for (let iface of interfaces[name]) {
            // Return first non-internal IPv4 address
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; // fallback
}

const localIp = getLocalIp();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
    maxHttpBufferSize: 1e8, // Allow up to 100MB messages/files
    pingTimeout: 60000      // Timeout for inactive clients
});

const PORT = process.env.PORT || 3000;

// Generate a random session token (security key)
const SESSION_TOKEN = crypto.randomBytes(8).toString('hex');

// Uploads folder path
const uploadsDir = path.join(__dirname, 'uploads');

/**
 * Clear all files in uploads directory
 * Used to reset shared files on server restart/shutdown
 */
function clearUploads() {
    if (fs.existsSync(uploadsDir)) {
        fs.readdirSync(uploadsDir).forEach((file) => {
            const filePath = path.join(uploadsDir, file);
            try {
                fs.unlinkSync(filePath); // delete file
            } catch (e) { }
        });
    } else {
        fs.mkdirSync(uploadsDir); // create folder if not exists
    }
}

// Clear uploads when server starts
clearUploads();

/**
 * Configure multer storage
 * - destination: uploads folder
 * - filename: timestamp + sanitized original filename
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(
            null,
            Date.now() + '-' +
            file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_')
        );
    }
});

const upload = multer({ storage });

// Middleware to dynamically intercept and inject author watermark into HTML
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(indexPath, 'utf8', (err, data) => {
            if (err) return next();
            
            const injectedScript = `
    <!-- [SERVER INJECTED AUTHOR WATERMARK] -->
    <script>
        setTimeout(() => {
            const style = 'color: #111; background: #00ffcc; font-size: 14px; font-weight: bold; padding: 10px 15px; border-radius: 5px; font-family: monospace; border: 2px solid #fff; box-shadow: 0 0 10px rgba(0, 255, 204, 0.5);';
            console.log('%c🛡️ LocalShare - Core Engine 🛡️\\n\\nCreated by: Subham Banerjee\\nGitHub: https://github.com/tfxpanda0p\\n\\nNotice: This watermark is dynamically injected server-side to protect original authorship.', style);
        }, 500);
    </script>
`;
            const modifiedHtml = data.replace('</body>', injectedScript + '</body>');
            res.send(modifiedHtml);
        });
    } else {
        next();
    }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/**
 * File upload API
 * Requires Authorization header with session token
 */
app.post('/upload', upload.array('files'), (req, res) => {
    const token = req.headers['authorization'];

    // Check token
    if (token !== SESSION_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // Check file existence
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    // Return file info array
    const results = req.files.map(file => ({
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        type: file.mimetype
    }));
    
    res.json(results);
});

/**
 * Middleware for Socket.IO authentication
 * Only allow clients with valid token
 */
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (token === SESSION_TOKEN) {
        next();
    } else {
        next(new Error("Unauthorized"));
    }
});

/**
 * Detect device type based on user-agent
 */
function getDeviceType(ua) {
    if (!ua) return 'Unknown Device';

    if (/mobile/i.test(ua)) {
        if (/iphone|ipad|ipod/i.test(ua)) return 'Mobile (iOS)';
        if (/android/i.test(ua)) return 'Mobile (Android)';
        return 'Mobile';
    }

    if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua))
        return 'Laptop (Mac)';

    if (/windows/i.test(ua))
        return 'Laptop (Windows)';

    if (/linux/i.test(ua))
        return 'Laptop/Desktop (Linux)';

    return 'Laptop/Desktop';
}

/**
 * Handle Socket.IO connections
 */
io.on('connection', (socket) => {
    const userAgent = socket.request.headers['user-agent'];

    // Identify device type
    const deviceType = getDeviceType(userAgent);
    socket.deviceType = deviceType;

    console.log(`[+] Device connected: ${socket.id} - ${deviceType}`);

    /**
     * Handle incoming messages
     */
    socket.on('message', (data) => {
        data.deviceType = socket.deviceType;

        console.log(
            `[DATA] ${socket.id} (${socket.deviceType}) sent: ${data.type === 'file' ? data.filename : 'text message'
            }`
        );

        // Send message to all other clients
        socket.broadcast.emit('message', data);
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
        console.log(`[-] Device disconnected: ${socket.id} - ${socket.deviceType}`);
    });
});

// Generate connection URL with token
const connectUrl = `http://${localIp}:${PORT}/?token=${SESSION_TOKEN}`;

/**
 * API to get QR code info (restricted to localhost only)
 */
app.get('/api/info', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;

    const isLocalhost =
        clientIp === '::1' ||
        clientIp === '127.0.0.1' ||
        clientIp === '::ffff:127.0.0.1';

    // Restrict access
    if (!isLocalhost) {
        return res.status(403).json({
            error: 'Access denied. You must scan the QR code to connect.'
        });
    }

    // Generate QR code image
    qrcode.toDataURL(
        connectUrl,
        { color: { dark: '#ffffff', light: '#00000000' } },
        (err, url) => {
            res.json({
                qrCodeUrl: url,
                connectUrl,
                token: SESSION_TOKEN
            });
        }
    );
});

/**
 * Start server
 */
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n===========================================`);
    console.log(`🛡️ LocalShare is running on PORT ${PORT}`);
    console.log(`Created by: Subham Banerjee`);
    console.log(`GitHub: https://github.com/tfxpanda0p`);
    console.log(`-------------------------------------------`);
    console.log(`Scan the QR code below on your mobile device:`);
    console.log(`Or visit directly: ${connectUrl}`);
    console.log(`===========================================\n`);

    // Show QR in terminal
    qrcodeTerminal.generate(connectUrl, { small: true });

    /**
     * Cleanup function (runs on shutdown)
     */
    const cleanup = () => {
        console.log('\nShutting down server. Purging data...');
        clearUploads(); // delete uploaded files
        process.exit(0);
    };

    // Handle exit signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
});
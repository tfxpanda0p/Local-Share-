// Utility to get current time
function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<ion-icon name="${type === 'success' ? 'checkmark-circle' : 'alert-circle'}"></ion-icon><span>${message}</span>`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', async () => {
    const showQrBtn = document.getElementById('show-qr-btn');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const authError = document.getElementById('auth-error');
    
    // Auth & Token management
    let token = new URLSearchParams(window.location.search).get('token');
    
    // If no token in URL, try to fetch it (only works if accessing from localhost)
    if (!token) {
        try {
            const res = await fetch('/api/info');
            if (res.ok) {
                const data = await res.json();
                token = data.token;
                // Add it to URL so refresh works
                window.history.replaceState({}, '', `?token=${token}`);
                if (data.qrCodeUrl) {
                    qrImage.src = data.qrCodeUrl;
                }
            }
        } catch(e) {
            console.error(e);
        }
    } else {
        // We have a token in URL. Let's still fetch QR code for display if needed
        try {
            const res = await fetch('/api/info');
            if (res.ok) {
                const data = await res.json();
                if (data.qrCodeUrl) qrImage.src = data.qrCodeUrl;
            }
        } catch(e){}
    }

    if (!token) {
        authError.classList.remove('hidden');
        return;
    }

    // Socket Connection
    const socket = io({
        auth: { token }
    });

    const statusText = document.getElementById('status-text');
    const statusContainer = document.querySelector('.status');

    socket.on('connect', () => {
        statusText.textContent = 'Connected';
        statusContainer.classList.add('connected');
    });

    socket.on('disconnect', () => {
        statusText.textContent = 'Disconnected';
        statusContainer.classList.remove('connected');
    });

    socket.on('connect_error', (err) => {
        if (err.message === "Unauthorized") {
            authError.classList.remove('hidden');
            socket.disconnect();
        } else {
            statusText.textContent = 'Connection Error';
            statusContainer.classList.remove('connected');
        }
    });

    // UI Elements
    const msgInput = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages');
    const fileBtn = document.getElementById('file-btn');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const dropOverlay = document.getElementById('drop-overlay');
    const uploadProgressContainer = document.getElementById('upload-progress-container');
    const uploadFill = document.getElementById('upload-fill');
    const uploadPercent = document.getElementById('upload-percent');
    const uploadFilename = document.getElementById('upload-filename');

    // Auto resize textarea
    msgInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
    });

    showQrBtn.addEventListener('click', () => {
        qrContainer.classList.toggle('hidden');
    });

    // Hide QR when clicking outside
    document.addEventListener('click', (e) => {
        if (!showQrBtn.contains(e.target) && !qrContainer.contains(e.target)) {
            qrContainer.classList.add('hidden');
        }
    });

    // Messaging
    function renderMessage(data, isOwn) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;

        let content = '';
        
        // Show device type for received messages
        if (!isOwn && data.deviceType) {
            content += `<span class="msg-sender"><ion-icon name="${data.deviceType.includes('Mobile') ? 'phone-portrait-outline' : 'laptop-outline'}"></ion-icon> ${data.deviceType}</span>`;
        }

        if (data.type === 'text') {
            // Convert urls to links
            const text = data.content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">$1</a>');
            content = `<p>${text}</p>`;
        } else if (data.type === 'file') {
            const { url, filename, mimeType } = data;
            
            if (mimeType.startsWith('image/')) {
                content = `<img src="${url}" alt="${filename}">`;
            } else if (mimeType.startsWith('video/')) {
                content = `<video src="${url}" controls preload="metadata"></video>`;
            } else if (mimeType.startsWith('audio/')) {
                content = `<audio src="${url}" controls></audio>`;
            }
            
            // Always show attachment info
            content += `
                <div class="file-attachment">
                    <ion-icon name="document-outline"></ion-icon>
                    <div class="file-info">
                        <span class="file-name">${filename}</span>
                    </div>
                    <a href="${url}" download="${filename}" class="download-btn">
                        <ion-icon name="download-outline"></ion-icon>
                    </a>
                </div>
            `;
        }

        content += `<span class="msg-time">${data.time}</span>`;
        msgDiv.innerHTML = content;
        
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Auto-download if we receive a file from someone else
        if (data.type === 'file' && !isOwn) {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = data.url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast(`Auto-downloading ${data.filename}...`, 'success');
            }, 500);
        }
    }

    function sendMessage() {
        const text = msgInput.value.trim();
        if (!text) return;

        const msgData = {
            type: 'text',
            content: text,
            time: getTimeString()
        };

        socket.emit('message', msgData);
        renderMessage(msgData, true);
        
        msgInput.value = '';
        msgInput.style.height = 'auto';
        msgInput.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    socket.on('message', (data) => {
        renderMessage(data, false);
    });

    // File Upload Handling
    fileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFiles(e.target.files);
            fileInput.value = ''; // reset
        }
    });

    // Drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropOverlay.classList.remove('hidden');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropOverlay.classList.add('hidden');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    async function uploadFiles(files) {
        uploadProgressContainer.classList.remove('hidden');
        uploadFilename.textContent = files.length > 1 ? `Uploading ${files.length} files...` : files[0].name;
        uploadPercent.textContent = '0%';
        uploadFill.style.width = '0%';

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);
            xhr.setRequestHeader('authorization', token);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    uploadPercent.textContent = `${percentComplete}%`;
                    uploadFill.style.width = `${percentComplete}%`;
                }
            };

            xhr.onload = function() {
                if (xhr.status === 200) {
                    const dataArray = JSON.parse(xhr.responseText);
                    dataArray.forEach(data => {
                        const msgData = {
                            type: 'file',
                            url: data.url,
                            filename: data.filename,
                            mimeType: data.type,
                            time: getTimeString()
                        };
                        
                        socket.emit('message', msgData);
                        renderMessage(msgData, true);
                    });
                    
                    setTimeout(() => {
                        uploadProgressContainer.classList.add('hidden');
                        showToast(files.length > 1 ? 'Files shared successfully!' : 'File shared successfully!', 'success');
                    }, 500);
                } else {
                    showToast('Upload failed: ' + xhr.responseText, 'error');
                    uploadProgressContainer.classList.add('hidden');
                }
            };

            xhr.onerror = function() {
                showToast('Upload error', 'error');
                uploadProgressContainer.classList.add('hidden');
            };

            xhr.send(formData);
        } catch (error) {
            console.error('Error uploading files:', error);
            uploadProgressContainer.classList.add('hidden');
        }
    }
});

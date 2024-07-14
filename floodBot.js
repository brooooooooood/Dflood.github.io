let ws;
let isRunning = false;

function startFlood() {
    const accounts = document.getElementById('accounts').value.split('\n');
    const message = document.getElementById('message').value;
    const targetUsernames = document.getElementById('targetUsername').value.split('\n');
    const numMessages = parseInt(document.getElementById('numMessages').value);
    const reconnectInterval = parseInt(document.getElementById('reconnectInterval').value);
    const imageUrl = document.getElementById('imageUrl').value;

    if (!accounts.length || !message || !targetUsernames.length || !numMessages || !reconnectInterval) {
        log('Please fill in all required fields');
        return;
    }

    isRunning = true;
    floodAccounts(accounts, message, targetUsernames, numMessages, reconnectInterval, imageUrl);
}

function stopFlood() {
    isRunning = false;
    if (ws) {
        ws.close();
    }
    log('Flood stopped');
}

async function floodAccounts(accounts, message, targetUsernames, numMessages, reconnectInterval, imageUrl) {
    while (isRunning) {
        for (const account of accounts) {
            if (!isRunning) break;
            const [username, password] = account.split(':');
            await connectAndFlood(username, password, message, targetUsernames, numMessages, imageUrl);
            await new Promise(resolve => setTimeout(resolve, reconnectInterval * 1000));
        }
    }
}

async function connectAndFlood(username, password, message, targetUsernames, numMessages, imageUrl) {
    try {
        ws = new WebSocket('wss://chatp.net:5333/server');

        ws.onopen = () => {
            log(`WebSocket connection opened for ${username}`);
            login(username, password);
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.handler === 'login' && data.status === 'OK') {
                log(`Logged in: ${username}`);
                floodTargets(username, message, targetUsernames, numMessages, imageUrl);
            }
        };

        ws.onclose = () => {
            log(`WebSocket connection closed for ${username}`);
        };

        ws.onerror = (error) => {
            log(`WebSocket error for ${username}: ${error.message}`);
        };
    } catch (error) {
        log(`Connection failed for ${username}: ${error.message}`);
    }
}

function login(username, password) {
    const loginPayload = {
        handler: 'login',
        username: username,
        password: password
    };
    ws.send(JSON.stringify(loginPayload));
}

async function floodTargets(username, message, targetUsernames, numMessages, imageUrl) {
    for (const targetUsername of targetUsernames) {
        for (let i = 0; i < numMessages; i++) {
            if (!isRunning) return;
            sendPrivateMessage(username, targetUsername, message);
            sendFriendRequest(targetUsername);
            sendPrivateImageMessage(targetUsername, imageUrl);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function sendPrivateMessage(fromUsername, toUsername, message) {
    const messagePayload = {
        handler: 'chat_message',
        id: generateRandomString(20),
        from: fromUsername,
        to: toUsername,
        type: 'text',
        url: '',
        body: message,
        length: ''
    };
    ws.send(JSON.stringify(messagePayload));
    log(`Message sent from ${fromUsername} to ${toUsername}`);
}

function sendPrivateImageMessage(toUsername, imageUrl) {
    const imageMessagePayload = {
        handler: 'chat_message',
        id: generateRandomString(20),
        to: toUsername,
        type: 'image',
        url: imageUrl,
        body: '',
        length: ''
    };
    ws.send(JSON.stringify(imageMessagePayload));
    log(`Image sent to ${toUsername}`);
}

function sendFriendRequest(targetUsername) {
    const friendRequestPayload = {
        handler: 'profile_update',
        type: 'send_friend_request',
        value: targetUsername,
        id: generateRandomString(17)
    };
    ws.send(JSON.stringify(friendRequestPayload));
    log(`Friend request sent to ${targetUsername}`);
}

function generateRandomString(length) {
    const characters = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function log(message) {
    const logElement = document.getElementById('log');
    logElement.innerHTML += message + '<br>';
    logElement.scrollTop = logElement.scrollHeight;
}

document.getElementById('startBtn').addEventListener('click', startFlood);
document.getElementById('stopBtn').addEventListener('click', stopFlood);

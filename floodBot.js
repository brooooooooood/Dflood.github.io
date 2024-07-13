const HANDLER_PROFILE_UPDATE = "profile_update";
const HANDLER_CHAT_MESSAGE = "chat_message";
const MSG_BODY = "body";
const MSG_FROM = "from";
const MSG_TO = "to";
const MSG_TYPE_TXT = "text";
const MSG_LENGTH = "length";
const MSG_TYPE_IMG = "image";
const MSG_TYPE_AUDIO = "audio";
const MSG_URL = "url";
const ID = "id";
const NAME = "name";
const USERNAME = "username";
const PASSWORD = "password";
const ROOM = "room";
const TYPE = "type";
const HANDLER = "handler";

const SOCKET_URL = "wss://chatp.net:5333/server";
const ALLOWED_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

let isRunning = false;


function genRandomStr(length) {
    return Array.from({length}, () => ALLOWED_CHARS[Math.floor(Math.random() * ALLOWED_CHARS.length)]).join('');
}

function log(message) {
    const logElement = document.getElementById('log');
    logElement.innerHTML += message + '<br>';
    logElement.scrollTop = logElement.scrollHeight;
}

async function sendPvtMsg(ws, id, user, msg) {
    const jsonBody = {
        [HANDLER]: HANDLER_CHAT_MESSAGE,
        [ID]: genRandomStr(20),
        [MSG_FROM]: id,
        [MSG_TO]: user,
        [TYPE]: MSG_TYPE_TXT,
        [MSG_BODY]: msg,
        [MSG_LENGTH]: ""
    };
    await ws.send(JSON.stringify(jsonBody));
    log(`تم إرسال رسالة من ${id} إلى ${user}`);
}

async function login(ws, id, password) {
    const jsonBody = {
        [HANDLER]: "login",
        [USERNAME]: id,
        [PASSWORD]: password
    };
    await ws.send(JSON.stringify(jsonBody));
    log(`تم تسجيل الدخول: ${id}`);
}


async function main() {
    const accounts = document.getElementById('accounts').value.split('\n').filter(line => line.trim() !== '');
    const message = document.getElementById('message').value;
    const targetUsername = document.getElementById('targetUsername').value;
    const numMessages = parseInt(document.getElementById('numMessages').value);
    const reconnectInterval = parseInt(document.getElementById('reconnectInterval').value) 
    while (isRunning) {
        for (const idPass of accounts) {
            if (!isRunning) break;
            const [id, password] = idPass.split(':');
            const ws = new WebSocket(SOCKET_URL);

            await new Promise((resolve, reject) => {
                ws.onopen = async () => {
                    log("تم فتح الاتصال");
                    await login(ws, id, password);

                    for (let i = 0; i < numMessages; i++) {
                        if (!isRunning) break;
                        await sendPvtMsg(ws, id, targetUsername, message);
                    }

                    ws.close();
                    resolve();
                };

                ws.onerror = (error) => {
                    log("خطأ في الاتصال: " + error);
                    reject(error);
                };

                ws.onclose = () => {
                    log("تم إغلاق الاتصال");
                    resolve();
                };
            });

            await new Promise(resolve => setTimeout(resolve, reconnectInterval));
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startBtn').addEventListener('click', () => {
        if (!isRunning) {
            isRunning = true;
            log("بدء تشغيل البوت...");
            main().catch(error => log("حدث خطأ: " + error));
        }
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
        isRunning = false;
        log("جاري إيقاف البوت...");
    });
});

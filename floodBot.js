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

// إعدادات البروكسي
const DELAY_BETWEEN_ATTEMPTS = 5;
const MAX_SCORE = 5;
const MIN_SCORE = 0;
const MAX_FAILS_BEFORE_REMOVE = 2;
const PROXY_TEST_TIMEOUT = 10000;
const WS_TIMEOUT = 30000;
const REFRESH_INTERVAL = 1800000;
const PROXY_ROTATE_EVERY = 5;

let isRunning = false;
let currentProxy = null;
let proxyPool = new Map();
let badProxies = new Set();
let lastRefresh = 0;
let successCounter = 0;
let proxySources = [
    "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt",
];

function genRandomStr(length) {
    return Array.from({length}, () => ALLOWED_CHARS[Math.floor(Math.random() * ALLOWED_CHARS.length)]).join('');
}

function log(message) {
    const logElement = document.getElementById('log');
    logElement.innerHTML += message + '<br>';
    logElement.scrollTop = logElement.scrollHeight;
}

function saveProxiesToFile() {
    const proxiesData = {
        proxyPool: Array.from(proxyPool.entries()),
        badProxies: Array.from(badProxies),
        lastRefresh: lastRefresh
    };
    localStorage.setItem('proxyManager', JSON.stringify(proxiesData));
}

function loadProxiesFromFile() {
    try {
        const saved = localStorage.getItem('proxyManager');
        if (saved) {
            const data = JSON.parse(saved);
            proxyPool = new Map(data.proxyPool || []);
            badProxies = new Set(data.badProxies || []);
            lastRefresh = data.lastRefresh || 0;
            log(`تم تحميل ${proxyPool.size} بروكسي من الذاكرة`);
        }
    } catch (e) {
        log(`خطأ في تحميل البروكسيات: ${e}`);
    }
}

async function fetchProxyBatch() {
    const now = Date.now();
    if (now - lastRefresh < REFRESH_INTERVAL && proxyPool.size > 0) {
        return false;
    }

    let addedCount = 0;
    
    for (const source of proxySources) {
        try {
            const response = await fetch(source, {method: 'GET'});
            if (response.ok) {
                const text = await response.text();
                const lines = text.split('\n');
                
                for (const line of lines) {
                    const proxy = line.trim();
                    if (proxy && proxy.includes(':') && !proxy.startsWith('#')) {
                        const proxyUrl = proxy.startsWith('socks5://') ? proxy : `socks5://${proxy}`;
                        
                        if (!badProxies.has(proxyUrl) && !proxyPool.has(proxyUrl)) {
                            proxyPool.set(proxyUrl, {score: 1, fails: 0});
                            addedCount++;
                        }
                    }
                }
            }
        } catch (error) {
            log(`فشل في جلب البروكسيات من ${source}: ${error}`);
        }
    }

    lastRefresh = now;
    saveProxiesToFile();
    log(`تم تحميل ${addedCount} بروكسي جديد (المجموع: ${proxyPool.size})`);
    return addedCount > 0;
}

async function testProxy(proxyUrl) {
    return new Promise((resolve) => {
        const testSocket = new WebSocket(SOCKET_URL);
        const timeout = setTimeout(() => {
            testSocket.close();
            resolve(false);
        }, PROXY_TEST_TIMEOUT);

        testSocket.onopen = () => {
            clearTimeout(timeout);
            testSocket.close();
            resolve(true);
        };

        testSocket.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
        };
    });
}

async function getNewProxy() {
    if (proxyPool.size === 0) {
        await fetchProxyBatch();
        if (proxyPool.size === 0) {
            log("❌ لا توجد بروكسيات متاحة");
            return false;
        }
    }

    // ترتيب البروكسيات حسب النقاط
    const sortedProxies = Array.from(proxyPool.entries())
        .sort((a, b) => b[1].score - a[1].score);

    for (const [proxy, stats] of sortedProxies) {
        log(`🔍 اختبار البروكسي: ${proxy}`);
        const isWorking = await testProxy(proxy);
        
        if (isWorking) {
            currentProxy = proxy;
            successCounter = 0;
            log(`🌐 استخدام البروكسي: ${proxy} (النقاط: ${stats.score}, الإخفاقات: ${stats.fails})`);
            return true;
        } else {
            log(`🗑️ البروكسي فشل في الاختبار: ${proxy}`);
            badProxies.add(proxy);
            proxyPool.delete(proxy);
            saveProxiesToFile();
        }
    }

    return false;
}

async function createWebSocketWithProxy() {
    if (!currentProxy) {
        return new WebSocket(SOCKET_URL);
    }

    // في بيئة المتصفح، نستخدم إعدادات البروكسي عبر الامتدادات أو الإعدادات النظامية
    // هذا مثال مبسط - في التطبيق الحقيقي قد تحتاج لاستخدام WebSocket مع بروكسي SOCKS
    return new WebSocket(SOCKET_URL);
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

async function sendImageMsg(ws, id, user, imageUrl) {
    const jsonBody = {
        [HANDLER]: HANDLER_CHAT_MESSAGE,
        [ID]: genRandomStr(20),
        [MSG_FROM]: id,
        [MSG_TO]: user,
        [TYPE]: MSG_TYPE_IMG,
        [MSG_URL]: imageUrl,
        [MSG_BODY]: "",
        [MSG_LENGTH]: ""
    };
    await ws.send(JSON.stringify(jsonBody));
    log(`تم إرسال صورة من ${id} إلى ${user}`);
}

async function sendFriendRequest(ws, id, targetUser) {
    const jsonBody = {
        [HANDLER]: HANDLER_PROFILE_UPDATE,
        [TYPE]: "send_friend_request",
        "value": targetUser,
        [ID]: genRandomStr(17)
    };
    await ws.send(JSON.stringify(jsonBody));
    log(`تم إرسال طلب صداقة من ${id} إلى ${targetUser}`);
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

async function tryLoginWithProxy(username, password) {
    try {
        const ws = await createWebSocketWithProxy();
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error("انتهت مهلة الاتصال"));
            }, WS_TIMEOUT);

            ws.onopen = async () => {
                clearTimeout(timeout);
                await login(ws, username, password);
                
                // تحديث إحصائيات البروكسي الناجح
                if (currentProxy && proxyPool.has(currentProxy)) {
                    const stats = proxyPool.get(currentProxy);
                    stats.score = Math.min(MAX_SCORE, stats.score + 1);
                    stats.fails = 0;
                    saveProxiesToFile();
                }

                successCounter++;
                if (successCounter >= PROXY_ROTATE_EVERY) {
                    log(`🔄 تبديل البروكسي بعد ${PROXY_ROTATE_EVERY} محاولات ناجحة...`);
                    await getNewProxy();
                }

                resolve(ws);
            };

            ws.onerror = (error) => {
                clearTimeout(timeout);
                if (currentProxy && proxyPool.has(currentProxy)) {
                    const stats = proxyPool.get(currentProxy);
                    stats.fails++;
                    if (stats.fails >= MAX_FAILS_BEFORE_REMOVE) {
                        log(`🗑️ إزالة البروكسي الفاشل: ${currentProxy}`);
                        badProxies.add(currentProxy);
                        proxyPool.delete(currentProxy);
                    } else {
                        stats.score = Math.max(MIN_SCORE, stats.score - 1);
                    }
                    saveProxiesToFile();
                }
                reject(error);
            };
        });
    } catch (error) {
        throw error;
    }
}

async function main() {
    const accounts = document.getElementById('accounts').value.split('\n').filter(line => line.trim() !== '');
    const message = document.getElementById('message').value;
    const targetUsername = document.getElementById('targetUsername').value;
    const numMessages = parseInt(document.getElementById('numMessages').value);
    const reconnectInterval = parseInt(document.getElementById('reconnectInterval').value);
    const imageUrl = document.getElementById('imageUrl').value;

    // تحميل البروكسيات المحفوظة
    loadProxiesFromFile();
    
    // الحصول على أول بروكسي
    if (!await getNewProxy()) {
        log("❌ لا يمكن البدء - لا توجد بروكسيات شغالة");
        isRunning = false;
        return;
    }

    while (isRunning) {
        for (const idPass of accounts) {
            if (!isRunning) break;
            
            const [id, password] = idPass.split(':');
            
            try {
                const ws = await tryLoginWithProxy(id, password);

                for (let i = 0; i < numMessages; i++) {
                    if (!isRunning) break;
                    await sendPvtMsg(ws, id, targetUsername, message);
                    if (imageUrl) {
                        await sendImageMsg(ws, id, targetUsername, imageUrl);
                    }
                    await sendFriendRequest(ws, id, targetUsername);
                    
                    // تأخير بين المحاولات
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ATTEMPTS * 1000));
                }

                ws.close();
                log(`✅ اكتملت دورة الحساب: ${id}`);

            } catch (error) {
                log(`❌ فشل في الحساب ${id}: ${error}`);
                
                // محاولة الحصول على بروكسي جديد بعد الفشل
                await getNewProxy();
            }

            await new Promise(resolve => setTimeout(resolve, reconnectInterval * 1000));
        }
        
        log("🔄 بدء دورة جديدة للحسابات...");
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
        saveProxiesToFile();
    });

    // زر لإعادة تحميل البروكسيات يدوياً
    const reloadProxiesBtn = document.createElement('button');
    reloadProxiesBtn.textContent = 'إعادة تحميل البروكسيات';
    reloadProxiesBtn.addEventListener('click', async () => {
        log("🔄 إعادة تحميل البروكسيات...");
        await fetchProxyBatch();
        await getNewProxy();
    });
    document.body.appendChild(reloadProxiesBtn);
});

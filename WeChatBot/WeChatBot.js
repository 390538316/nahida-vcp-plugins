/**
 * WeChatBot - 微信 ClawBot VCP 插件
 * 基于腾讯 iLink 协议，实现微信个人账号 Bot
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const POLL_TIMEOUT_MS = 35000;
const MAX_RETRY_DELAY = 30000;
const STATE_FILE = path.join(__dirname, 'state.json');

let botToken = null;
let botBaseUrl = ILINK_BASE_URL;
let botId = null;
let getUpdatesBuf = '';
let isRunning = false;
let isLoggedIn = false;
let loginQrCodeUrl = null;
let lastError = null;

const conversationHistory = new Map();
const recentContacts = new Map();

let pluginConfig = {};
let serverKey = '';
let agentAssistantModule = null;

function log(msg, level = 'INFO') {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log(`[${ts}][WeChatBot][${level}] ${msg}`);
}

function debug(msg) {
    if (pluginConfig.DebugMode) log(msg, 'DEBUG');
}

function randomUint32() {
    return crypto.randomBytes(4).readUInt32BE(0);
}

function buildHeaders(token) {
    const headers = {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',
        'X-WECHAT-UIN': Buffer.from(String(randomUint32())).toString('base64'),
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '2.4.3'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                ...options.headers,
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
            },
            timeout: options.timeout || 60000
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (e) => {
            if (e.code === 'ECONNRESET' || e.message === 'socket hang up') {
                log(`网络连接被重置: ${e.message}`, 'WARN');
            }
            reject(e);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

        if (bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    });
}

function localRequest(reqPath, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const options = {
            hostname: '127.0.0.1',
            port: parseInt(process.env.PORT) || 6005,
            path: reqPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serverKey}`,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 120000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('VCP request timeout')); });
        req.write(postData);
        req.end();
    });
}

async function getQrCode() {
    const url = `${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
    const res = await httpsRequest(url, {
        method: 'POST',
        headers: buildHeaders(),
        body: { local_token_list: [] }
    });
    return res.data;
}

async function checkQrCodeStatus(qrcode) {
    const url = `${ILINK_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${qrcode}`;
    const res = await httpsRequest(url, { headers: buildHeaders(), timeout: 60000 });
    return res.data;
}

async function getUpdates() {
    const url = `${botBaseUrl}/ilink/bot/getupdates`;
    const res = await httpsRequest(url, {
        method: 'POST',
        headers: buildHeaders(botToken),
        body: {
            get_updates_buf: getUpdatesBuf,
            base_info: { channel_version: '2.4.3', bot_agent: 'VCP-WeChatBot/1.0.0' }
        },
        timeout: POLL_TIMEOUT_MS + 10000
    });
    return res.data;
}

async function sendMessage(toUserId, text, contextToken) {
    const url = `${botBaseUrl}/ilink/bot/sendmessage`;
    const clientId = `vcp-wechatbot-${crypto.randomBytes(8).toString('hex')}`;
    const body = {
        msg: {
            from_user_id: '',
            to_user_id: toUserId,
            client_id: clientId,
            message_type: 2,
            message_state: 2,
            context_token: contextToken,
            item_list: [{ type: 1, text_item: { text } }]
        },
        base_info: { channel_version: '2.4.3', bot_agent: 'VCP-WeChatBot/1.0.0' }
    };
    const res = await httpsRequest(url, {
        method: 'POST',
        headers: buildHeaders(botToken),
        body
    });
    return res.data;
}

async function sendTyping(toUserId, status, typingTicket) {
    const url = `${botBaseUrl}/ilink/bot/sendtyping`;
    try {
        await httpsRequest(url, {
            method: 'POST',
            headers: buildHeaders(botToken),
            body: { ilink_user_id: toUserId, typing_ticket: typingTicket, status, base_info: { channel_version: '2.4.3', bot_agent: 'VCP-WeChatBot/1.0.0' } }
        });
    } catch (e) { /* typing failure is non-critical */ }
}

async function getConfig(toUserId, contextToken) {
    const url = `${botBaseUrl}/ilink/bot/getconfig`;
    try {
        const res = await httpsRequest(url, {
            method: 'POST',
            headers: buildHeaders(botToken),
            body: { ilink_user_id: toUserId, context_token: contextToken, base_info: { channel_version: '2.4.3', bot_agent: 'VCP-WeChatBot/1.0.0' } }
        });
        return res.data?.typing_ticket || null;
    } catch (e) { return null; }
}

async function callVCPAI(userId, userMessage) {
    const agentName = pluginConfig.AgentModel || '纳西妲';
    const wechatContext = pluginConfig.SystemPrompt || '你正在通过微信与主人对话。回复简洁自然，不使用HTML标签和表情包图片标签。保持你的人格和记忆，但输出格式适配微信纯文本。';
    const modelId = pluginConfig.ModelId || 'claude-opus-4-6';

    // 通过 /v1/chat/completions 调用，stream=true 模式拼接 SSE
    try {
        const messages = [
            { role: 'system', content: `{{${agentName}}}\n\n[渠道适配指令] ${wechatContext}` },
            { role: 'user', content: userMessage }
        ];

        const postData = JSON.stringify({
            model: modelId,
            messages: messages,
            max_tokens: 2000,
            temperature: 0.7,
            stream: true
        });

        const aiReply = await new Promise((resolve, reject) => {
            const http = require('http');
            const options = {
                hostname: '127.0.0.1',
                port: parseInt(process.env.PORT) || 6005,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serverKey}`,
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 180000
            };

            let fullContent = '';
            const req = http.request(options, (res) => {
                let buffer = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep incomplete line
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) fullContent += delta;
                        } catch (e) { /* skip malformed chunks */ }
                    }
                });
                res.on('end', () => {
                    // process remaining buffer
                    if (buffer.trim()) {
                        const lines = buffer.split('\n');
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta?.content;
                                if (delta) fullContent += delta;
                            } catch (e) { /* skip */ }
                        }
                    }
                    resolve(fullContent);
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Stream request timeout')); });
            req.write(postData);
            req.end();
        });

        debug(`AI stream complete, length=${aiReply.length}, preview=${aiReply.substring(0, 100)}`);

        if (!aiReply) {
            log('AI returned empty stream content', 'WARN');
            return null;
        }

        // 清理 HTML 标签、表情包、锚点、思维链、工具调用
        const cleanReply = aiReply
            .replace(/\[--- VCP元思考链:[\s\S]*?元思考链结束 ---\]/g, '')
            .replace(/<img[^>]*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\[@[^\]]*\]/g, '')
            .replace(/<<<\[TOOL_REQUEST\]>>>[\s\S]*?<<<\[END_TOOL_REQUEST\]>>>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return cleanReply || '...';
    } catch (e) {
        log(`AI call exception: ${e.message}`, 'ERROR');
        lastError = e.message;
        return null;
    }
}

async function handleIncomingMessage(msg) {
    if (msg.message_type !== 1) return;

    const textItem = msg.item_list?.find(item => item.type === 1);
    if (!textItem?.text_item?.text) return;

    const userId = msg.from_user_id;
    const text = textItem.text_item.text.trim();
    const contextToken = msg.context_token;

    if (!text) return;

    log(`收到消息 [${userId.substring(0, 8)}...]: ${text.substring(0, 50)}`);

    recentContacts.set(userId, { lastMessage: text, lastTime: Date.now() });

    const typingTicket = await getConfig(userId, contextToken);
    if (typingTicket) {
        await sendTyping(userId, 1, typingTicket);
    }

    const reply = await callVCPAI(userId, text);

    if (reply) {
        await sendMessage(userId, reply, contextToken);
        log(`已回复 [${userId.substring(0, 8)}...]: ${reply.substring(0, 50)}`);
    } else {
        await sendMessage(userId, '[连接中断，请稍后再试]', contextToken);
        log(`AI返回空，已发送兜底提示 [${userId.substring(0, 8)}...]`, 'WARN');
    }

    if (typingTicket) {
        await sendTyping(userId, 2, typingTicket);
    }
}

async function pollLoop() {
    let retryDelay = 1000;
    let consecutiveErrors = 0;

    log('长轮询循环启动');

    while (isRunning && isLoggedIn) {
        try {
            const result = await getUpdates();

            if (result.get_updates_buf) {
                getUpdatesBuf = result.get_updates_buf;
                saveState();
            }

            if (result.msgs && result.msgs.length > 0) {
                for (const msg of result.msgs) {
                    try {
                        await handleIncomingMessage(msg);
                    } catch (e) {
                        log(`消息处理异常: ${e.message}`, 'ERROR');
                    }
                }
            }

            retryDelay = 1000;
            consecutiveErrors = 0;
            lastError = null;
        } catch (e) {
            consecutiveErrors++;
            const isNetworkError = e.code === 'ECONNRESET' || e.message === 'socket hang up' || e.code === 'ETIMEDOUT';
            
            if (isNetworkError && consecutiveErrors <= 3) {
                // 网络抖动，短暂等待后重试
                log(`网络波动 (${e.message})，${retryDelay/1000}s 后重试 [${consecutiveErrors}/3]`, 'WARN');
            } else {
                log(`轮询异常: ${e.message} [连续${consecutiveErrors}次]`, 'ERROR');
                lastError = e.message;
            }
            
            await new Promise(r => setTimeout(r, retryDelay));
            retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
            
            if (consecutiveErrors > 10) {
                log('连续错误超过10次，停止轮询', 'ERROR');
                isLoggedIn = false;
                break;
            }
        }
    }

    log('轮询循环已停止');
}

async function waitForScanAndStart(qrcode) {
    try {
        const maxWait = 120;
        for (let i = 0; i < maxWait; i++) {
            const status = await checkQrCodeStatus(qrcode);

            if (status.bot_token) {
                botToken = status.bot_token;
                botBaseUrl = status.baseurl || ILINK_BASE_URL;
                botId = status.ilink_bot_id || null;
                isLoggedIn = true;
                loginQrCodeUrl = null;

                log(`登录成功! botId=${botId}`);
                saveState();
                pollLoop();
                return;
            }

            if (status.status === 'expired') {
                log('二维码已过期', 'WARN');
                return;
            }

            await new Promise(r => setTimeout(r, 1000));
        }
        log('扫码超时', 'WARN');
    } catch (e) {
        log(`扫码等待异常: ${e.message}`, 'ERROR');
        lastError = e.message;
    }
}

async function startLogin() {
    try {
        log('开始获取登录二维码...');
        const qrData = await getQrCode();

        if (!qrData.qrcode) {
            throw new Error('获取二维码失败');
        }

        loginQrCodeUrl = qrData.qrcode_url || `https://login.weixin.qq.com/qrcode/${qrData.qrcode}`;
        log(`二维码已生成，等待扫码... qrcode=${qrData.qrcode}`);

        const maxWait = 120;
        for (let i = 0; i < maxWait; i++) {
            const status = await checkQrCodeStatus(qrData.qrcode);

            if (status.bot_token) {
                botToken = status.bot_token;
                botBaseUrl = status.baseurl || ILINK_BASE_URL;
                botId = status.ilink_bot_id || null;
                isLoggedIn = true;
                loginQrCodeUrl = null;

                log(`登录成功! botId=${botId}`);
                saveState();
                pollLoop();
                return { success: true, botId };
            }

            if (status.status === 'expired') {
                throw new Error('二维码已过期');
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        throw new Error('扫码超时');
    } catch (e) {
        log(`登录失败: ${e.message}`, 'ERROR');
        lastError = e.message;
        loginQrCodeUrl = null;
        return { success: false, error: e.message };
    }
}

function saveState() {
    try {
        const state = { botToken, botBaseUrl, botId, getUpdatesBuf };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        debug('状态已保存');
    } catch (e) {
        log(`保存状态失败: ${e.message}`, 'WARN');
    }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            botToken = state.botToken || null;
            botBaseUrl = state.botBaseUrl || ILINK_BASE_URL;
            botId = state.botId || null;
            getUpdatesBuf = state.getUpdatesBuf || '';
            if (botToken) {
                isLoggedIn = true;
                log(`从缓存恢复登录状态: botId=${botId}`);
                return true;
            }
        }
    } catch (e) {
        log(`加载状态失败: ${e.message}`, 'WARN');
    }
    return false;
}

function registerRoutes(app, adminApiRouter, config, projectBasePath) {
    pluginConfig = config || {};
    serverKey = process.env.Key || '';

    // 加载 AgentAssistant 模块用于 AI 调用
    try {
        const agentAssistantPath = path.join(__dirname, '..', 'AgentAssistant', 'AgentAssistant.js');
        if (fs.existsSync(agentAssistantPath)) {
            agentAssistantModule = require(agentAssistantPath);
            log('AgentAssistant 模块已加载');
        } else {
            log('AgentAssistant 模块未找到，将使用 HTTP 回退', 'WARN');
        }
    } catch (e) {
        log(`加载 AgentAssistant 失败: ${e.message}`, 'WARN');
    }

    log('WeChatBot 插件初始化...');

    app.get('/api/wechatbot/status', (req, res) => {
        res.json({
            isRunning, isLoggedIn, botId, lastError,
            recentContacts: Array.from(recentContacts.entries()).map(([id, info]) => ({
                id: id.substring(0, 12) + '...', ...info
            })),
            historyCount: conversationHistory.size
        });
    });

    app.post('/api/wechatbot/login', async (req, res) => {
        if (isLoggedIn) {
            return res.json({ success: false, error: '已经登录' });
        }
        isRunning = true;
        const result = await startLogin();
        res.json(result);
    });

    app.get('/api/wechatbot/qrcode', (req, res) => {
        res.json({ qrCodeUrl: loginQrCodeUrl });
    });

    app.post('/api/wechatbot/stop', (req, res) => {
        isRunning = false;
        isLoggedIn = false;
        botToken = null;
        loginQrCodeUrl = null;
        try { fs.unlinkSync(STATE_FILE); } catch (e) {}
        res.json({ success: true, message: 'Bot 已停止' });
    });

    isRunning = true;
    if (loadState()) {
        log('尝试恢复上次会话...');
        pollLoop().catch(e => {
            log(`恢复会话失败: ${e.message}`, 'ERROR');
            isLoggedIn = false;
        });
    } else {
        log('未找到缓存登录状态，等待手动登录');
    }
}

async function processToolCall(params) {
    const command = params.command || 'status';

    switch (command) {
        case 'status':
            return JSON.stringify({
                isRunning, isLoggedIn, botId, lastError,
                contacts: conversationHistory.size,
                uptime: isLoggedIn ? '运行中' : '未登录'
            });

        case 'send': {
            if (!isLoggedIn) return JSON.stringify({ error: '微信Bot未登录' });
            const to = params.to;
            const message = params.message;
            if (!to || !message) return JSON.stringify({ error: '缺少 to 或 message 参数' });

            let targetUserId = to;
            if (!to.includes('@im.wechat')) {
                for (const [userId] of recentContacts.entries()) {
                    if (userId.includes(to)) { targetUserId = userId; break; }
                }
            }

            try {
                await sendMessage(targetUserId, message, '');
                return JSON.stringify({ success: true, message: `已发送给 ${targetUserId.substring(0, 12)}...` });
            } catch (e) {
                return JSON.stringify({ error: `发送失败: ${e.message}` });
            }
        }

        case 'login': {
            if (isLoggedIn) return JSON.stringify({ error: '已经登录', botId });
            isRunning = true;
            try {
                const qrData = await getQrCode();
                log(`QR API 原始返回: ${JSON.stringify(qrData).substring(0, 500)}`);
                // 保存二维码ID用于后续轮询
                if (qrData.qrcode) {
                    // 异步启动扫码等待
                    waitForScanAndStart(qrData.qrcode);
                }
                return JSON.stringify({ 
                    message: '二维码已获取', 
                    qrcode: qrData.qrcode,
                    qrcode_url: qrData.qrcode_url || null,
                    has_img_content: !!qrData.qrcode_img_content,
                    img_content_preview: qrData.qrcode_img_content ? qrData.qrcode_img_content.substring(0, 100) : null,
                    raw_keys: Object.keys(qrData)
                });
            } catch (e) {
                return JSON.stringify({ error: `获取二维码失败: ${e.message}` });
            }
        }

        case 'logout': {
            isRunning = false;
            isLoggedIn = false;
            botToken = null;
            try { fs.unlinkSync(STATE_FILE); } catch (e) {}
            return JSON.stringify({ success: true, message: 'Bot 已登出' });
        }

        default:
            return JSON.stringify({ error: `未知命令: ${command}` });
    }
}

module.exports = { registerRoutes, processToolCall };
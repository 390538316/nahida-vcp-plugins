// Plugin/MetaThinkingObserver/MetaThinkingObserver.js
// 监听 PluginManager 的 vcp_info 事件流，过滤 META_THINKING_CHAIN 推送，落盘 JSONL。
// 不改源码，纯旁路观察。

const fs = require('fs');
const path = require('path');

let pluginManager = null;
let pluginConfig = {};
let debugMode = false;
let maxQueryPreviewLen = 200;
const dataDir = path.join(__dirname, 'data');

let listenerAttached = false;
let lastEventAt = null;
let totalEventsThisSession = 0;

// ---------- 工具函数 ----------

function ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function todayFile() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return path.join(dataDir, `raw_${y}-${m}-${day}.jsonl`);
}

function safeStr(v, max) {
    if (typeof v !== 'string') return '';
    return v.length > max ? v.slice(0, max) + '...' : v;
}

// ---------- 事件落盘 ----------

function recordEvent(data) {
    try {
        ensureDataDir();
        const event = {
            ts: new Date().toISOString(),
            chainName: data.chainName || 'default',
            isAutoMode: data.isAutoMode === true,
            useGroup: data.useGroup === true,
            activatedGroups: Array.isArray(data.activatedGroups) ? data.activatedGroups : [],
            stagesCount: Array.isArray(data.stages) ? data.stages.length : 0,
            stagesPath: Array.isArray(data.stages)
                ? data.stages.map(s => s && s.clusterName).filter(Boolean)
                : [],
            queryPreview: safeStr(data.query, maxQueryPreviewLen),
            fromCache: data.fromCache === true
        };
        fs.appendFileSync(todayFile(), JSON.stringify(event) + '\n', 'utf-8');
        lastEventAt = event.ts;
        totalEventsThisSession += 1;
    } catch (e) {
        if (debugMode) console.error('[MetaThinkingObserver] write fail:', e.message);
    }
}

// ---------- 事件监听挂载 ----------

function setupEventListeners() {
    if (!pluginManager) return;
    if (listenerAttached) return;

    pluginManager.on('vcp_info', (data) => {
        if (data && data.type === 'META_THINKING_CHAIN') {
            recordEvent(data);
        }
    });
    listenerAttached = true;
    if (debugMode) {
        console.log('[MetaThinkingObserver] vcp_info listener attached.');
    }
}

// ---------- 读取与统计 ----------

function readEventsForRange(days) {
    const events = [];
    if (!fs.existsSync(dataDir)) return events;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('raw_') && f.endsWith('.jsonl'));

    for (const f of files) {
        try {
            const content = fs.readFileSync(path.join(dataDir, f), 'utf-8');
            const lines = content.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const ev = JSON.parse(line);
                    if (new Date(ev.ts).getTime() >= cutoff) {
                        events.push(ev);
                    }
                } catch (_) { /* skip bad line */ }
            }
        } catch (_) { /* skip bad file */ }
    }
    return events;
}

function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
}

function buildSummary(days) {
    const events = readEventsForRange(days);
    if (events.length === 0) {
        return `[元思考链观察器] 最近 ${days} 天暂无数据。\n`
             + `提示：插件刚安装时数据为空，等几轮对话后再查。\n`
             + `本次会话累计接收事件: ${totalEventsThisSession} 条。`;
    }

    const total = events.length;
    const autoCount = events.filter(e => e.isAutoMode).length;
    const explicitCount = total - autoCount;
    const defaultHits = events.filter(e => e.chainName === 'default').length;
    const cacheHits = events.filter(e => e.fromCache).length;

    // 各链命中
    const chainHits = {};
    for (const e of events) {
        chainHits[e.chainName] = (chainHits[e.chainName] || 0) + 1;
    }
    const sortedChains = Object.entries(chainHits).sort((a, b) => b[1] - a[1]);

    // Top 激活语义组
    const groupHits = {};
    for (const e of events) {
        for (const g of e.activatedGroups) {
            groupHits[g] = (groupHits[g] || 0) + 1;
        }
    }
    const sortedGroups = Object.entries(groupHits).sort((a, b) => b[1] - a[1]).slice(0, 8);

    let out = '';
    out += `[元思考链观察器] 最近 ${days} 天统计\n`;
    out += `─────────────────────────────\n`;
    out += `总事件: ${total} 条 (auto: ${autoCount} / 指定: ${explicitCount})\n`;
    out += `命中 default: ${defaultHits} 次 (${(defaultHits / total * 100).toFixed(1)}%)\n`;
    out += `缓存命中: ${cacheHits} 次 (${(cacheHits / total * 100).toFixed(1)}%)\n\n`;

    out += `各链命中分布:\n`;
    for (const [name, count] of sortedChains) {
        const pct = (count / total * 100).toFixed(1);
        out += `  ${pad(name, 24)} ${pad(count + ' 次', 8)} (${pct}%)\n`;
    }

    if (sortedGroups.length > 0) {
        out += `\nTop 激活语义组:\n`;
        for (const [name, count] of sortedGroups) {
            out += `  ${pad(name, 24)} ${count} 次\n`;
        }
    }

    out += `\n本次会话已接收: ${totalEventsThisSession} 条`;
    if (lastEventAt) out += `, 最近一条: ${lastEventAt}`;
    out += '\n';

    return out;
}

// ---------- hybridservice 接口 ----------

async function initialize(config, dependencies) {
    pluginConfig = config || {};
    debugMode = pluginConfig.DebugMode === true;
    if (typeof pluginConfig.MaxQueryPreviewLen === 'number' && pluginConfig.MaxQueryPreviewLen > 0) {
        maxQueryPreviewLen = pluginConfig.MaxQueryPreviewLen;
    }
    ensureDataDir();

    try {
        pluginManager = require('../../Plugin.js');
        setupEventListeners();
    } catch (e) {
        console.error('[MetaThinkingObserver] failed to load PluginManager for event listening:', e.message);
    }

    if (debugMode) {
        console.log(`[MetaThinkingObserver] initialized. dataDir=${dataDir}`);
    }
}

async function processToolCall(args) {
    const command = (args && args.command) ? String(args.command).trim() : 'summary';

    try {
        if (command === 'summary') {
            const days = parseInt(args.days, 10) || 7;
            return buildSummary(days);
        }

        if (command === 'recent') {
            const limit = Math.max(1, Math.min(50, parseInt(args.limit, 10) || 10));
            const events = readEventsForRange(7);
            const recent = events.slice(-limit);
            if (recent.length === 0) return '[元思考链观察器] 暂无原始事件。';
            return '[元思考链观察器] 最近原始事件:\n' + JSON.stringify(recent, null, 2);
        }

        if (command === 'status') {
            ensureDataDir();
            const files = fs.readdirSync(dataDir).filter(f => f.startsWith('raw_'));
            return [
                '[元思考链观察器] 状态',
                `dataDir: ${dataDir}`,
                `数据文件数: ${files.length}`,
                `监听器已挂载: ${listenerAttached}`,
                `本次会话累计事件: ${totalEventsThisSession}`,
                `最近一条事件: ${lastEventAt || '(无)'}`
            ].join('\n');
        }

        return `[元思考链观察器] 未知命令: ${command}\n可用命令: summary [days=7] / recent [limit=10] / status`;
    } catch (e) {
        return `[元思考链观察器] 处理失败: ${e.message}`;
    }
}

async function shutdown() {
    if (debugMode) console.log('[MetaThinkingObserver] shutdown.');
}

module.exports = {
    initialize,
    processToolCall,
    shutdown
};
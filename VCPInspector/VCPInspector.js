// Plugin/VCPInspector/VCPInspector.js
// VCP 系统自检器 v0.1.0
// 纯只读检查，不修改任何文件。

const fs = require('fs');
const path = require('path');

const TOOLBOX_ROOT = path.resolve(__dirname, '../..');
const RAGPLUGIN_DIR = path.resolve(__dirname, '../RAGDiaryPlugin');
const VECTORSTORE_DIR = path.join(TOOLBOX_ROOT, 'VectorStore');
const DAILYNOTE_DIR = path.join(TOOLBOX_ROOT, 'dailynote');

let pluginConfig = {};
let debugMode = false;

// ========== 工具函数 ==========

function log(...args) {
    if (debugMode) console.log('[VCPInspector]', ...args);
}

function fileExists(p) {
    try { fs.statSync(p); return true; } catch { return false; }
}

function readJSON(p) {
    try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        return { _error: e.message };
    }
}

function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
}

// ========== CheckMetaThinking ==========

function checkMetaThinking() {
    const issues = [];
    const info = [];

    // 1. meta_thinking_chains.json 是否存在
    const chainsPath = path.join(RAGPLUGIN_DIR, 'meta_thinking_chains.json');
    if (!fileExists(chainsPath)) {
        return '[VCPInspector] P0 致命: meta_thinking_chains.json 不存在!';
    }

    const chainsData = readJSON(chainsPath);
    if (chainsData._error) {
        return `[VCPInspector] P0 致命: meta_thinking_chains.json 解析失败: ${chainsData._error}`;
    }

    const chains = chainsData.chains || {};
    const chainNames = Object.keys(chains);
    info.push(`链定义数量: ${chainNames.length}`);
    info.push(`default_threshold: ${chainsData.default_threshold || '未设置'}`);

    // 2. 是否有 default 链
    if (!chains['default']) {
        issues.push({ level: 'P0', msg: '缺少 default 链定义' });
    }

    // 3. 获取向量库中实际存在的 diary_name
    let existingClusters = new Set();
    try {
        const Database = require('better-sqlite3');
        const dbPath = path.join(VECTORSTORE_DIR, 'knowledge_base.sqlite');
        if (fileExists(dbPath)) {
            const db = new Database(dbPath, { readonly: true });
            const rows = db.prepare('SELECT DISTINCT diary_name FROM files').all();
            existingClusters = new Set(rows.map(r => r.diary_name));
            db.close();
            info.push(`向量库 diary_name 数量: ${existingClusters.size}`);
        } else {
            issues.push({ level: 'P1', msg: 'knowledge_base.sqlite 不存在' });
        }
    } catch (e) {
        issues.push({ level: 'P1', msg: `读取向量库失败: ${e.message}` });
    }

    // 4. 逐链检查
    for (const [chainName, config] of Object.entries(chains)) {
        const clusters = config.clusters || [];
        const kSeq = config.kSequence || [];

        // kSequence 长度匹配
        if (clusters.length !== kSeq.length) {
            issues.push({
                level: 'P0',
                msg: `链 "${chainName}": clusters(${clusters.length}) != kSequence(${kSeq.length})`
            });
        }

        // 空 clusters
        if (clusters.length === 0) {
            issues.push({ level: 'P0', msg: `链 "${chainName}": clusters 为空` });
        }

        // K 值合理性
        for (let i = 0; i < kSeq.length; i++) {
            if (kSeq[i] < 1 || kSeq[i] > 10) {
                issues.push({
                    level: 'P2',
                    msg: `链 "${chainName}" 阶段${i + 1}: K=${kSeq[i]} 超出合理范围[1,10]`
                });
            }
        }

        // cluster 是否存在于向量库
        if (existingClusters.size > 0) {
            const uniqueClusters = [...new Set(clusters)];
            for (const cluster of uniqueClusters) {
                if (!existingClusters.has(cluster)) {
                    issues.push({
                        level: 'P0',
                        msg: `链 "${chainName}": cluster "${cluster}" 在向量库中不存在`
                    });
                }
            }
        }

        // themeKeywords 检查（非 default 链）
        if (chainName !== 'default' && !config.themeKeywords) {
            issues.push({
                level: 'P2',
                msg: `链 "${chainName}": 缺少 themeKeywords（Auto模式下向量区分度可能不足）`
            });
        }
    }

    // 5. 缓存一致性
    const cachePath = path.join(RAGPLUGIN_DIR, 'meta_chain_vector_cache.json');
    if (fileExists(cachePath)) {
        const cache = readJSON(cachePath);
        if (!cache._error) {
            const cachedChains = Object.keys(cache.vectors || {});
            const expectedChains = chainNames.filter(n => n !== 'default');
            const missing = expectedChains.filter(n => !cachedChains.includes(n));
            const stale = cachedChains.filter(n => !expectedChains.includes(n));

            if (missing.length > 0) {
                issues.push({
                    level: 'P1',
                    msg: `向量缓存缺少: ${missing.join(', ')}（需重建缓存）`
                });
            }
            if (stale.length > 0) {
                issues.push({
                    level: 'P2',
                    msg: `向量缓存有残留: ${stale.join(', ')}（已删除的链仍有缓存）`
                });
            }
            info.push(`缓存创建时间: ${cache.createdAt || '未知'}`);
        }
    } else {
        issues.push({ level: 'P1', msg: 'meta_chain_vector_cache.json 不存在（首次启动会自动生成）' });
    }

    // 6. 重复 cluster 检测
    for (const [chainName, config] of Object.entries(chains)) {
        const clusters = config.clusters || [];
        const allSame = clusters.length > 2 && clusters.every(c => c === clusters[0]);
        if (allSame) {
            issues.push({
                level: 'INFO',
                msg: `链 "${chainName}": 所有阶段使用同一 cluster "${clusters[0]}"（递归增强效果有限）`
            });
        }
    }

    // ========== 格式化输出 ==========
    let out = '';
    out += `[VCPInspector] 元思考链健康检查报告\n`;
    out += `═══════════════════════════════════════\n`;
    out += info.join('\n') + '\n\n';

    if (issues.length === 0) {
        out += `✅ 全部通过，未发现问题。\n`;
    } else {
        const p0 = issues.filter(i => i.level === 'P0');
        const p1 = issues.filter(i => i.level === 'P1');
        const p2 = issues.filter(i => i.level === 'P2');
        const inf = issues.filter(i => i.level === 'INFO');

        out += `发现 ${issues.length} 个问题:\n`;
        out += `  P0(致命): ${p0.length}  P1(高): ${p1.length}  P2(中): ${p2.length}  INFO: ${inf.length}\n\n`;

        for (const issue of issues) {
            out += `  [${pad(issue.level, 4)}] ${issue.msg}\n`;
        }
    }

    out += `\n═══════════════════════════════════════\n`;
    return out;
}

// ========== CheckConfig ==========

function checkConfig() {
    const issues = [];
    const info = [];

    // 1. rag_params.json
    const ragParamsPath = path.join(TOOLBOX_ROOT, 'rag_params.json');
    if (fileExists(ragParamsPath)) {
        const params = readJSON(ragParamsPath);
        if (params._error) {
            issues.push({ level: 'P0', msg: `rag_params.json 解析失败: ${params._error}` });
        } else {
            info.push(`rag_params.json: OK`);
            if (params.RAGDiaryPlugin && params.RAGDiaryPlugin.metaThinkingWeights) {
                info.push(`  metaThinkingWeights: [${params.RAGDiaryPlugin.metaThinkingWeights.join(', ')}]`);
            }
        }
    } else {
        issues.push({ level: 'P0', msg: 'rag_params.json 不存在' });
    }

    // 2. dailynote 目录
    if (fileExists(DAILYNOTE_DIR)) {
        const dirs = fs.readdirSync(DAILYNOTE_DIR).filter(f => {
            return fs.statSync(path.join(DAILYNOTE_DIR, f)).isDirectory();
        });
        info.push(`dailynote 子目录数: ${dirs.length}`);

        // 检查空目录
        const emptyDirs = dirs.filter(d => {
            const contents = fs.readdirSync(path.join(DAILYNOTE_DIR, d));
            return contents.length === 0;
        });
        if (emptyDirs.length > 0) {
            issues.push({
                level: 'P2',
                msg: `dailynote 空目录(${emptyDirs.length}): ${emptyDirs.slice(0, 5).join(', ')}${emptyDirs.length > 5 ? '...' : ''}`
            });
        }
    } else {
        issues.push({ level: 'P0', msg: 'dailynote 目录不存在' });
    }

    // 3. Agent 目录（Agent 是 .txt 文件，不是子目录）
    const agentDir = path.join(TOOLBOX_ROOT, 'Agent');
    if (fileExists(agentDir)) {
        const agentFiles = fs.readdirSync(agentDir).filter(f => {
            return f.endsWith('.txt') && !f.includes('.backup');
        });
        info.push(`Agent 人设文件数: ${agentFiles.length}`);
        info.push(`  活跃Agent: ${agentFiles.map(f => f.replace('.txt', '')).join(', ')}`);
    }

    // 4. rag_tags.json
    const ragTagsPath = path.join(RAGPLUGIN_DIR, 'rag_tags.json');
    if (fileExists(ragTagsPath)) {
        const tags = readJSON(ragTagsPath);
        if (!tags._error) {
            const tagCount = Object.keys(tags).length;
            info.push(`rag_tags.json 条目数: ${tagCount}`);
        }
    } else {
        issues.push({ level: 'P1', msg: 'rag_tags.json 不存在' });
    }

    // 5. semantic_groups.json
    const sgPath = path.join(RAGPLUGIN_DIR, 'semantic_groups.json');
    if (fileExists(sgPath)) {
        const sg = readJSON(sgPath);
        if (!sg._error) {
            const groupCount = Array.isArray(sg) ? sg.length : Object.keys(sg).length;
            info.push(`semantic_groups.json 组数: ${groupCount}`);
        }
    } else {
        issues.push({ level: 'P1', msg: 'semantic_groups.json 不存在' });
    }

    // 6. config.env 存在性
    const configEnvPath = path.join(TOOLBOX_ROOT, 'config.env');
    if (fileExists(configEnvPath)) {
        info.push(`config.env: 存在 (${(fs.statSync(configEnvPath).size / 1024).toFixed(1)} KB)`);
    } else {
        issues.push({ level: 'P0', msg: 'config.env 不存在' });
    }

    // ========== 格式化输出 ==========
    let out = '';
    out += `[VCPInspector] VCP 配置一致性检查报告\n`;
    out += `═══════════════════════════════════════\n`;
    out += info.join('\n') + '\n\n';

    if (issues.length === 0) {
        out += `✅ 全部通过，未发现问题。\n`;
    } else {
        const p0 = issues.filter(i => i.level === 'P0');
        const p1 = issues.filter(i => i.level === 'P1');
        const p2 = issues.filter(i => i.level === 'P2');

        out += `发现 ${issues.length} 个问题:\n`;
        out += `  P0(致命): ${p0.length}  P1(高): ${p1.length}  P2(中): ${p2.length}\n\n`;

        for (const issue of issues) {
            out += `  [${pad(issue.level, 4)}] ${issue.msg}\n`;
        }
    }

    out += `\n═══════════════════════════════════════\n`;
    return out;
}

// ========== DiffFile ==========

function diffFile(args) {
    const localPath = args.local_path;
    const externalContent = args.external_content;

    if (!localPath || !externalContent) {
        return '[VCPInspector] DiffFile 需要 local_path 和 external_content 参数';
    }

    // 解析本地路径（支持相对路径）
    let fullLocalPath = localPath;
    if (!path.isAbsolute(localPath)) {
        fullLocalPath = path.join(TOOLBOX_ROOT, localPath);
    }

    if (!fileExists(fullLocalPath)) {
        return `[VCPInspector] 本地文件不存在: ${fullLocalPath}\n提示: 这可能是一个全新文件，不是补丁。`;
    }

    const localContent = fs.readFileSync(fullLocalPath, 'utf-8');
    const localLines = localContent.split('\n');
    const externalLines = externalContent.split('\n');

    // 基础统计
    let out = '';
    out += `[VCPInspector] 文件 Diff 审计报告\n`;
    out += `═══════════════════════════════════════\n`;
    out += `本地文件: ${fullLocalPath}\n`;
    out += `本地行数: ${localLines.length}  外部行数: ${externalLines.length}\n`;
    out += `本地大小: ${localContent.length} chars  外部大小: ${externalContent.length} chars\n\n`;

    // 简单 diff：找新增和删除的行
    const localSet = new Set(localLines.map(l => l.trim()).filter(l => l.length > 0));
    const externalSet = new Set(externalLines.map(l => l.trim()).filter(l => l.length > 0));

    const added = [...externalSet].filter(l => !localSet.has(l));
    const removed = [...localSet].filter(l => !externalSet.has(l));

    out += `新增行: ${added.length}  删除行: ${removed.length}\n\n`;

    // 函数级 diff
    const localFuncs = extractFunctions(localContent);
    const externalFuncs = extractFunctions(externalContent);

    const localFuncNames = new Set(localFuncs.map(f => f.name));
    const externalFuncNames = new Set(externalFuncs.map(f => f.name));

    const newFuncs = [...externalFuncNames].filter(n => !localFuncNames.has(n));
    const removedFuncs = [...localFuncNames].filter(n => !externalFuncNames.has(n));
    const sharedFuncs = [...localFuncNames].filter(n => externalFuncNames.has(n));

    if (newFuncs.length > 0) {
        out += `新增函数/方法:\n`;
        for (const f of newFuncs) out += `  + ${f}\n`;
        out += '\n';
    }
    if (removedFuncs.length > 0) {
        out += `删除函数/方法:\n`;
        for (const f of removedFuncs) out += `  - ${f}\n`;
        out += '\n';
    }

    // 修改的函数
    const modifiedFuncs = [];
    for (const name of sharedFuncs) {
        const localFunc = localFuncs.find(f => f.name === name);
        const externalFunc = externalFuncs.find(f => f.name === name);
        if (localFunc && externalFunc && localFunc.body !== externalFunc.body) {
            modifiedFuncs.push(name);
        }
    }
    if (modifiedFuncs.length > 0) {
        out += `修改的函数/方法:\n`;
        for (const f of modifiedFuncs) out += `  ~ ${f}\n`;
        out += '\n';
    }

    // 风险扫描
    const risks = [];
    const dangerPatterns = [
        { pattern: /child_process/g, desc: '使用 child_process（可执行系统命令）' },
        { pattern: /\beval\s*\(/g, desc: '使用 eval（代码注入风险）' },
        { pattern: /fs\.(unlink|rmdir|rm)\b/g, desc: '文件删除操作' },
        { pattern: /process\.exit/g, desc: '强制退出进程' },
        { pattern: /https?:\/\/[^\s'"]+/g, desc: '包含外部 URL' },
        { pattern: /require\s*\(\s*['"][^.\/]/g, desc: '引入外部包（非相对路径）' }
    ];

    for (const { pattern, desc } of dangerPatterns) {
        const matches = externalContent.match(pattern);
        if (matches && matches.length > 0) {
            // 检查是否是新增的
            const localMatches = localContent.match(pattern);
            const localCount = localMatches ? localMatches.length : 0;
            if (matches.length > localCount) {
                risks.push(`⚠️  ${desc} (新增 ${matches.length - localCount} 处)`);
            }
        }
    }

    if (risks.length > 0) {
        out += `风险扫描:\n`;
        for (const r of risks) out += `  ${r}\n`;
        out += '\n';
    } else {
        out += `风险扫描: 未发现新增高危模式 ✅\n\n`;
    }

    // 接口依赖分析
    const depPattern = /this\.ragPlugin\.(\w+)/g;
    const externalDeps = new Set();
    let match;
    while ((match = depPattern.exec(externalContent)) !== null) {
        externalDeps.add(match[1]);
    }
    if (externalDeps.size > 0) {
        out += `外部文件依赖的 ragPlugin 接口:\n`;
        for (const dep of externalDeps) out += `  • ${dep}\n`;
    }

    out += `\n═══════════════════════════════════════\n`;
    out += `建议: 逐函数审查修改点后，备份本地文件再合并。\n`;
    return out;
}

function extractFunctions(code) {
    const funcs = [];
    // 匹配: function name(, async function name(, name(, async name(
    const funcRegex = /(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
    // 匹配: class method
    const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;

    let m;
    while ((m = funcRegex.exec(code)) !== null) {
        // 简单提取函数体（找到匹配的闭合大括号）
        const startIdx = m.index;
        const bodyStart = code.indexOf('{', startIdx);
        let depth = 0;
        let endIdx = bodyStart;
        for (let i = bodyStart; i < code.length; i++) {
            if (code[i] === '{') depth++;
            if (code[i] === '}') depth--;
            if (depth === 0) { endIdx = i; break; }
        }
        funcs.push({
            name: m[1],
            body: code.slice(bodyStart, endIdx + 1)
        });
    }
    return funcs;
}

// ========== hybridservice 接口 ==========

async function initialize(config) {
    pluginConfig = config || {};
    debugMode = pluginConfig.DebugMode === true;
    log('initialized.');
}

async function processToolCall(args) {
    const command = (args && args.command) ? String(args.command).trim() : '';

    try {
        switch (command) {
            case 'CheckMetaThinking':
                return checkMetaThinking();
            case 'CheckConfig':
                return checkConfig();
            case 'DiffFile':
                return diffFile(args);
            default:
                return `[VCPInspector] 未知命令: ${command}\n可用命令: CheckMetaThinking / CheckConfig / DiffFile`;
        }
    } catch (e) {
        return `[VCPInspector] 执行失败: ${e.message}\n${e.stack || ''}`;
    }
}

async function shutdown() {
    log('shutdown.');
}

module.exports = {
    initialize,
    processToolCall,
    shutdown
};
// Plugin/MetaThinkingEnhancer/MetaThinkingEnhancer.js
// VCP 元思考链增强器 - 外置补丁管理框架
// 通过标记化代码注入为 MetaThinkingManager 添加可开关的增强功能

const fs = require('fs').promises;
const path = require('path');
const PristineManager = require('./pristine.js');

const MARKER_START = (id) => `// [VCP_ENHANCER_START:${id}]`;
const MARKER_END = (id) => `// [VCP_ENHANCER_END:${id}]`;

class MetaThinkingEnhancer {
    constructor(plugin) {
        this.plugin = plugin;
        this.pluginDir = __dirname;
        this.config = null;
        this.injections = new Map(); // id -> injection module
        this.pristine = null;
        this.debug = false;
    }

    // ========== 生命周期 ==========

    async initialize() {
        try {
            await this.loadConfig();
            await this.loadInjections();
            this.pristine = new PristineManager(this.pluginDir, this.config.targetFile);
            this.debug = this.plugin?.config?.DebugMode || false;
            this._log('初始化完成');
            return true;
        } catch (err) {
            console.error('[MetaThinkingEnhancer] 初始化失败:', err.message);
            return false;
        }
    }

    // ========== 配置管理 ==========

    async loadConfig() {
        const configPath = path.join(this.pluginDir, 'config.json');
        const raw = await fs.readFile(configPath, 'utf-8');
        this.config = JSON.parse(raw);
        this._log('配置已加载');
    }

    async saveConfig() {
        const configPath = path.join(this.pluginDir, 'config.json');
        await fs.writeFile(configPath, JSON.stringify(this.config, null, 4), 'utf-8');
        this._log('配置已保存');
    }

    // ========== 注入模块加载 ==========

    async loadInjections() {
        this.injections.clear();
        const injectionsDir = path.join(this.pluginDir, 'injections');

        let files;
        try {
            files = await fs.readdir(injectionsDir);
        } catch (err) {
            console.warn('[MetaThinkingEnhancer] injections 目录读取失败:', err.message);
            return;
        }

        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            try {
                const modulePath = path.join(injectionsDir, file);
                // 清除 require 缓存以支持热更新
                delete require.cache[require.resolve(modulePath)];
                const injection = require(modulePath);
                if (injection && injection.id) {
                    this.injections.set(injection.id, injection);
                    this._log(`加载注入模块: ${injection.id}`);
                }
            } catch (err) {
                console.error(`[MetaThinkingEnhancer] 加载注入模块 ${file} 失败:`, err.message);
            }
        }
    }

    // ========== 目标文件操作 ==========

    async readTargetFile() {
        return await fs.readFile(this.config.targetFile, 'utf-8');
    }

    async writeTargetFile(content) {
        await fs.writeFile(this.config.targetFile, content, 'utf-8');
    }

    async createBackup() {
        if (!this.config.backup) return null;

        const backupDir = path.join(this.pluginDir, this.config.backupDir || 'backups');
        await fs.mkdir(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `MetaThinkingManager_${timestamp}.js`);

        const content = await this.readTargetFile();
        await fs.writeFile(backupPath, content, 'utf-8');
        this._log(`备份已创建: ${backupPath}`);
        return backupPath;
    }

    // ========== 状态检测 ==========

    /**
     * 获取单个注入的状态
     * @returns {object} { id, enabled, injected, anchorFound, markerValid, status }
     */
    getInjectionStatus(id, targetContent) {
        const injConfig = this.config.injections[id];
        const injection = this.injections.get(id);

        if (!injConfig || !injection) {
            return { id, enabled: false, injected: false, anchorFound: false, markerValid: false, status: 'not_found' };
        }

        const startMarker = MARKER_START(id);
        const endMarker = MARKER_END(id);
        const hasStart = targetContent.includes(startMarker);
        const hasEnd = targetContent.includes(endMarker);
        const anchorFound = targetContent.includes(injConfig.anchor);

        let injected = false;
        let markerState = 'absent'; // absent | valid | broken

        if (hasStart && hasEnd) {
            const startIdx = targetContent.indexOf(startMarker);
            const endIdx = targetContent.indexOf(endMarker);
            if (startIdx < endIdx) {
                markerState = 'valid';
                injected = true;
            } else {
                markerState = 'broken';
                injected = false;
            }
        } else if (hasStart || hasEnd) {
            markerState = 'broken';
            injected = false;
        }

        let status;
        if (markerState === 'broken') {
            status = 'marker_broken';
        } else if (!anchorFound && !injected) {
            status = 'anchor_missing';
        } else if (injConfig.enabled && injected) {
            status = 'injected';
        } else if (injConfig.enabled && !injected) {
            status = 'enabled_not_injected';
        } else if (!injConfig.enabled && injected) {
            status = 'disabled_but_injected';
        } else {
            status = 'disabled';
        }

        return { id, enabled: injConfig.enabled, injected, anchorFound, markerState, status };
    }

    /**
     * 获取所有注入的状态
     */
    async getAllStatus() {
        const targetContent = await this.readTargetFile();
        const results = [];

        for (const [id, injection] of this.injections) {
            const status = this.getInjectionStatus(id, targetContent);
            status.name = injection.name || id;
            status.description = injection.description || '';
            status.version = injection.version || '0.0.0';
            status.details = injection.details || null;
            results.push(status);
        }

        return {
            targetFile: this.config.targetFile,
            injections: results
        };
    }

    // ========== 注入与卸载 ==========

    /**
     * 将注入代码插入目标文件内容
     * @returns {string|null} 修改后的内容，失败返回 null
     */
    inject(targetContent, id) {
        const injConfig = this.config.injections[id];
        const injection = this.injections.get(id);

        if (!injConfig || !injection) return null;

        // 已注入则跳过
        if (targetContent.includes(MARKER_START(id))) {
            this._log(`${id} 已注入，跳过`);
            return targetContent;
        }

        // 检查锚点
        const anchorIdx = targetContent.indexOf(injConfig.anchor);
        if (anchorIdx === -1) {
            console.error(`[MetaThinkingEnhancer] 锚点未找到: "${injConfig.anchor}"`);
            return null;
        }

        // 生成注入块
        const code = injection.getCode();
        const block = `${MARKER_START(id)}\n${code}\n${MARKER_END(id)}\n`;

        // 根据 position 决定插入位置
        let result;
        if (injConfig.position === 'before') {
            // 找到锚点所在行的开头
            const lineStart = targetContent.lastIndexOf('\n', anchorIdx) + 1;
            const indent = targetContent.slice(lineStart, anchorIdx).match(/^(\s*)/)?.[1] || '';
            const indentedBlock = block.split('\n').map(line => line ? indent + line : '').join('\n');
            result = targetContent.slice(0, lineStart) + indentedBlock + '\n' + targetContent.slice(lineStart);
        } else if (injConfig.position === 'after') {
            // 找到锚点所在行的末尾
            const lineEnd = targetContent.indexOf('\n', anchorIdx);
            result = targetContent.slice(0, lineEnd + 1) + block + targetContent.slice(lineEnd + 1);
        } else {
            console.error(`[MetaThinkingEnhancer] 未知 position: ${injConfig.position}`);
            return null;
        }

        this._log(`${id} 注入成功`);
        return result;
    }

    /**
     * 从目标文件内容中移除注入块
     * @returns {string} 修改后的内容
     */
    remove(targetContent, id) {
        const startMarker = MARKER_START(id);
        const endMarker = MARKER_END(id);

        const startIdx = targetContent.indexOf(startMarker);
        const endIdx = targetContent.indexOf(endMarker);

        if (startIdx === -1 || endIdx === -1) {
            this._log(`${id} 未找到标记，无需移除`);
            return targetContent;
        }

        // 找到 start 标记所在行的开头
        const lineStart = targetContent.lastIndexOf('\n', startIdx);
        // 找到 end 标记所在行的末尾
        const lineEnd = targetContent.indexOf('\n', endIdx);

        const before = targetContent.slice(0, lineStart === -1 ? 0 : lineStart);
        const after = targetContent.slice(lineEnd === -1 ? targetContent.length : lineEnd);

        this._log(`${id} 已移除`);
        return before + after;
    }

    // ========== 核心操作：从 pristine 重建 ==========

    /**
     * 应用配置 = 从 pristine 复制一份 + 叠加所有 enabled 注入 + 写回目标文件
     *
     * 流程：
     *   1. ensure pristine（按需创建/更新）
     *   2. 读 pristine 当作干净基底
     *   3. 按 config 顺序，把 enabled=true 的注入依次叠加
     *   4. 与当前目标文件对比，有差异才写
     *   5. 写入前备份当前目标文件（滚动备份，可回滚到上一态）
     */
    async apply() {
        const results = [];

        // 1. pristine 同步
        const pristineResult = await this.pristine.ensure();
        if (pristineResult.action === 'error') {
            return {
                modified: false,
                results: [],
                pristine: pristineResult,
                message: `pristine 同步失败: ${pristineResult.message}`
            };
        }

        // 2. 从 pristine 读取干净基底
        let rebuilt = await this.pristine.readPristine();
        const currentTarget = await this.readTargetFile();

        // 3. 叠加注入
        for (const [id, injection] of this.injections) {
            const injConfig = this.config.injections[id];
            if (!injConfig) {
                results.push({ id, action: 'skip', reason: 'no_config' });
                continue;
            }

            if (!injConfig.enabled) {
                results.push({ id, action: 'skip', reason: 'disabled' });
                continue;
            }

            // 检查锚点是否存在于 pristine 中
            if (!rebuilt.includes(injConfig.anchor)) {
                results.push({ id, action: 'failed', reason: 'anchor_missing_in_pristine' });
                continue;
            }

            const newContent = this.inject(rebuilt, id);
            if (newContent) {
                rebuilt = newContent;
                results.push({ id, action: 'applied' });
            } else {
                results.push({ id, action: 'failed', reason: 'inject_error' });
            }
        }

        // 4. 对比并决定是否写入
        const modified = rebuilt !== currentTarget;

        if (modified) {
            await this.createBackup();
            await this.writeTargetFile(rebuilt);
            this._log('目标文件已重建');
        }

        return {
            modified,
            pristine: pristineResult,
            results,
            message: modified
                ? '已重建目标文件，请重启 VCPToolBox 生效。'
                : '无需修改（目标文件已与配置一致）。'
        };
    }

    // ========== 开关操作 ==========

    async toggle(id, enabled) {
        if (!this.config.injections[id]) {
            return { success: false, error: `注入 "${id}" 不存在` };
        }

        this.config.injections[id].enabled = enabled;
        await this.saveConfig();

        const applyResult = await this.apply();
        return { success: true, id, enabled, ...applyResult };
    }

    // ========== 工具调用入口 ==========

    async handleCommand(command, params) {
        switch (command) {
            case 'status': {
                const allStatus = await this.getAllStatus();
                const pristineStatus = await this.pristine.getStatus();
                return { ...allStatus, pristine: pristineStatus };
            }

            case 'apply':
                return await this.apply();

            case 'toggle': {
                const { id, enabled } = params || {};
                if (!id || typeof enabled === 'undefined') {
                    return { error: '缺少参数: id, enabled' };
                }
                return await this.toggle(id, enabled === 'true' || enabled === true);
            }

            case 'pristine_status':
                return await this.pristine.getStatus();

            case 'pristine_sync':
                return await this.pristine.forceSync();

            default:
                return { error: `未知命令: ${command}` };
        }
    }

    // ========== 工具 ==========

    _log(msg) {
        if (this.debug) {
            console.log(`[MetaThinkingEnhancer] ${msg}`);
        }
    }
}

// ========== VCP hybridservice 插件入口 ==========

let enhancerInstance = null;

async function initialize(config, dependencies) {
    enhancerInstance = new MetaThinkingEnhancer({ config, dependencies });
    await enhancerInstance.initialize();
}

async function processToolCall(args) {
    try {
        if (!enhancerInstance) {
            enhancerInstance = new MetaThinkingEnhancer({ config: {}, dependencies: {} });
            await enhancerInstance.initialize();
        }

        const command = args?.command || 'status';
        const result = await enhancerInstance.handleCommand(command, args);

        if (typeof result === 'string') return result;
        return JSON.stringify(result, null, 2);
    } catch (err) {
        return `[MetaThinkingEnhancer] 处理失败: ${err.message}`;
    }
}

async function shutdown() {
    enhancerInstance = null;
}

// ========== Admin API 路由（供桌面 widget 调用） ==========
// 走 /admin_api/MetaThinkingEnhancer/* 路径，用 Basic Auth
// 这样桌面 widget 可以通过 vcpAPI.fetch 直接控制
function registerRoutes(app, adminApiRouter, pluginConfig, projectBasePath) {
    if (!adminApiRouter) {
        console.warn('[MetaThinkingEnhancer] adminApiRouter 不可用，跳过路由注册');
        return;
    }

    const ensureInstance = async () => {
        if (!enhancerInstance) {
            enhancerInstance = new MetaThinkingEnhancer({ config: pluginConfig || {}, dependencies: {} });
            await enhancerInstance.initialize();
        }
        return enhancerInstance;
    };

    // GET /admin_api/MetaThinkingEnhancer/status
    adminApiRouter.get('/MetaThinkingEnhancer/status', async (req, res) => {
        try {
            const inst = await ensureInstance();
            const allStatus = await inst.getAllStatus();
            const pristineStatus = await inst.pristine.getStatus();
            res.json({ ok: true, ...allStatus, pristine: pristineStatus });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // POST /admin_api/MetaThinkingEnhancer/apply
    adminApiRouter.post('/MetaThinkingEnhancer/apply', async (req, res) => {
        try {
            const inst = await ensureInstance();
            const result = await inst.apply();
            res.json({ ok: true, ...result });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // POST /admin_api/MetaThinkingEnhancer/toggle  body: { id, enabled }
    adminApiRouter.post('/MetaThinkingEnhancer/toggle', async (req, res) => {
        try {
            const { id, enabled } = req.body || {};
            if (!id || typeof enabled === 'undefined') {
                return res.status(400).json({ ok: false, error: '缺少参数 id 或 enabled' });
            }
            const inst = await ensureInstance();
            const result = await inst.toggle(id, enabled === true || enabled === 'true');
            res.json({ ok: true, ...result });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // POST /admin_api/MetaThinkingEnhancer/pristine_sync
    adminApiRouter.post('/MetaThinkingEnhancer/pristine_sync', async (req, res) => {
        try {
            const inst = await ensureInstance();
            const result = await inst.pristine.forceSync();
            res.json({ ok: true, ...result });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    console.log('[MetaThinkingEnhancer] Admin API 路由已注册到 /admin_api/MetaThinkingEnhancer/*');
}

module.exports = {
    initialize,
    processToolCall,
    shutdown,
    registerRoutes,
    MetaThinkingEnhancer
};
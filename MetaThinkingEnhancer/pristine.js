// Plugin/MetaThinkingEnhancer/pristine.js
// pristine = "VCP 当前发版的纯净版本" 的物理映像
// 跟随 VCP 更新而变，但不会被注入逻辑污染
// 注入时从 pristine 复制一份再叠加，目标文件随时可被重建

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const ENHANCER_MARKER_RE = /\/\/\s*\[VCP_ENHANCER_(START|END):/;

class PristineManager {
    constructor(pluginDir, targetFile) {
        this.pluginDir = pluginDir;
        this.targetFile = targetFile;
        this.pristineDir = path.join(pluginDir, 'pristine');
        // pristine 文件名跟目标文件保持对应
        const baseName = path.basename(targetFile, path.extname(targetFile));
        this.pristineFile = path.join(this.pristineDir, `${baseName}.pristine.js`);
        this.metaFile = path.join(this.pristineDir, 'pristine.meta.json');
    }

    _hash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    _hasEnhancerMarker(content) {
        return ENHANCER_MARKER_RE.test(content);
    }

    async exists() {
        try {
            await fs.access(this.pristineFile);
            await fs.access(this.metaFile);
            return true;
        } catch {
            return false;
        }
    }

    async readPristine() {
        return await fs.readFile(this.pristineFile, 'utf-8');
    }

    async readMeta() {
        try {
            const raw = await fs.readFile(this.metaFile, 'utf-8');
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    async _writePristine(content, sourceHash) {
        await fs.mkdir(this.pristineDir, { recursive: true });
        await fs.writeFile(this.pristineFile, content, 'utf-8');
        const meta = {
            sourceFile: this.targetFile,
            pristineFile: this.pristineFile,
            syncedAt: new Date().toISOString(),
            sourceHash,
            sourceSize: Buffer.byteLength(content, 'utf-8')
        };
        await fs.writeFile(this.metaFile, JSON.stringify(meta, null, 2), 'utf-8');
        return meta;
    }

    /**
     * 启动/apply 前调用，决定是否要更新 pristine
     *
     * 决策表:
     *   pristine状态  目标文件状态           行为
     *   不存在        无标记                 创建 pristine
     *   不存在        有标记                 拒绝 (要求先手动还原)
     *   存在          有标记                 不动 (目标处于增强态)
     *   存在          无标记 + hash 一致     不动 (已同步)
     *   存在          无标记 + hash 不同     更新 pristine (VCP 升级)
     */
    async ensure() {
        const targetContent = await fs.readFile(this.targetFile, 'utf-8');
        const targetHash = this._hash(targetContent);
        const targetHasMarker = this._hasEnhancerMarker(targetContent);
        const pristineExists = await this.exists();

        if (!pristineExists) {
            if (targetHasMarker) {
                return {
                    action: 'error',
                    reason: 'target_already_enhanced_no_pristine',
                    message: '目标文件已包含增强标记但 pristine 不存在。请先手动还原目标文件后再初始化 pristine。'
                };
            }
            const meta = await this._writePristine(targetContent, targetHash);
            return { action: 'created', meta };
        }

        if (targetHasMarker) {
            return { action: 'skip', reason: 'target_enhanced' };
        }

        const meta = await this.readMeta();
        if (meta && meta.sourceHash === targetHash) {
            return { action: 'skip', reason: 'in_sync' };
        }

        // VCP 更新检测：目标无标记 + hash 不同
        const newMeta = await this._writePristine(targetContent, targetHash);
        return {
            action: 'updated',
            reason: 'vcp_updated',
            previousHash: meta?.sourceHash,
            currentHash: targetHash,
            meta: newMeta
        };
    }

    /**
     * 强制把当前目标文件设为 pristine，覆盖现有 pristine
     * 仅在目标文件确实纯净时才允许
     */
    async forceSync() {
        const targetContent = await fs.readFile(this.targetFile, 'utf-8');
        const targetHash = this._hash(targetContent);

        if (this._hasEnhancerMarker(targetContent)) {
            return {
                action: 'error',
                reason: 'target_has_marker',
                message: '目标文件包含增强标记，拒绝同步为 pristine。请先卸载所有注入。'
            };
        }

        const meta = await this._writePristine(targetContent, targetHash);
        return { action: 'force_synced', meta };
    }

    async getStatus() {
        const targetContent = await fs.readFile(this.targetFile, 'utf-8');
        const targetHash = this._hash(targetContent);
        const targetHasMarker = this._hasEnhancerMarker(targetContent);
        const pristineExists = await this.exists();
        const meta = pristineExists ? await this.readMeta() : null;

        return {
            pristineExists,
            pristineMeta: meta,
            targetHash,
            targetHasMarker,
            targetSize: Buffer.byteLength(targetContent, 'utf-8'),
            inSync: !!(meta && meta.sourceHash === targetHash),
            note: targetHasMarker
                ? '目标文件处于增强态，hash 与 pristine 不一致是正常的。'
                : (meta && meta.sourceHash === targetHash
                    ? '目标文件 = pristine（无注入态）'
                    : '目标文件无标记但 hash 不同，可能 VCP 已更新，下次 apply 时会同步。')
        };
    }
}

module.exports = PristineManager;
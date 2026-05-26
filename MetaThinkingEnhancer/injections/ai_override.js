/**
 * ai_override - AI 自选链路由
 * 允许 AI 在回复中使用 [meta:链名] 指定下一轮思维链。
 */
module.exports = {
    id: 'ai_override',
    name: 'AI 自选链路由',
    description: '允许 AI 使用 [meta:链名] 覆盖 Auto 路由选择。',
    version: '0.1.0',
    details: {
        purpose: '让 AI 自己决定下一轮用哪条思维链，跳过 Auto 模式的语义匹配。',
        usage: '在 AI 的回复中写 [meta:链名]，系统下一轮处理元思考链时会直接使用指定的链，不再做自动路由。',
        mechanism: '注入位置是 if (isAutoMode) 之前。从 aiContent 提取 [meta:xxx] 标记，匹配到 metaThinkingChains.chains 中存在的链名时，覆盖 finalChainName 并把 isAutoMode 置为 false。',
        anchor: 'if (isAutoMode) {',
        position: '锚点行之前',
        examples: [
            { input: '[meta:论文拆解] 来看这篇 paper', effect: '下一轮强制走"论文拆解"链' },
            { input: '[meta:代码调试] 排查一下这个 bug', effect: '下一轮强制走"代码调试"链' },
            { input: '[meta:不存在的链]', effect: '链名找不到 → 自动回退到 Auto 模式' }
        ],
        caveats: [
            '链名必须在 meta_thinking_chains.json 中存在',
            '不存在的链名会被忽略，不会报错，回退到正常 Auto',
            '该标记仅影响下一轮思考链路由，不影响其他逻辑',
            '注入修改后需要重启 VCPToolBox 才生效'
        ]
    },

    getCode() {
        return `
        // --- AI Override: 从 aiContent 提取 [meta:xxx] 标记 ---
        try {
            const _metaMatch = aiContent && aiContent.match(/\\[meta:([^\\]]+)\\]/);
            if (_metaMatch) {
                const _requestedChain = _metaMatch[1].trim();
                const _chainExists = this.metaThinkingChains.chains && this.metaThinkingChains.chains[_requestedChain];
                if (_chainExists) {
                    finalChainName = _requestedChain;
                    isAutoMode = false;
                    console.log('[MetaThinkingEnhancer][ai_override] 命中:', _requestedChain);
                } else {
                    console.log('[MetaThinkingEnhancer][ai_override] 链不存在，忽略:', _requestedChain);
                }
            }
        } catch (_enhErr) {
            console.warn('[MetaThinkingEnhancer][ai_override] 执行异常:', _enhErr.message);
        }
`;
    }
};
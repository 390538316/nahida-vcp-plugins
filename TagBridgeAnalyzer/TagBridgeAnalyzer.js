const fs = require('fs');
const path = require('path');

// 双入口：--input 文件参数 或 stdin
const inputArg = process.argv.find(a => a.startsWith('--input='));
if (inputArg) {
    const inputFile = inputArg.split('=')[1];
    let inputData = fs.readFileSync(inputFile, 'utf8');
    if (inputData.charCodeAt(0) === 0xFEFF) inputData = inputData.slice(1);
    const request = JSON.parse(inputData);
    const result = handleCommand(request);
    process.stdout.write(JSON.stringify(result, null, 2));
} else {
    process.stdin.setEncoding('utf8');
    let inputData = '';
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        try {
            const request = JSON.parse(inputData);
            const result = handleCommand(request);
            process.stdout.write(JSON.stringify(result));
        } catch (err) {
            process.stdout.write(JSON.stringify({ error: err.message }));
        }
    });
}

function handleCommand(request) {
    const { command, ...rest } = request;
    // 兼容两种格式：{ command, parameters: {...} } 或 { command, folder, ... }（VCP Plugin.js 平铺）
    const parameters = request.parameters || rest;
    
    // 参数校验：command 缺失时给出友好提示
    if (!command) {
        return {
            status: 'error',
            error: '缺少 command 字段',
            hint: '请指定 command 字段。可选值: Analyze',
            example: { command: 'Analyze', folder: '日记本名称', similarity_threshold: 0.7 }
        };
    }
    
    if (command === 'Analyze') {
        const data = analyze(parameters);
        return { status: 'success', result: JSON.stringify(data, null, 2) };
    }
    return { status: 'error', error: `Unknown command: ${command}`, hint: '可选值: Analyze' };
}

function analyze(params) {
    const folder = params.folder;
    const simThreshold = params.similarity_threshold || 0.7;
    
    const baseDir = path.resolve(__dirname, '../../dailynote', folder);
    if (!fs.existsSync(baseDir)) {
        return { error: `日记本目录不存在: ${folder}` };
    }
    
    // 读取所有文件的 Tag
    const files = fs.readdirSync(baseDir)
        .filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    
    const fileTagMap = {}; // filename -> [tags]
    const tagFileMap = {}; // tag -> [filenames]
    const cooccurrence = {}; // "tagA|||tagB" -> count
    
    for (const file of files) {
        const content = fs.readFileSync(path.join(baseDir, file), 'utf8');
        const tagMatch = content.match(/^Tag:\s*(.+)$/m);
        if (!tagMatch) continue;
        
        const tags = tagMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
        fileTagMap[file] = tags;
        
        for (const tag of tags) {
            if (!tagFileMap[tag]) tagFileMap[tag] = [];
            tagFileMap[tag].push(file);
        }
        
        // 计算共现（同一篇文件内的 Tag 对）
        for (let i = 0; i < tags.length; i++) {
            for (let j = i + 1; j < tags.length; j++) {
                const pair = [tags[i], tags[j]].sort().join('|||');
                cooccurrence[pair] = (cooccurrence[pair] || 0) + 1;
            }
        }
    }
    
    const allTags = Object.keys(tagFileMap);
    
    // 1. 孤岛 Tag：只出现一次且没有高频共现伙伴
    const islands = allTags.filter(tag => tagFileMap[tag].length === 1);
    
    // 2. 桥梁 Tag：出现在多篇文件中，且共现伙伴多样
    const bridges = [];
    for (const tag of allTags) {
        if (tagFileMap[tag].length < 3) continue;
        // 计算该 Tag 的共现伙伴数
        const partners = new Set();
        for (const file of tagFileMap[tag]) {
            const fileTags = fileTagMap[file] || [];
            for (const t of fileTags) {
                if (t !== tag) partners.add(t);
            }
        }
        if (partners.size >= 5) {
            bridges.push({ tag, fileCount: tagFileMap[tag].length, partnerCount: partners.size });
        }
    }
    bridges.sort((a, b) => b.partnerCount - a.partnerCount);
    
    // 3. 疑似同义词：字面相似度高的 Tag 对
    const synonymCandidates = [];
    for (let i = 0; i < allTags.length; i++) {
        for (let j = i + 1; j < allTags.length; j++) {
            const sim = jaroWinkler(allTags[i], allTags[j]);
            if (sim >= simThreshold && allTags[i] !== allTags[j]) {
                synonymCandidates.push({
                    pair: [allTags[i], allTags[j]],
                    similarity: Math.round(sim * 100) / 100,
                    counts: [tagFileMap[allTags[i]].length, tagFileMap[allTags[j]].length]
                });
            }
        }
    }
    synonymCandidates.sort((a, b) => b.similarity - a.similarity);
    
    // 4. 高频共现对（可能是强关联，也可能是冗余）
    const topCooccurrences = Object.entries(cooccurrence)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([pair, count]) => ({ tags: pair.split('|||'), count }));
    
    // 5. 网络统计
    const stats = {
        totalFiles: files.length,
        filesWithTags: Object.keys(fileTagMap).length,
        uniqueTags: allTags.length,
        totalCooccurrencePairs: Object.keys(cooccurrence).length,
        islandCount: islands.length,
        bridgeCount: bridges.length,
        avgTagsPerFile: Math.round(Object.values(fileTagMap).reduce((s, t) => s + t.length, 0) / Object.keys(fileTagMap).length * 10) / 10
    };
    
    return {
        folder,
        stats,
        islands: islands.slice(0, 15),
        bridges: bridges.slice(0, 8),
        synonymCandidates: synonymCandidates.slice(0, 8),
        topCooccurrences: topCooccurrences.slice(0, 10),
        diagnosis: generateDiagnosis(stats, islands, bridges, synonymCandidates)
    };
}

// Jaro-Winkler 字符串相似度
function jaroWinkler(s1, s2) {
    if (s1 === s2) return 1;
    const len1 = s1.length, len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0;
    
    const matchWindow = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    
    let matches = 0, transpositions = 0;
    
    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, len2);
        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }
    
    if (matches === 0) return 0;
    
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }
    
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    
    // Winkler 前缀加成
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }
    
    return jaro + prefix * 0.1 * (1 - jaro);
}

function generateDiagnosis(stats, islands, bridges, synonyms) {
    const lines = [];
    
    lines.push(`知识网络概况：${stats.uniqueTags} 个独立 Tag，${stats.totalCooccurrencePairs} 对共现关系，平均每篇 ${stats.avgTagsPerFile} 个 Tag。`);
    
    const islandRatio = Math.round(stats.islandCount / stats.uniqueTags * 100);
    if (islandRatio > 30) {
        lines.push(`⚠️ 孤岛率 ${islandRatio}%（${stats.islandCount}/${stats.uniqueTags}）偏高。大量 Tag 只出现一次，无法形成共现网络。建议在新日记中复用这些 Tag 或将其合并到更通用的概念。`);
    } else {
        lines.push(`✓ 孤岛率 ${islandRatio}%（${stats.islandCount}/${stats.uniqueTags}），网络连通性良好。`);
    }
    
    if (bridges.length === 0) {
        lines.push(`⚠️ 未发现桥梁 Tag（出现≥3次且连接≥5个伙伴）。知识网络可能是碎片化的簇状结构。`);
    } else {
        lines.push(`✓ 发现 ${bridges.length} 个桥梁 Tag，最强桥梁：「${bridges[0].tag}」（${bridges[0].fileCount}篇，${bridges[0].partnerCount}个伙伴）。`);
    }
    
    if (synonyms.length > 0) {
        lines.push(`⚠️ 发现 ${synonyms.length} 对疑似同义 Tag，最相似：「${synonyms[0].pair[0]}」≈「${synonyms[0].pair[1]}」(${synonyms[0].similarity})。考虑合并以减少稀释。`);
    }
    
    return lines.join('\n');
}
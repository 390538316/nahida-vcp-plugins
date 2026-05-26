const fs = require('fs');
const path = require('path');

// VCP synchronous plugin: stdin JSON → process → stdout JSON
// 支持两种输入：stdin 管道 或 --input 命令行参数（解决 Windows 管道中文编码问题）

const inputArg = process.argv.find(a => a.startsWith('--input='));
if (inputArg) {
    // 从命令行参数读取 JSON 文件路径
    const inputFile = inputArg.split('=')[1];
    const fs2 = require('fs');
    let inputData = fs2.readFileSync(inputFile, 'utf8');
    // 跳过 UTF-8 BOM
    if (inputData.charCodeAt(0) === 0xFEFF) inputData = inputData.slice(1);
    const request = JSON.parse(inputData);
    const result = handleCommand(request);
    process.stdout.write(JSON.stringify(result, null, 2));
} else {
    // 标准 stdin 模式（VCP Plugin.js 使用此模式）
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
            hint: '请指定 command 字段。可选值: CheckHealth',
            example: { command: 'CheckHealth', folder: '日记本名称', fix_suggestions: true }
        };
    }
    
    if (command === 'CheckHealth') {
        const data = checkHealth(parameters);
        // 控制输出大小：只返回摘要 + 前5个问题，避免数据过大
        const summary = {
            folder: data.folder || parameters.folder,
            totalFiles: data.totalFiles,
            healthyFiles: data.healthyFiles,
            issueFiles: data.issueFiles,
            issuesSample: (data.issues || []).slice(0, 5)
        };
        return { status: 'success', result: JSON.stringify(summary) };
    }
    return { status: 'error', error: `Unknown command: ${command}`, hint: '可选值: CheckHealth' };
}

function checkHealth(params) {
    const folder = params.folder;
    const fixSuggestions = params.fix_suggestions !== false;
    
    // 定位日记本目录
    const baseDir = path.resolve(__dirname, '../../dailynote', folder);
    
    if (!fs.existsSync(baseDir)) {
        return { error: `日记本目录不存在: ${folder}` };
    }
    
    // 读取所有文件
    const files = fs.readdirSync(baseDir)
        .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
        .map(f => ({
            name: f,
            fullPath: path.join(baseDir, f),
            content: fs.readFileSync(path.join(baseDir, f), 'utf8'),
            size: fs.statSync(path.join(baseDir, f)).size
        }));
    
    const issues = [];
    const stats = {
        totalFiles: files.length,
        healthyFiles: 0,
        issueFiles: 0
    };
    
    for (const file of files) {
        const fileIssues = analyzeFile(file);
        if (fileIssues.length > 0) {
            issues.push({
                file: file.name,
                size: file.size,
                problems: fileIssues,
                suggestions: fixSuggestions ? generateSuggestions(fileIssues) : undefined
            });
            stats.issueFiles++;
        } else {
            stats.healthyFiles++;
        }
    }
    
    // 限流：issues 最多输出前 20 条，防止大日记本 stdout 截断
    const truncated = issues.length > 20;
    const limitedIssues = issues.slice(0, 20);
    
    return {
        folder,
        stats,
        issues: limitedIssues,
        truncated: truncated ? { total: issues.length, shown: 20 } : undefined,
        summary: generateSummary(stats, issues)
    };
}

function analyzeFile(file) {
    const problems = [];
    const { content, size, name } = file;
    
    // 1. 体积异常检测
    if (size < 500) {
        problems.push({ type: 'SIZE_TOO_SMALL', detail: `${size} bytes，可能是残篇或截断` });
    }
    
    // 2. 时间戳检测：首行应以 [HH:MM] 或 [YYYY-MM-DD] 开头
    const firstLine = content.split('\n')[0].trim();
    const hasTimestamp = /^\[(\d{2}:\d{2}|\d{4}-\d{2}-\d{2})/.test(firstLine);
    const hasDateHeader = /^\[\d{4}-\d{2}-\d{2}\]/.test(firstLine);
    if (!hasTimestamp && !hasDateHeader && !firstLine.startsWith('#')) {
        problems.push({ type: 'NO_TIMESTAMP', detail: `首行: "${firstLine.substring(0, 50)}..."` });
    }
    
    // 3. Tag 检测
    const tagMatch = content.match(/^Tag:\s*(.+)$/m);
    if (!tagMatch) {
        problems.push({ type: 'NO_TAG', detail: '未找到 Tag 行' });
    } else {
        const tags = tagMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (tags.length < 5) {
            problems.push({ type: 'TAG_TOO_FEW', detail: `${tags.length} 个 Tag（建议 5-8）` });
        }
        if (tags.length > 8) {
            problems.push({ type: 'TAG_TOO_MANY', detail: `${tags.length} 个 Tag（建议 5-8）` });
        }
        
        // 4. 模糊 Tag 检测
        const vagueWords = ['重要', '讨论', '今天', '记录', '笔记', '内容', '相关'];
        const vagueTags = tags.filter(t => vagueWords.some(w => t === w));
        if (vagueTags.length > 0) {
            problems.push({ type: 'VAGUE_TAGS', detail: `模糊 Tag: ${vagueTags.join(', ')}` });
        }
        
        // 5. 重复 Tag 检测（完全相同）
        const seen = new Set();
        const duplicates = [];
        for (const tag of tags) {
            if (seen.has(tag)) duplicates.push(tag);
            seen.add(tag);
        }
        if (duplicates.length > 0) {
            problems.push({ type: 'DUPLICATE_TAGS', detail: `重复: ${duplicates.join(', ')}` });
        }
    }
    
    // 6. 双重 Tag 行检测（文件内有两个 Tag: 行）
    const tagLines = content.match(/^Tag:\s*.+$/gm);
    if (tagLines && tagLines.length > 1) {
        problems.push({ type: 'MULTIPLE_TAG_LINES', detail: `发现 ${tagLines.length} 个 Tag 行` });
    }
    
    return problems;
}

function generateSuggestions(problems) {
    return problems.map(p => {
        switch (p.type) {
            case 'SIZE_TOO_SMALL': return '检查是否为截断文件，考虑删除或补全';
            case 'NO_TIMESTAMP': return '在首行添加 [HH:MM] 时间戳';
            case 'NO_TAG': return '在文件末尾添加 Tag 行';
            case 'TAG_TOO_FEW': return '补充 Tag 至 5-8 个，优先添加跨域桥梁概念';
            case 'TAG_TOO_MANY': return '精简 Tag 至 5-8 个，删除同义或模糊词';
            case 'VAGUE_TAGS': return '将模糊 Tag 替换为具体概念实体';
            case 'DUPLICATE_TAGS': return '删除重复的 Tag';
            case 'MULTIPLE_TAG_LINES': return '合并为一个 Tag 行，保留最完整的那个';
            default: return '手动检查';
        }
    });
}

function generateSummary(stats, issues) {
    const typeCount = {};
    for (const issue of issues) {
        for (const p of issue.problems) {
            typeCount[p.type] = (typeCount[p.type] || 0) + 1;
        }
    }
    
    const lines = [`共 ${stats.totalFiles} 篇，${stats.healthyFiles} 篇健康，${stats.issueFiles} 篇有问题。`];
    
    if (Object.keys(typeCount).length > 0) {
        lines.push('问题分布:');
        const labels = {
            SIZE_TOO_SMALL: '体积过小',
            NO_TIMESTAMP: '缺时间戳',
            NO_TAG: '缺 Tag',
            TAG_TOO_FEW: 'Tag 过少',
            TAG_TOO_MANY: 'Tag 过多',
            VAGUE_TAGS: '模糊 Tag',
            DUPLICATE_TAGS: '重复 Tag',
            MULTIPLE_TAG_LINES: '多 Tag 行'
        };
        for (const [type, count] of Object.entries(typeCount)) {
            lines.push(`  - ${labels[type] || type}: ${count} 篇`);
        }
    }
    
    return lines.join('\n');
}
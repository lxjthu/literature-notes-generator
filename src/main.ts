// 在文件顶部的 import 语句中添加 Notice
import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, Modal, Notice } from 'obsidian';

interface LiteratureNote {
    title: string;
    authors: string;
    journal: string;
    publicationDate: string;
    type: string;  // 添加文献类型
}

interface PluginSettings {
    readingCards: string[];
}

const DEFAULT_SETTINGS: PluginSettings = {
    readingCards: [
        "政策背景",
        "理论背景",
        "理论意义",
        "现实意义",
        "填补空白",
        "理论基础",
        "理论框架",
        "关键自变量",
        "关键因变量",
        "机制变量",
        "工具变量",
        "调节变量",
        "控制变量",
        "数据来源",
        "分析方法",
        "影响机制",
        "机制分析",
        "稳健性检验"
    ]
};

// 添加一个新的对话框类
class FolderNameModal extends Modal {
    result: string;
    defaultName: string;
    onSubmit: (result: string) => void;

    constructor(app: App, defaultName: string, onSubmit: (result: string) => void) {
        super(app);
        this.defaultName = defaultName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.createEl("h2", { text: "设置文献笔记文件夹名称" });

        const inputEl = contentEl.createEl("input", {
            type: "text",
            value: this.defaultName
        });
        inputEl.style.width = "100%";
        inputEl.style.marginBottom = "1em";

        const buttonEl = contentEl.createEl("button", { text: "确认" });
        buttonEl.addEventListener("click", () => {
            this.onSubmit(inputEl.value);
            this.close();
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

export default class LiteratureNotesGenerator extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        // 添加生成笔记按钮
        this.addRibbonIcon('documents', '生成文献笔记结构', () => {
            this.generateNotes();
        });

        // 添加设置选项
        this.addSettingTab(new LiteratureNotesSettingTab(this.app, this));

        // 添加命令
        this.addCommand({
            id: 'generate-literature-notes',
            name: '生成文献笔记结构',
            callback: () => this.generateNotes()
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateNotes() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            return;
        }
    
        const defaultFolderName = activeFile.basename;
    
        new FolderNameModal(this.app, defaultFolderName, async (folderName) => {
            const content = await this.app.vault.read(activeFile);
            const literatures = this.parseLiteratures(content);
            const mainFolder = await this.createFolderIfNotExists(folderName);
            
            // 添加：创建卡片汇总文件夹
            const summaryFolder = await this.createFolderIfNotExists(`${mainFolder.path}/卡片汇总`);
            
            // 创建笔记结构
            for (const lit of literatures) {
                await this.createLiteratureStructure(mainFolder, lit);
            }
    
            // 添加：生成汇总笔记
            await this.generateSummaryNotes(summaryFolder, folderName);
    
            // 创建原始文档的副本并添加双向链接
            let newContent = content;
            for (const lit of literatures) {
                const overviewPath = `${folderName}/${lit.title}/Overview`;
                const linkText = `[[${overviewPath}|${lit.title}]]`;
                // 根据文献类型替换原文中的引用
                newContent = newContent.replace(
                    new RegExp(`${lit.title}\\s*\\[${lit.type}\\]`),
                    `${linkText} [${lit.type}]`
                );
            }
            
            // 在主文件夹中创建原始文档的副本
            const originalFileName = activeFile.basename;
            await this.app.vault.create(
                `${mainFolder.path}/${originalFileName}.md`,
                newContent
            );
        }).open();
    }

    // 添加：生成汇总笔记的方法
    private async generateSummaryNotes(summaryFolder: TFolder, mainFolderName: string) {
        for (const cardType of this.settings.readingCards) {
            const content = await this.generateSummaryContent(cardType, mainFolderName);
            await this.app.vault.create(`${summaryFolder.path}/${cardType}汇总.md`, content);
        }
    }

// 添加：生成汇总笔记内容的方法
private async generateSummaryContent(cardType: string, mainFolderName: string): Promise<string> {
    return `---
type: summary
card-type: ${cardType}
---

# ${cardType}汇总

\`\`\`dataview
TABLE 
    authors as "作者",
    date as "发表年份",
    regexreplace(text, ".*#摘要\\s*([^#]*?)(?=#|$)", "\$1") as "笔记内容"
FROM "${mainFolderName}"
WHERE type = "reading-card" 
    AND card-type = "${cardType}"    
SORT date DESC
\`\`\``;
}

    private async createLiteratureStructure(mainFolder: TFolder, literature: LiteratureNote) {
        const litFolder = await this.createFolderIfNotExists(`${mainFolder.path}/${literature.title}`);
        await this.createOverviewNote(litFolder, literature);
        const cardsFolder = await this.createFolderIfNotExists(`${litFolder.path}/Reading Cards`);
        
        // 使用设置中的阅读卡片列表
        for (const cardName of this.settings.readingCards) {
            await this.createCard(cardsFolder, cardName, literature);
        }
    }

    private async createOverviewNote(folder: TFolder, literature: LiteratureNote) {
        const content = this.generateOverviewContent(literature);
        await this.app.vault.create(`${folder.path}/Overview.md`, content);
    }

    private async createCard(folder: TFolder, cardName: string, literature: LiteratureNote) {
        const content = this.generateCardContent(cardName, literature);
        await this.app.vault.create(`${folder.path}/${cardName}.md`, content);
    }

    private generateOverviewContent(literature: LiteratureNote): string {
        return `---
title: ${literature.title}
authors: ${literature.authors}
journal: ${literature.journal}
date: ${literature.publicationDate}
type: overview
---
      
# ${literature.title}
       
## 基本信息
    - 作者：${literature.authors}
    - 期刊：${literature.journal}
    - 发表时间：${literature.publicationDate}
        
## 笔记导航
${this.settings.readingCards.map(card => `- [[${card}]]`).join('\n')}`;
    }

    private generateCardContent(cardName: string, literature: LiteratureNote): string {
        return `---
title: ${literature.title}
authors: ${literature.authors}
journal: ${literature.journal}
date: ${literature.publicationDate}
type: reading-card
card-type: ${cardName}
---
    
# ${cardName}
    
## 笔记内容
    
#摘要 

#正文

`;
}

    private async createFolderIfNotExists(path: string): Promise<TFolder> {
        if (!(await this.app.vault.adapter.exists(path))) {
            await this.app.vault.createFolder(path);
        }
        return this.app.vault.getAbstractFileByPath(path) as TFolder;
    }

    private parseLiteratures(content: string): LiteratureNote[] {
        const lines = content.split('\n');
        const literatures: LiteratureNote[] = [];
        
        for (const line of lines) {
            // 修改期刊论文[J]的匹配模式
            const patterns = {
                J: /\[\d+\](.*?)\.(.*?)\[J\]\.(.*?),(\d{4}),.*?(?:\.DOI:|$)/,
                C: /\[\d+\](.*?)\. (.*?) \[C\]\/\/.*?\. (.*?), (\d{4})/,
                M: /\[\d+\](.*?)\. (.*?) \[M\]\. (.*?): .*?, (\d{4})/,
                D: /\[\d+\](.*?)\. (.*?) \[D\]\. (.*?), (\d{4})/
            };
        
            for (const [type, pattern] of Object.entries(patterns)) {
                const match = line.match(pattern);
                if (match) {
                    const [, authors, title, journal, publicationDate] = match;
                    literatures.push({
                        title: title.trim(),
                        authors: authors.trim(),
                        journal: journal.trim(),
                        publicationDate: publicationDate.trim(),
                        type: type
                    });
                    break;
                }
            }
        }
        
        if (literatures.length === 0) {
            new Notice('未识别到任何文献引用，请检查格式是否正确');
        }
        
        return literatures;
    }
}

class LiteratureNotesSettingTab extends PluginSettingTab {
    plugin: LiteratureNotesGenerator;

    constructor(app: App, plugin: LiteratureNotesGenerator) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: '文献笔记设置'});

        new Setting(containerEl)
            .setName('阅读卡片类型')
            .setDesc('每行一个卡片类型，可以添加、删除或修改')
            .addTextArea(text => text
                .setPlaceholder('每行输入一个卡片类型')
                .setValue(this.plugin.settings.readingCards.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.readingCards = value.split('\n').filter(line => line.trim());
                    await this.plugin.saveSettings();
                }));
    }
}
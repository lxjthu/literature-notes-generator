import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, Modal } from 'obsidian';

interface LiteratureNote {
    title: string;
    authors: string;
    journal: string;
    publicationDate: string;
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

        // 获取当前文件名（不含扩展名）作为默认文件夹名
        const defaultFolderName = activeFile.basename;

        // 显示对话框
        new FolderNameModal(this.app, defaultFolderName, async (folderName) => {
            const content = await this.app.vault.read(activeFile);
            const literatures = this.parseLiteratures(content);
            const mainFolder = await this.createFolderIfNotExists(folderName);

            // 创建笔记结构
            for (const lit of literatures) {
                await this.createLiteratureStructure(mainFolder, lit);
            }

            // 更新原始笔记，添加双向链接
            let newContent = content;
            for (const lit of literatures) {
                const overviewPath = `${folderName}/${lit.title}/Overview`;
                const linkText = `[[${overviewPath}|${lit.title}]]`;
                newContent = newContent.replace(
                    new RegExp(`${lit.title} \\[J\\]`),
                    `${linkText} [J]`
                );
            }
            await this.app.vault.modify(activeFile, newContent);
        }).open();
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
${this.settings.readingCards.map(card => `- [[${card}]]`).join('\n')}
`;
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
            const match = line.match(/\[\d+\](.*?)\. (.*?) \[J\]\. (.*?), (\d{4})/);
            
            if (match) {
                const [, authors, title, journal, publicationDate] = match;
                literatures.push({
                    title: title.trim(),
                    authors: authors.trim(),
                    journal: journal.trim(),
                    publicationDate: publicationDate.trim()
                });
            }
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
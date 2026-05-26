import * as vscode from 'vscode';
import { detectArbFiles, type DetectedArbFile } from '../arb/detector';
import { writeArbFile, createArbFile, initializeArbFile } from '../arb/writer';
import { loadCatalog, type LocaleFile } from '../arb/loader';
import { type Catalog } from '../model/catalog';
import { getStringboardHtml } from './html';
import { getSidebarInstance } from '../view/sidebarViewProvider';


type CellChangedPayload = {
	key: string;
	locale: string;
	value: string;
};

const SAVE_DEBOUNCE_MS = 300;

export default class StringboardPanel {
	public static currentPanel: StringboardPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];
	private readonly localeFiles: Map<string, LocaleFile>;
	private readonly pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
	private detectedFiles: DetectedArbFile[];
	private catalog: Catalog | undefined;

	public static refreshIfOpen(): void {
		if (StringboardPanel.currentPanel) {
			void StringboardPanel.currentPanel.refreshCatalog();
		}
	}

	public static async createOrShow(_extensionUri: vscode.Uri): Promise<void> {
		const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

		if (StringboardPanel.currentPanel) {
			StringboardPanel.currentPanel.panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'stringboard',
			'Stringboard',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		const detectedFiles = await detectArbFiles();
		const { catalog, localeFiles } = await loadCatalog(detectedFiles);

		StringboardPanel.currentPanel = new StringboardPanel(panel, detectedFiles, catalog, localeFiles);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		detectedFiles: DetectedArbFile[],
		catalog: Catalog | undefined,
		localeFiles: Map<string, LocaleFile>,
	) {
		this.panel = panel;
		this.localeFiles = localeFiles;
		this.detectedFiles = detectedFiles;
		this.catalog = catalog;
		this.panel.webview.html = getStringboardHtml(detectedFiles, catalog);

		this.panel.webview.onDidReceiveMessage(
			async (message: { type: string; payload?: unknown }) => {
				if (message.type === 'cell-changed') {
					this.handleCellChanged(message.payload as CellChangedPayload);
				} else if (message.type === 'add-key') {
					await this.handleAddKey();
				} else if (message.type === 'add-locale') {
					await this.handleAddLocale();
				} else if (message.type === 'create-template') {
					await this.handleCreateTemplate();
				} else if (message.type === 'initialize-template') {
					await this.handleInitializeTemplate();
				}
			},
			null,
			this.disposables,
		);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	private handleCellChanged(payload: CellChangedPayload): void {
		const file = this.localeFiles.get(payload.locale);
		if (!file) {
			return;
		}
		file.arbFile.entries.set(payload.key, payload.value);
		this.scheduleSave(payload.locale);
	}

	private async handleAddKey(): Promise<void> {
		const templateLocale = this.catalog?.templateLocale;
		const templateFile = templateLocale ? this.localeFiles.get(templateLocale) : undefined;
		if (!templateFile) {
			void vscode.window.showErrorMessage('Stringboard: no template ARB file found.');
			return;
		}

		const keyName = await vscode.window.showInputBox({
			title: 'Add Translation Key',
			prompt: 'Enter a new translation key (e.g., settings.title)',
			placeHolder: 'settings.title',
			validateInput: (value: string) => {
				if (!value) {return 'Key name is required.';}
				if (!/^[a-zA-Z_][\w.]*$/.test(value)) {return 'Invalid key. Use letters, numbers, dots, and underscores.';}
				if (this.catalog?.rows.some(r => r.key === value)) {return `Key '${value}' already exists.`;}
				return null;
			},
			ignoreFocusOut: true,
		});

		if (!keyName) {return;}

		const description = await vscode.window.showInputBox({
			title: 'Add Translation Key',
			prompt: 'Optional description for this key',
			placeHolder: 'Description of what this key is used for',
			ignoreFocusOut: true,
		});

		templateFile.arbFile.entries.set(keyName, keyName);
		if (description) {
			const meta = templateFile.arbFile.metadata.get(keyName) ?? {};
			meta.description = description;
			templateFile.arbFile.metadata.set(keyName, meta);
		}

		try {
			await writeArbFile(templateFile.uri, templateFile.arbFile.entries, templateFile.arbFile.metadata, templateFile.arbFile.locale);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to save: ${message}`);
			return;
		}

		await this.refreshCatalog();
	}

	private async handleAddLocale(): Promise<void> {
		const templateLocale = this.catalog?.templateLocale;
		const templateFile = templateLocale ? this.localeFiles.get(templateLocale) : undefined;
		if (!templateFile) {
			void vscode.window.showErrorMessage('Stringboard: no template ARB file found. Add an English ARB file first.');
			return;
		}

		const locale = await vscode.window.showInputBox({
			title: 'Add Locale',
			prompt: 'Enter a locale code (e.g., fr, es, de, ja, pt-BR)',
			placeHolder: 'fr',
			validateInput: (value: string) => {
				if (!value) {
					return 'Locale code is required.';
				}
				if (!/^[a-zA-Z]+(?:[_-][a-zA-Z]+)?$/.test(value)) {
					return 'Invalid locale code. Use only letters, hyphens, and underscores (e.g., en, pt-BR, zh_CN).';
				}
				if (this.localeFiles.has(value)) {
					return `Locale '${value}' already exists.`;
				}
				return null;
			},
			ignoreFocusOut: true,
		});

		if (!locale) {
			return;
		}

		const templateUri = templateFile.uri;
		const templateDir = templateUri.path.substring(0, templateUri.path.lastIndexOf('/'));
		const templateBasename = templateUri.path.split('/').pop() ?? 'app_en.arb';
		const newBasename = templateBasename.replace(/_([a-zA-Z]+(?:[_-][a-zA-Z]+)?)\.arb$/, `_${locale}.arb`);
		const newUri = templateUri.with({ path: `${templateDir}/${newBasename}` });

		try {
			await createArbFile(newUri, locale, templateFile.arbFile.entries, templateFile.arbFile.metadata);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to create locale file: ${message}`);
			return;
		}

		await this.refreshCatalog();
	}

	private async handleCreateTemplate(): Promise<void> {
		const locale = await vscode.window.showInputBox({
			title: 'Initialize ARB File',
			prompt: 'Enter the locale code (e.g., en, fr, es)',
			placeHolder: 'en',
			validateInput: (value: string) => {
				if (!value) {return 'Locale code is required.';}
				if (!/^[a-zA-Z]+(?:[_-][a-zA-Z]+)?$/.test(value)) {return 'Invalid locale code.';}
				return null;
			},
			ignoreFocusOut: true,
		});
		if (!locale) {return;}

		const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
		const l10nDir = workspaceUri ? vscode.Uri.joinPath(workspaceUri, 'lib', 'l10n') : undefined;
		if (!l10nDir) {
			void vscode.window.showErrorMessage('Stringboard: no workspace folder open.');
			return;
		}

		try {
			await vscode.workspace.fs.createDirectory(l10nDir);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to create lib/l10n/: ${message}`);
			return;
		}

		const uri = vscode.Uri.joinPath(l10nDir, `app_${locale}.arb`);
		try {
			await initializeArbFile(uri, locale, true);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to create file: ${message}`);
			return;
		}

		await this.refreshCatalog();
	}

	private async handleInitializeTemplate(): Promise<void> {
		const templateDetected = this.detectedFiles.find(f => f.isTemplate);
		if (!templateDetected) {
			if (this.detectedFiles.length === 0) {
				void vscode.window.showErrorMessage('Stringboard: no ARB files found to initialize.');
				return;
			}
			const file = this.detectedFiles[0];
			try {
				await initializeArbFile(file.uri, file.locale, true);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				void vscode.window.showErrorMessage(`Stringboard: failed to initialize: ${message}`);
				return;
			}
			await this.refreshCatalog();
			return;
		}

		const locale = templateDetected.locale;
		try {
			await initializeArbFile(templateDetected.uri, locale, true);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to initialize: ${message}`);
			return;
		}

		await this.refreshCatalog();
	}

	public async refreshCatalog(): Promise<void> {
		const detectedFiles = await detectArbFiles();
		const result = await loadCatalog(detectedFiles);
		this.detectedFiles = detectedFiles;
		this.catalog = result.catalog;
		this.localeFiles.clear();
		for (const [key, value] of result.localeFiles) {
			this.localeFiles.set(key, value);
		}
		this.panel.webview.html = getStringboardHtml(this.detectedFiles, this.catalog);
		getSidebarInstance()?.refresh();
	}

	private scheduleSave(locale: string): void {
		const existing = this.pendingSaves.get(locale);
		if (existing) {
			clearTimeout(existing);
		}
		const timeout = setTimeout(() => {
			this.pendingSaves.delete(locale);
			void this.flushSave(locale);
		}, SAVE_DEBOUNCE_MS);
		this.pendingSaves.set(locale, timeout);
	}

	private async flushSave(locale: string): Promise<void> {
		const file = this.localeFiles.get(locale);
		if (!file) {
			return;
		}
		try {
			await writeArbFile(file.uri, file.arbFile.entries, file.arbFile.metadata, file.arbFile.locale);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to save ${file.uri.fsPath}: ${message}`);
		}
	}

	private dispose(): void {
		for (const timeout of this.pendingSaves.values()) {
			clearTimeout(timeout);
		}
		this.pendingSaves.clear();
		StringboardPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}
}

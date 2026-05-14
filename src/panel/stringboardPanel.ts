import * as vscode from 'vscode';
import { detectArbFiles, type DetectedArbFile } from '../arb/detector';
import { parseArb, type ArbFile } from '../arb/parser';
import { writeArbFile } from '../arb/writer';
import { buildCatalog, type Catalog } from '../model/catalog';
import { getStringboardHtml } from './html';

type LocaleFile = { uri: vscode.Uri; arbFile: ArbFile };

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
		this.panel.webview.html = getStringboardHtml(detectedFiles, catalog);

		this.panel.webview.onDidReceiveMessage(
			(message: { type: string; payload?: unknown }) => {
				if (message.type === 'cell-changed') {
					this.handleCellChanged(message.payload as CellChangedPayload);
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

async function loadCatalog(detectedFiles: DetectedArbFile[]): Promise<{
	catalog: Catalog | undefined;
	localeFiles: Map<string, LocaleFile>;
}> {
	const localeFiles = new Map<string, LocaleFile>();
	if (detectedFiles.length === 0) {
		return { catalog: undefined, localeFiles };
	}

	const arbFiles: ArbFile[] = [];
	for (const detected of detectedFiles) {
		try {
			const arbFile = await parseArb(detected.uri);
			arbFiles.push(arbFile);
			localeFiles.set(arbFile.locale, { uri: detected.uri, arbFile });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`Stringboard: failed to parse ${detected.uri.fsPath}: ${message}`);
		}
	}

	if (arbFiles.length === 0) {
		return { catalog: undefined, localeFiles };
	}

	const templateDetected = detectedFiles.find(f => f.isTemplate);
	const templateLocale = templateDetected?.locale ?? arbFiles[0].locale;

	return { catalog: buildCatalog(arbFiles, templateLocale), localeFiles };
}

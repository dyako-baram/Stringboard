import * as vscode from 'vscode';
import { detectArbFiles } from '../arb/detector';
import { getStringboardHtml } from './html';

export default class StringboardPanel {
	public static currentPanel: StringboardPanel | undefined;

	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

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
		StringboardPanel.currentPanel = new StringboardPanel(panel, detectedFiles);
	}

	private constructor(panel: vscode.WebviewPanel, detectedFiles: Awaited<ReturnType<typeof detectArbFiles>>) {
		this.panel = panel;
		this.panel.webview.html = getStringboardHtml(detectedFiles);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	private dispose(): void {
		StringboardPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			this.disposables.pop()?.dispose();
		}
	}
}

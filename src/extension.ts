import * as vscode from 'vscode';
import StringboardPanel from './panel/stringboardPanel';
import { SidebarViewProvider, getSidebarInstance } from './view/sidebarViewProvider';

export function activate(context: vscode.ExtensionContext) {

	const openCommand = vscode.commands.registerCommand('stringboard.open', async () => {
		await StringboardPanel.createOrShow(context.extensionUri);
	});

	const arbWatcher = vscode.workspace.createFileSystemWatcher('**/*.arb');
	arbWatcher.onDidCreate(() => { StringboardPanel.refreshIfOpen(); getSidebarInstance()?.refresh(); });
	arbWatcher.onDidDelete(() => { StringboardPanel.refreshIfOpen(); getSidebarInstance()?.refresh(); });

	context.subscriptions.push(
		openCommand,
		arbWatcher,
		vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, new SidebarViewProvider()),
	);
}

export function deactivate() { }

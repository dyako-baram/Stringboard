import * as vscode from 'vscode';
import StringboardPanel from './panel/stringboardPanel';

export function activate(context: vscode.ExtensionContext) {
	console.log('Stringboard extension activated.');

	const openCommand = vscode.commands.registerCommand('stringboard.open', async () => {
		await StringboardPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(openCommand);
}

export function deactivate() { }

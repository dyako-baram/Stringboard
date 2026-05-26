import * as vscode from 'vscode';
import type { ArbMetadata } from './parser';

export async function writeArbFile(
	uri: vscode.Uri,
	entries: Map<string, string>,
	metadata: Map<string, ArbMetadata>,
	_locale: string,
): Promise<void> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const originalText = new TextDecoder().decode(bytes);
	const parsed = JSON.parse(originalText) as Record<string, unknown>;

	for (const key of Object.keys(parsed)) {
		if (key.startsWith('@')) {
			continue;
		}
		if (entries.has(key)) {
			parsed[key] = entries.get(key);
		}
	}

	for (const [key, value] of entries) {
		if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
			parsed[key] = value;
			const meta = metadata.get(key);
			if (meta) {
				parsed[`@${key}`] = meta;
			}
		}
	}

	const indent = detectIndent(originalText);
	const serialized = JSON.stringify(parsed, null, indent);
	const finalText = originalText.endsWith('\n') ? serialized + '\n' : serialized;

	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(finalText));
}

const STARTER_KEYS: { key: string; description: string }[] = [
	{ key: 'app_title', description: 'The title of the application' },
	{ key: 'welcome_message', description: 'Welcome message shown on the home screen' },
	{ key: 'settings_title', description: 'Title for the settings screen' },
];

export async function initializeArbFile(
	uri: vscode.Uri,
	locale: string,
	isTemplate: boolean,
): Promise<void> {
	const content: Record<string, unknown> = {
		'@@locale': locale,
	};

	const meta: Record<string, { description: string }> = {};

	for (const { key, description } of STARTER_KEYS) {
		content[key] = isTemplate ? key : '';
		meta[`@${key}`] = { description };
	}

	Object.assign(content, meta);

	const serialized = JSON.stringify(content, null, 2) + '\n';
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(serialized));
}

export async function createArbFile(
	uri: vscode.Uri,
	locale: string,
	templateEntries: Iterable<[string, string]>,
	templateMetadata: Map<string, ArbMetadata>,
): Promise<void> {
	const content: Record<string, unknown> = {
		'@@locale': locale,
	};

	for (const [key] of templateEntries) {
		content[key] = '';
		const meta = templateMetadata.get(key);
		if (meta) {
			content[`@${key}`] = meta;
		}
	}

	const serialized = JSON.stringify(content, null, 2) + '\n';
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(serialized));
}

function detectIndent(text: string): number | string {
	const match = text.match(/\n([ \t]+)"/);
	if (!match) {
		return 2;
	}
	const indent = match[1];
	if (indent.includes('\t')) {
		return '\t';
	}
	return indent.length;
}

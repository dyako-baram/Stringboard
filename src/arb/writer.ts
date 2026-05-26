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

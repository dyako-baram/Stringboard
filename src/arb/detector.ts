import * as vscode from 'vscode';

export type DetectedArbFile = {
	uri: vscode.Uri;
	locale: string;
	isTemplate: boolean;
};

const SEARCH_PATTERNS = [
	'**/l10n/**/*.arb',
	'**/lib/i18n/**/*.arb',
	'**/assets/i18n/**/*.arb',
	'**/translations/**/*.arb',
];

export async function detectArbFiles(): Promise<DetectedArbFile[]> {
	let uris: vscode.Uri[] = [];
	for (const pattern of SEARCH_PATTERNS) {
		uris = await vscode.workspace.findFiles(pattern);
		if (uris.length > 0) {
			break;
		}
	}

	const detected: DetectedArbFile[] = [];
	for (const uri of uris) {
		const locale = await readLocale(uri);
		detected.push({ uri, locale, isTemplate: false });
	}

	const template = detected.find(f => f.locale === 'en') ?? detected[0];
	if (template) {
		template.isTemplate = true;
	}

	return detected;
}

async function readLocale(uri: vscode.Uri): Promise<string> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder().decode(bytes);
		const parsed = JSON.parse(text) as Record<string, unknown>;
		const declared = parsed['@@locale'];
		if (typeof declared === 'string' && declared.length > 0) {
			return declared;
		}
	} catch {
		// Fall through to filename-based detection.
	}
	return localeFromFilename(uri) ?? 'unknown';
}

function localeFromFilename(uri: vscode.Uri): string | undefined {
	const basename = uri.path.split('/').pop() ?? '';
	const match = basename.match(/^.+?_([a-zA-Z]+(?:[_-][a-zA-Z]+)?)\.arb$/);
	return match?.[1];
}

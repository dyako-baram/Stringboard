import * as vscode from 'vscode';
import { parseArb, type ArbFile } from './parser';
import { buildCatalog, type Catalog } from '../model/catalog';
import type { DetectedArbFile } from './detector';

export type LocaleFile = { uri: vscode.Uri; arbFile: ArbFile };

export async function loadCatalog(detectedFiles: DetectedArbFile[]): Promise<{
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

import * as vscode from 'vscode';
import { detectArbFiles, type DetectedArbFile } from '../arb/detector';
import { writeArbFile, createArbFile, initializeArbFile } from '../arb/writer';
import { loadCatalog, type LocaleFile } from '../arb/loader';
import type { Catalog } from '../model/catalog';


let _instance: SidebarViewProvider | undefined;

export function getSidebarInstance(): SidebarViewProvider | undefined {
	return _instance;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'stringboard.sidebar';

	private _view?: vscode.WebviewView;

	private catalog: Catalog | undefined;
	private localeFiles = new Map<string, LocaleFile>();
	private detectedFiles: DetectedArbFile[] = [];

	async resolveWebviewView(webviewView: vscode.WebviewView) {
		_instance = this;
		this._view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.getHtml();
		await this.refresh();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case 'open-panel':
					await vscode.commands.executeCommand('stringboard.open');
					break;

				case 'cell-changed': {
					const { key, locale, value } = message.payload as { key: string; locale: string; value: string };
					const file = this.localeFiles.get(locale);
					if (file) {
						file.arbFile.entries.set(key, value);
						try {
							await writeArbFile(file.uri, file.arbFile.entries, file.arbFile.metadata, file.arbFile.locale);
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							void vscode.window.showErrorMessage(`Stringboard: failed to save: ${msg}`);
						}
					}
					break;
				}

				case 'add-key': {
					const keyName = await vscode.window.showInputBox({
						title: 'Add Translation Key',
						prompt: 'Enter a new translation key (e.g., settings.title)',
						placeHolder: 'settings.title',
						validateInput: (value) => {
							if (!value) {return 'Key name is required.';}
							if (!/^[a-zA-Z_][\w.]*$/.test(value)) {return 'Invalid key. Use letters, numbers, dots, and underscores.';}
							if (this.catalog?.rows.some(r => r.key === value)) {return `Key '${value}' already exists.`;}
							return null;
						},
						ignoreFocusOut: true,
					});
					if (!keyName) {break;}

					const description = await vscode.window.showInputBox({
						title: 'Add Translation Key',
						prompt: 'Optional description for this key',
						placeHolder: 'Description of what this key is used for',
						ignoreFocusOut: true,
					});

					const templateLocale = this.catalog?.templateLocale;
					const templateFile = templateLocale ? this.localeFiles.get(templateLocale) : undefined;
					if (templateFile) {
						templateFile.arbFile.entries.set(keyName, keyName);
						if (description) {
							const meta = templateFile.arbFile.metadata.get(keyName) ?? {};
							meta.description = description;
							templateFile.arbFile.metadata.set(keyName, meta);
						}
						try {
							await writeArbFile(templateFile.uri, templateFile.arbFile.entries, templateFile.arbFile.metadata, templateFile.arbFile.locale);
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							void vscode.window.showErrorMessage(`Stringboard: failed to save: ${msg}`);
						}
					}
					await this.refresh();
					break;
				}

				case 'add-locale': {
					await this.handleAddLocale();
					break;
				}

				case 'create-template': {
					await this.handleCreateTemplate();
					break;
				}

				case 'initialize-template': {
					await this.handleInitializeTemplate();
					break;
				}


			}
		});
	}

	async refresh(): Promise<void> {
		this.detectedFiles = await detectArbFiles();
		const result = await loadCatalog(this.detectedFiles);
		this.catalog = result.catalog;
		this.localeFiles = result.localeFiles;
		if (this._view) {
			this._view.webview.html = this.getHtml();
		}
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
				if (!value) {return 'Locale code is required.';}
				if (!/^[a-zA-Z]+(?:[_-][a-zA-Z]+)?$/.test(value)) {return 'Invalid locale code. Use only letters, hyphens, and underscores (e.g., en, pt-BR, zh_CN).';}
				if (this.localeFiles.has(value)) {return `Locale '${value}' already exists.`;}
				return null;
			},
			ignoreFocusOut: true,
		});

		if (!locale) {return;}

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

		await this.refresh();
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

		await this.refresh();
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
			await this.refresh();
			return;
		}

		try {
			await initializeArbFile(templateDetected.uri, templateDetected.locale, true);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			void vscode.window.showErrorMessage(`Stringboard: failed to initialize: ${message}`);
			return;
		}

		await this.refresh();
	}

	private escapeHtml(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	private getHtml(): string {
		const hasCatalog = this.catalog && this.catalog.rows.length > 0;
		const keysHtml = hasCatalog ? this.renderKeys() : this.renderEmpty();

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 8px 12px;
    margin: 0;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
  }
  .open-btn {
    font-family: var(--vscode-font-family);
    font-size: 11px;
    padding: 2px 10px;
    border: none;
    border-radius: 4px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    white-space: nowrap;
  }
  .open-btn:hover { background: var(--vscode-button-hoverBackground); }
  .actions {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }
  .action-btn {
    font-family: var(--vscode-font-family);
    font-size: 11px;
    padding: 3px 10px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    cursor: pointer;
    flex: 1;
  }
  .action-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
  .empty {
    margin-top: 16px;
    padding: 12px;
    border: 1px dashed var(--vscode-panel-border);
    border-radius: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  .keys { margin-top: 4px; }
  details {
    border-radius: 4px;
    margin-bottom: 2px;
  }
  details summary {
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 12px;
    user-select: none;
  }
  details summary:hover { background: var(--vscode-list-hoverBackground); }
  details[open] summary { margin-bottom: 2px; }
  .key-body { padding: 0 0 4px 16px; }
  .desc-row {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    padding: 2px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .locale-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .locale-row:hover { background: var(--vscode-list-hoverBackground); }
  .locale-label {
    font-size: 11px;
    font-weight: 500;
    min-width: 28px;
    padding-top: 3px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }
  .locale-value {
    flex: 1;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 2px;
    outline: none;
    min-height: 1.2em;
    word-break: break-word;
    white-space: pre-wrap;
    border: 1px solid transparent;
  }
  .locale-value:focus {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-input-background);
  }
  .locale-value.missing {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }
  .locale-value.missing:focus { font-style: normal; }
  .init-btn {
    font-family: var(--vscode-font-family);
    font-size: 12px;
    padding: 4px 12px;
    border: none;
    border-radius: 4px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    margin-top: 8px;
    width: 100%;
  }
  .init-btn:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <div class="header">
    <span class="title">Stringboard</span>
    <button class="open-btn" id="open-btn">Open in Tab</button>
  </div>
  <div class="actions">
    <button class="action-btn" id="add-key-btn">+ Add Key</button>
    <button class="action-btn" id="add-locale-btn">+ Add Locale</button>
  </div>
  ${keysHtml}
<script>
(function() {
  const vscode = acquireVsCodeApi();

  document.getElementById('open-btn').addEventListener('click', function() {
    vscode.postMessage({ type: 'open-panel' });
  });
  document.getElementById('add-key-btn').addEventListener('click', function() {
    vscode.postMessage({ type: 'add-key' });
  });
  document.getElementById('add-locale-btn').addEventListener('click', function() {
    vscode.postMessage({ type: 'add-locale' });
  });
  var initBtn = document.getElementById('init-template-btn');
  if (initBtn) initBtn.addEventListener('click', function() { vscode.postMessage({ type: 'initialize-template' }); });
  var createBtn = document.getElementById('create-template-btn');
  if (createBtn) createBtn.addEventListener('click', function() { vscode.postMessage({ type: 'create-template' }); });
  const values = document.querySelectorAll('.locale-value[contenteditable="true"]');
  values.forEach(function(cell) {
    var original = cell.textContent || '';
    cell.addEventListener('focus', function() { original = cell.textContent || ''; });
    cell.addEventListener('input', function() {
      if ((cell.textContent || '') !== '') cell.classList.remove('missing');
    });
    cell.addEventListener('blur', function() {
      var val = cell.textContent || '';
      if (val === '') {
        cell.innerHTML = '';
        cell.classList.add('missing');
      } else {
        cell.classList.remove('missing');
      }
      if (val === original) return;
      original = val;
      vscode.postMessage({
        type: 'cell-changed',
        payload: { key: cell.dataset.key, locale: cell.dataset.locale, value: val }
      });
    });
    cell.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cell.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cell.textContent = original; cell.blur(); }
    });
  });
})();
</script>
</body>
</html>`;
	}

	private renderEmpty(): string {
		if (this.detectedFiles.length === 0) {
			return '<div class="empty">No ARB files found.</div><button class="init-btn" id="create-template-btn">Initialize ARB File</button>';
		}
		return '<div class="empty">No translation keys found.</div><button class="init-btn" id="init-template-btn">Initialize Template with starter keys</button>';
	}

	private renderKeys(): string {
		if (!this.catalog) {return '';}

		const rowsHtml = this.catalog.rows.map(row => {
			const key = this.escapeHtml(row.key);
			const desc = row.description ? this.escapeHtml(row.description) : '';
			const descHtml = desc ? `<div class="desc-row">${desc}</div>` : '';

			const detailRows = this.catalog!.locales.map(locale => {
				const value = row.translations.get(locale) ?? '';
				const escapedValue = this.escapeHtml(value);
				const missingClass = !value ? ' missing' : '';
				return `
          <div class="locale-row">
            <span class="locale-label">${this.escapeHtml(locale)}</span>
            <div class="locale-value${missingClass}" contenteditable="true" spellcheck="false" data-key="${key}" data-locale="${this.escapeHtml(locale)}">${escapedValue}</div>
          </div>`;
			}).join('');

			return `
        <details>
          <summary>${key}</summary>
          <div class="key-body">
            ${descHtml}
            ${detailRows}
          </div>
        </details>`;
		}).join('');

		return rowsHtml;
	}
}

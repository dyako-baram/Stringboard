import * as vscode from 'vscode';
import type { DetectedArbFile } from '../arb/detector';

export function getStringboardHtml(detectedFiles: DetectedArbFile[]): string {
	const body = detectedFiles.length === 0
		? renderEmptyState()
		: renderFileList(detectedFiles);

	return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Stringboard</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 32px;
          }
          h1 { font-size: 20px; font-weight: 500; margin: 0 0 8px; }
          p.subtitle { font-size: 13px; color: var(--vscode-descriptionForeground); margin: 0 0 24px; }
          .empty-state {
            margin-top: 32px;
            padding: 24px;
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 6px;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
          }
          .empty-state ul { margin: 8px 0 0; padding-left: 20px; }
          .empty-state code {
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            padding: 1px 4px;
            border-radius: 3px;
          }
          .file-list {
            margin-top: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
          }
          .file-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            font-size: 13px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .file-row:last-child { border-bottom: none; }
          .file-name {
            font-family: var(--vscode-editor-font-family);
            flex: 1;
          }
          .file-path {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
          }
          .locale-chip {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
          }
          .template-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            background: var(--vscode-statusBarItem-prominentBackground, var(--vscode-badge-background));
            color: var(--vscode-statusBarItem-prominentForeground, var(--vscode-badge-foreground));
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <h1>Stringboard</h1>
        <p class="subtitle">Visual editor for Flutter translation files.</p>
        ${body}
      </body>
      </html>
    `;
}

function renderFileList(files: DetectedArbFile[]): string {
	const ordered = [...files].sort((a, b) => {
		if (a.isTemplate !== b.isTemplate) {
			return a.isTemplate ? -1 : 1;
		}
		return a.locale.localeCompare(b.locale);
	});

	const summary = `Found ${files.length} ARB file${files.length === 1 ? '' : 's'}.`;
	const rows = ordered.map(renderFileRow).join('');

	return /* html */ `
        <p class="subtitle">${escapeHtml(summary)}</p>
        <div class="file-list">${rows}</div>
    `;
}

function renderFileRow(file: DetectedArbFile): string {
	const basename = file.uri.path.split('/').pop() ?? file.uri.path;
	const relative = vscode.workspace.asRelativePath(file.uri);
	const showRelative = relative !== basename;
	const templateBadge = file.isTemplate
		? '<span class="template-badge">Template</span>'
		: '';

	return /* html */ `
        <div class="file-row">
          <span class="locale-chip">${escapeHtml(file.locale)}</span>
          <span class="file-name">${escapeHtml(basename)}</span>
          ${showRelative ? `<span class="file-path">${escapeHtml(relative)}</span>` : ''}
          ${templateBadge}
        </div>
    `;
}

function renderEmptyState(): string {
	return /* html */ `
        <div class="empty-state">
          <strong>No ARB files found.</strong>
          <p>Stringboard looks for <code>.arb</code> files in any of these locations:</p>
          <ul>
            <li><code>**/l10n/</code></li>
            <li><code>**/lib/i18n/</code></li>
            <li><code>**/assets/i18n/</code></li>
            <li><code>**/translations/</code></li>
          </ul>
          <p>Open a Flutter project containing translation files and re-run <code>Stringboard: Open editor</code>.</p>
        </div>
    `;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

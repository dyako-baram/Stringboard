import * as vscode from 'vscode';
import type { DetectedArbFile } from '../arb/detector';
import type { Catalog, CatalogRow } from '../model/catalog';
export function getStringboardHtml(
	detectedFiles: DetectedArbFile[],
	catalog: Catalog | undefined,
): string {
	let body: string;
	if (detectedFiles.length === 0) {
		body = renderEmptyState();
	} else if (catalog && catalog.rows.length > 0) {
		body = renderCatalog(detectedFiles, catalog);
	} else {
		body = renderFileList(detectedFiles);
	}

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
          .catalog {
            margin-top: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
          }
          table.catalog-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
            color: var(--vscode-foreground);
          }
          table.catalog-table thead th {
            position: sticky;
            top: 0;
            z-index: 1;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 10px 14px;
            white-space: nowrap;
          }
          table.catalog-table tbody td {
            padding: 8px 14px;
            border-bottom: 1px solid var(--vscode-panel-border);
            vertical-align: top;
            white-space: pre-wrap;
            word-break: break-word;
          }
          table.catalog-table tbody tr:last-child td { border-bottom: none; }
          table.catalog-table tbody tr:nth-child(even) td {
            background: var(--vscode-list-inactiveSelectionBackground, transparent);
            background: color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
          }
          table.catalog-table tbody tr:hover td {
            background: var(--vscode-list-hoverBackground);
          }
          table.catalog-table .col-key {
            font-family: var(--vscode-editor-font-family);
            font-weight: 500;
            color: var(--vscode-foreground);
            width: 1%;
            white-space: nowrap;
          }
          table.catalog-table .col-description {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            max-width: 280px;
          }
          table.catalog-table .col-translation {
            padding: 0;
          }
          table.catalog-table .cell {
            padding: 8px 14px;
            outline: none;
            min-height: 1em;
            white-space: pre-wrap;
            word-break: break-word;
          }
          table.catalog-table .cell:empty::before {
            content: '—';
            color: var(--vscode-descriptionForeground);
          }
          table.catalog-table .cell.missing:not(:focus) {
            background: var(--vscode-editorWarning-background, rgba(245, 158, 11, 0.1));
          }
          table.catalog-table .cell.missing:empty::before {
            content: 'missing';
            font-style: italic;
            color: var(--vscode-descriptionForeground);
          }
          table.catalog-table .cell:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
            background: var(--vscode-editor-background);
          }
          table.catalog-table .cell:focus:empty::before {
            content: '';
          }
          .header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }
          .header-row .subtitle {
            flex: 1;
          }
          .add-locale-btn {
            font-family: var(--vscode-font-family);
            font-size: 12px;
            padding: 4px 12px;
            border: none;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            white-space: nowrap;
          }
          .add-locale-btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .init-btn {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 6px 16px;
            border: none;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            margin-top: 12px;
          }
          .init-btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <h1>Stringboard</h1>
        <p class="subtitle">Visual editor for Flutter translation files.</p>
        ${body}
        <script>
          (function () {
            const vscode = acquireVsCodeApi();

            const addBtn = document.getElementById('add-locale-btn');
            if (addBtn) {
              addBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'add-locale' });
              });
            }
            const addKeyBtn = document.getElementById('add-key-btn');
            if (addKeyBtn) {
              addKeyBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'add-key' });
              });
            }
            const createBtn = document.getElementById('create-template-btn');
            if (createBtn) {
              createBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'create-template' });
              });
            }
            const initBtn = document.getElementById('init-template-btn');
            if (initBtn) {
              initBtn.addEventListener('click', function () {
                vscode.postMessage({ type: 'initialize-template' });
              });
            }
            const cells = document.querySelectorAll('.cell[contenteditable="true"]');
            cells.forEach(function (cell) {
              let original = cell.textContent || '';
              cell.addEventListener('focus', function () {
                original = cell.textContent || '';
              });
              cell.addEventListener('input', function () {
                if ((cell.textContent || '') !== '') {
                  cell.classList.remove('missing');
                }
              });
              cell.addEventListener('blur', function () {
                const value = cell.textContent || '';
                if (value === '') {
                  cell.innerHTML = '';
                  cell.classList.add('missing');
                } else {
                  cell.classList.remove('missing');
                }
                if (value === original) {
                  return;
                }
                original = value;
                vscode.postMessage({
                  type: 'cell-changed',
                  payload: {
                    key: cell.dataset.key,
                    locale: cell.dataset.locale,
                    value: value,
                  },
                });
              });
              cell.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  cell.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cell.textContent = original;
                  cell.blur();
                }
              });
            });
          })();
        </script>
      </body>
      </html>
    `;
}

function renderCatalog(detectedFiles: DetectedArbFile[], catalog: Catalog): string {
	const summary = `Found ${detectedFiles.length} ARB file${detectedFiles.length === 1 ? '' : 's'} · ${catalog.rows.length} key${catalog.rows.length === 1 ? '' : 's'} · template: ${escapeHtml(catalog.templateLocale)}`;
	const localeHeaders = catalog.locales
		.map(locale => `<th scope="col">${escapeHtml(locale)}${locale === catalog.templateLocale ? ' <span class="template-badge">Template</span>' : ''}</th>`)
		.join('');
	const rows = catalog.rows.map(row => renderCatalogRow(row, catalog.locales)).join('');

	return /* html */ `
        <div class="header-row">
          <p class="subtitle">${summary}</p>
          <button class="add-locale-btn" id="add-key-btn">+ Add Key</button>
          <button class="add-locale-btn" id="add-locale-btn">+ Add Locale</button>
        </div>
		<div class="catalog">
          <table class="catalog-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Description</th>
                ${localeHeaders}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
    `;
}

function renderCatalogRow(row: CatalogRow, locales: string[]): string {
	const description = row.description ? escapeHtml(row.description) : '';
	const keyAttr = escapeHtml(row.key);
	const translations = locales.map(locale => {
		const value = row.translations.get(locale) ?? '';
		const cellClass = value === '' ? 'cell missing' : 'cell';
		return `<td class="col-translation"><div class="${cellClass}" contenteditable="true" spellcheck="false" data-key="${keyAttr}" data-locale="${escapeHtml(locale)}">${escapeHtml(value)}</div></td>`;
	}).join('');

	return /* html */ `
        <tr>
          <td class="col-key">${escapeHtml(row.key)}</td>
          <td class="col-description">${description}</td>
          ${translations}
        </tr>
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

	const hasTemplate = files.some(f => f.isTemplate);

	return /* html */ `
        <div class="header-row">
          <p class="subtitle">${escapeHtml(summary)}</p>
          <button class="add-locale-btn" id="add-locale-btn">+ Add Locale</button>
        </div>
        ${hasTemplate ? '<div style="margin-top:8px"><button class="init-btn" id="init-template-btn">Initialize Template with starter keys</button></div>' : ''}
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
          <p>Create a new ARB file with default content to get started:</p>
          <button class="init-btn" id="create-template-btn">Initialize ARB File</button>
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

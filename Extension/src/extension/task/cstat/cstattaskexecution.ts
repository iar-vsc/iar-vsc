/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as vscode from "vscode";
import { CStatTaskDefinition } from "./cstattaskprovider";
import { OsUtils, CommandUtils } from "../../../utils/utils";
import { CStat } from "../../../iar/tools/cstat";

/**
 * Executes a c-stat task, i.e. generates and clears C-STAT warnings and displays them in vs code.
 * The Pseudoterminal is needed for custom task executions, and based on the official example:
 * https://github.com/microsoft/Vscode-extension-samples/blob/master/task-provider-sample/src/customTaskProvider.ts
 */
export class CStatTaskExecution implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<void>();
    onDidClose?: vscode.Event<void> = this.closeEmitter.event;

    onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

    private definition: CStatTaskDefinition;

    constructor(private diagnostics: vscode.DiagnosticCollection, definition: CStatTaskDefinition) {
        // substitute command variables
        const resolvedDef: any = definition;
        for (const property in resolvedDef) {
            if (resolvedDef[property]) {
                resolvedDef[property] = CommandUtils.parseSettingCommands(resolvedDef[property]);
            }
        }
        this.definition = resolvedDef;
    }

    open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
        if (!this.definition.builder || !this.definition.project || !this.definition.config) {
            this.writeEmitter.fire("Error: Make sure you select a workbench, project and configuration before running this task.");
            this.closeEmitter.fire(undefined);
            return;
        }
        if (this.definition.action === "run") {
            this.generateDiagnostics();
        } else if (this.definition.action === "clear") {
            this.clearDiagnostics();
        }
    }

    close(): void {
    }

    /**
     * Runs C-STAT on the current project and updates the warnings displayed in VS Code
     */
    private generateDiagnostics(): Thenable<void> {
        if (OsUtils.detectOsType() !== OsUtils.OsType.Windows) {
            vscode.window.showErrorMessage("IAR: C-STAT tasks can only be run on Windows.");
            return Promise.reject();
        }

        const projectPath = this.definition.project;
        const configName = this.definition.config;
        const builderPath = this.definition.builder;

        const doFilterSuppressions = vscode.workspace.getConfiguration("iarvsc").get<boolean>("c-StatFilterSuppressions");

        this.writeEmitter.fire("Running C-STAT...\r\n");

        const analysis = CStat.runAnalysis(builderPath, projectPath, configName, (msg) => this.writeEmitter.fire(msg));
        return analysis.then(() => {
            return CStat.getAllWarnings(projectPath, configName, doFilterSuppressions === undefined ? true : doFilterSuppressions).then(warnings => {
                this.writeEmitter.fire("Analyzing output...\r\n");
                this.diagnostics.clear();

                const filterString = vscode.workspace.getConfiguration("iarvsc").get<string>("c-StatFilterLevel");
                const filterLevel = filterString ?
                    CStat.SeverityStringToSeverityEnum(filterString)
                    : CStat.CStatWarningSeverity.LOW;
                warnings = warnings.filter(w => w.severity >= filterLevel);
                this.writeEmitter.fire("After filtering, " + warnings.length + " warning(s) remain.\r\n");

                let fileDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
                warnings.forEach(warning => {
                    const diagnostic = CStatTaskExecution.warningToDiagnostic(warning);
                    const fileUri = vscode.Uri.file(warning.file);

                    console.info(`Diagnostic: ${fileUri.toString()} -> ${warning.checkId}:${warning.line}:${warning.col}:${warning.message}\r\n`);
                    fileDiagnostics.push([fileUri, [diagnostic]]);
                });

                this.diagnostics.set(fileDiagnostics);
                this.writeEmitter.fire("C-STAT is done!\r\n");
                this.closeEmitter.fire(undefined);
            }, this.onError.bind(this)); /* getAllWarnings.then */
        }, this.onError.bind(this)); /* analysis.then */
    }

    /**
     * Clears all C-STAT warnings
     */
    private clearDiagnostics() {
        this.writeEmitter.fire("Clearing C-STAT Warnings...\r\n");
        this.diagnostics.clear();
        this.closeEmitter.fire(undefined);
    }

    private onError(reason: any) {
        this.writeEmitter.fire(reason + "\r\n");
        this.closeEmitter.fire(undefined);
    }

    private static warningToDiagnostic(warning: CStat.CStatWarning): vscode.Diagnostic {
        // VS Code uses zero-based lines/cols, C-STAT is one-based, so we need to correct for this.
        // Also, C-STAT seems to use (0,0) for msgs without a position, so we need to make sure
        // not to put these at (-1,-1) in VS Code (it doesn't like that).
        if (warning.line === 0) { warning.line = 1; }
        if (warning.col === 0) { warning.col = 1; }
        const pos = new vscode.Position(warning.line - 1, warning.col - 1);
        const range = new vscode.Range(pos, pos);

        let severity = vscode.DiagnosticSeverity.Warning;
        if (vscode.workspace.getConfiguration("iarvsc").get<boolean>("c-StatDisplayLowSeverityWarningsAsHints")) {
            if (warning.severity === CStat.CStatWarningSeverity.LOW) { severity = vscode.DiagnosticSeverity.Hint; }
        }

        const diagnostic = new vscode.Diagnostic(range, warning.message, severity);
        diagnostic.source = warning.checkId;
        return diagnostic;
    }
}
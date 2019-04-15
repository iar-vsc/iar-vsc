/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

import * as Vscode from "vscode";
import * as Path from "path";
import * as Fs from "fs";
import { XmlNode } from "../../utils/XmlNode";
import { IarXml } from "../../utils/xml";

export interface IncludePath {
    readonly path: Fs.PathLike;
    readonly absolutePath: Fs.PathLike;
    readonly workspacePath: Fs.PathLike;
}

export class XmlIncludePath implements IncludePath {
    private xmlData: XmlNode;
    private projectPath: Fs.PathLike;

    constructor(xml: XmlNode, projectPath: Fs.PathLike) {
        this.xmlData = xml;
        this.projectPath = projectPath;

        if (xml.tagName !== "state") {
            throw new Error("Expected an xml element 'state' instead of '" + xml.tagName + "'.");
        }
    }

    get path(): Fs.PathLike {
        let path = this.xmlData.text;

        if (path) {
            return path;
        } else {
            return "";
        }
    }

    get absolutePath(): Fs.PathLike {

        let fullPath = this.path.toString().replace('$PROJ_DIR$', this.projectPath.toString());

        return Path.resolve(fullPath);
    }

    get workspacePath(): Fs.PathLike {
        if (Vscode.workspace.workspaceFolders && (Vscode.workspace.workspaceFolders.length > 0)) {
            return Path.relative(Vscode.workspace.workspaceFolders[0].uri.fsPath, this.absolutePath.toString());
        } else {
            return this.absolutePath;
        }
    }
}

export class StringIncludePath implements IncludePath {
    private includePath: Fs.PathLike;
    private projectPath: Fs.PathLike | undefined;

    constructor(includePath: string, projectPath: string | undefined = undefined) {
        this.includePath = includePath;
        this.projectPath = projectPath;
    }

    get path(): Fs.PathLike {
        return this.includePath;
    }

    get absolutePath(): Fs.PathLike {
        if (this.projectPath === undefined) {
            return Path.resolve(this.includePath.toString());
        } else {
            let fullPath = this.includePath.toString().replace('$PROJ_DIR$', this.projectPath.toString());

            return Path.resolve(fullPath);
        }
    }

    get workspacePath(): Fs.PathLike {
        if (Vscode.workspace.workspaceFolders && (Vscode.workspace.workspaceFolders.length > 0)) {
            return Path.relative(Vscode.workspace.workspaceFolders[0].uri.fsPath, this.absolutePath.toString());
        } else {
            return this.absolutePath;
        }
    }
}

export namespace IncludePath {
    export function fromXmlData(xml: XmlNode, projectPath: Fs.PathLike): [IncludePath[], boolean] {
        let settings = IarXml.findSettingsFromConfig(xml, '/ICC.*/');

        if (settings) {
            let option = IarXml.findOptionFromSettings(settings, '/CCIncludePath/');

            if (option) {
                let states = option.getAllChildsByName('state');
                let includePaths: IncludePath[] = [];

                states.forEach(state => {
                    let path = new XmlIncludePath(state, projectPath);

                    if (path.path !== "") {
                        includePaths.push(path);
                    }
                });

                let cmsisIncluded = false;
                let iccCmsis = IarXml.findOptionFromSettings(settings, '/IccCmsis/');

                if (iccCmsis) {
                    let state = iccCmsis.getFirstChildByName('state');

                    if (state !== undefined && state.text === "1") {
                        cmsisIncluded = true;
                    }
                }

                return [includePaths, cmsisIncluded];
            }
        }

        return [[], false];
    }

    export function fromCompilerOutput(output: string): IncludePath[] {
        let includes: IncludePath[] = [];

        let regex = /\$\$FILEPATH\s\"([^"]*)/g;
        let result: RegExpExecArray | null = null;
        do {
            result = regex.exec(output);

            if (result !== null && (result.length === 2)) {
                let p = result[1].replace(/\\\\/g, "\\");

                try {
                    let stat = Fs.statSync(p);

                    if (stat.isDirectory()) {
                        includes.push(new StringIncludePath(p));
                    }
                } catch (e) {
                }
            }
        } while (result);

        return includes;
    }
}

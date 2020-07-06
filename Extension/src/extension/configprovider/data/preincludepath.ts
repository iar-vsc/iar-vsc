/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

import * as Vscode from "vscode";
import * as Fs from "fs";
import * as Path from "path";

import { XmlNode } from "../../../utils/XmlNode";
import { IarXml } from "../../../utils/xml";

export interface PreIncludePath {
    readonly path: Fs.PathLike;
    readonly absolutePath: Fs.PathLike;
    readonly workspaceRelativePath: Fs.PathLike;
}

class BasePreIncludePath implements PreIncludePath {

    constructor(private localPath: Fs.PathLike, private projectPath: Fs.PathLike) {
    }

    get path(): Fs.PathLike {
        return this.localPath;
    }

    get absolutePath(): Fs.PathLike {
        return this.localPath.toString().replace('$PROJ_DIR$', this.projectPath.toString());
    }

    get workspaceRelativePath(): Fs.PathLike {
        if (Vscode.workspace.rootPath) {
            return Path.relative(Vscode.workspace.rootPath, this.localPath.toString());
        } else {
            return this.absolutePath;
        }

    }
}

class XmlPreIncludePath extends BasePreIncludePath {
    constructor(xml: XmlNode, projectPath: Fs.PathLike) {
        if (xml.tagName !== "state") {
            throw new Error("Expected an xml element 'state' instead of '" + xml.tagName + "'.");
        }
        super(xml.text ? xml.text : "", projectPath);
    }
}

export namespace PreIncludePath {

    export function fromXml(xml: XmlNode, projectPath: Fs.PathLike): PreIncludePath[] {
        let settings = IarXml.findSettingsFromConfig(xml, '/ICC.*/');

        if (settings) {
            let option = IarXml.findOptionFromSettings(settings, 'PreInclude');

            if (option) {
                let states = option.getAllChildsByName('state');
                let preIncludePaths: PreIncludePath[] = [];

                states.forEach(state => {
                    let path = new XmlPreIncludePath(state, projectPath);

                    if (path.path) {
                        preIncludePaths.push(path);
                    }
                });

                return preIncludePaths;
            }
        }

        return [];
    }

    /**
     * Finds preincludes from a list of command-line arguments to a compiler
     */
    export function fromCompilerArgs(args: string[], projectPath: Fs.PathLike): PreIncludePath[] {
        const preIncludePaths: PreIncludePath[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "--preinclude") {
                if (i+1 < args.length) {
                    preIncludePaths.push(new BasePreIncludePath(args[i+1], projectPath));
                }
            }
        }
        return preIncludePaths;
    }
}

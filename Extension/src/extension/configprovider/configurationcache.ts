/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Uri } from "vscode";
import { PartialSourceFileConfiguration } from "./data/partialsourcefileconfiguration";

/**
 * Caches project configuration data (include paths/defines).
 */
export interface ConfigurationCache {
    getConfiguration(file: Uri): PartialSourceFileConfiguration | undefined;
    putConfiguration(file: Uri, configuration: PartialSourceFileConfiguration): void;
}

/**
 * Maps file paths to their config data using a regular javascript object indexed by file path
 */
export class SimpleConfigurationCache implements ConfigurationCache {
    private configurations: Record<string, PartialSourceFileConfiguration> = {};

    getConfiguration(file: Uri): PartialSourceFileConfiguration | undefined {
        return this.configurations[file.path.toLowerCase()];
    }

    putConfiguration(file: Uri, configuration: PartialSourceFileConfiguration) {
        this.configurations[file.path.toLowerCase()] = configuration;
    }
}
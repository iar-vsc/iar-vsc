/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

import * as Vscode from "vscode";
import { CommandBase } from "./command";
import { CompilerListModel } from "../model/selectcompiler";
import { ConfigurationListModel } from "../model/selectconfiguration";
import { CppToolsConfigGenerator } from "../../vsc/CppToolsConfigGenerator";
import { Logging } from "../../utils/logging";

class GenerateCppToolsConfCommand extends CommandBase {
    private compilerModel: CompilerListModel;
    private configModel: ConfigurationListModel;

    constructor(compilerModel: CompilerListModel, configModel: ConfigurationListModel) {
        super("iar.generateCppToolsConfig");

        this.compilerModel = compilerModel;
        this.configModel = configModel;

        this.compilerModel.addOnSelectedHandler(this.executeImpl, this);
        this.configModel.addOnSelectedHandler(this.executeImpl, this);
    }

    executeImpl(): void {
        Vscode.window.showInformationMessage("Generating cpptools config file");

        CppToolsConfigGenerator.generate(this.configModel.selected, this.compilerModel.selected).then((result) => {
            Logging.getInstance().info("Generator finished.");

            if (result) {
                Logging.getInstance().warning("Error during generation: {0}", result.message);
                Vscode.window.showErrorMessage(result.message);
            }
        }).catch(() => {
            Logging.getInstance().warning("Generation promise failed.");
            Vscode.window.showErrorMessage("Failed to generate configuration.");
        });
    }
}

export namespace Command {
    export function createGenerateCppToolsConfig(compilerModel: CompilerListModel, configModel: ConfigurationListModel) {
        return new GenerateCppToolsConfCommand(compilerModel, configModel);
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

import * as Fs from "fs";
import * as Path from "path";

import { XmlNode } from '../../utils/XmlNode';
import { Define } from './define';
import { IncludePath } from './includepath';
import { PreIncludePath } from './preincludepath';
import { IarXml } from "../../utils/xml";

export interface Config {
    readonly name: string;
    readonly defines: Define[];
    readonly includes: IncludePath[];
    readonly preIncludes: PreIncludePath[];
    readonly includeCmsis: boolean;
}

class XmlConfig implements Config {
    private xml: XmlNode;

    readonly defines: Define[];
    readonly includes: IncludePath[];
    readonly preIncludes: PreIncludePath[];
    readonly includeCmsis: boolean;

    constructor(xmlConfigElement: XmlNode, ewpPath: Fs.PathLike) {
        this.xml = xmlConfigElement;

        if (this.xml.tagName !== "configuration") {
            throw new Error(
                "Expected an xml element 'configuration' instead of '" +
                    this.xml.tagName +
                    "'"
            );
        }

        const projectRoot = Path.parse(ewpPath.toString()).dir;

        this.defines = Define.fromXml(xmlConfigElement);
        [this.includes, this.includeCmsis] = IncludePath.fromXmlData(xmlConfigElement, projectRoot);
        this.preIncludes = PreIncludePath.fromXml(xmlConfigElement, projectRoot);
    }

    get name(): string {
        let name = IarXml.getNameTextFromElement(this.xml);

        if (name === undefined) {
            return "";
        } else {
            return name;
        }
    }
}

export namespace Config {
    export function fromXml(projectXml: XmlNode, ewpPath: Fs.PathLike): Config[] {
        let configs: Config[] = [];

        let xmlConfigs = projectXml.getAllChildsByName("configuration");

        xmlConfigs.forEach(config => {
            try {
                configs.push(new XmlConfig(config, ewpPath));
            } catch (e) {
            }
        });

        return configs;
    }
}

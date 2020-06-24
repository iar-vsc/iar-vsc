/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Assert from "assert";
import { DynamicConfigGenerator } from "../../src/extension/configprovider/dynamicconfiggenerator";
import { Readable } from "stream";

suite("Test config generator", () => {
    test("Parse IarBuild logs", async () => {
        const generator = new DynamicConfigGenerator();

        {
            let buildOutput = "\nBanner...\n\n";
            buildOutput += ">iccarm.exe \"-D\" \"DEBUG\" \"-I\" \"C:\\My Include Dir\"\\ \"--cpu=Cortex-A53\" \"-D\" \"\\\"MyStringDefine\\\"\" \"--no_cse\" \n";
            buildOutput += ">iccarm.exe \"-D\" \"DEBUG\" \"-I\" \"C:\\My Include Dir\" \"--cpu=Cortex-A53\" \"-D\" \"\\\"MyStringDefine\\\"\" \"--no_cse\" \n";
            buildOutput += "Linking\n\n";
            buildOutput += ">ilinkarm.exe params";

            const readable = new Readable();
            readable._read = () => {};
            readable.push(buildOutput);
            readable.push(null);
            const invocations = await generator["findCompilerInvocations"](readable); // Hacky way of accessing private function
            Assert.equal(invocations.length, 2);
            stringArrayAssert(invocations[0], ["iccarm.exe", "-D", "DEBUG", "-I", "C:\\My Include Dir", "--cpu=Cortex-A53", "-D", "\"MyStringDefine\"", "--no_cse"]);
            stringArrayAssert(invocations[1], ["iccarm.exe", "-D", "DEBUG", "-I", "C:\\My Include Dir", "--cpu=Cortex-A53", "-D", "\"MyStringDefine\"", "--no_cse"]);
        }

        {
            // test linux and AVR variant
            let buildOutput = "\nBanner...\n\n";
            buildOutput += ">iccavr \"-D\" \"DEBUG\" \"-I\" \"/usr/My Include Dir/\"\\ \"--cpu=Cortex-A53\" \"-D\" \"\\\"MyStringDefine\\\"\" \"--no_cse\" \n";
            buildOutput += ">iccavr \"-D\" \"DEBUG\" \"-I\" \"/usr/My Include Dir/\" \"--cpu=Cortex-A53\" \"-D\" \"\\\"MyStringDefine\\\"\" \"--no_cse\" \n";
            buildOutput += "Linking\n\n";
            buildOutput += ">xlink params";
            const readable = new Readable();
            readable._read = () => {};
            readable.push(buildOutput);
            readable.push(null);
            const invocations = await generator["findCompilerInvocations"](readable); // Hacky way of accessing private function
            Assert.equal(invocations.length, 2);
            stringArrayAssert(invocations[0], ["iccavr", "-D", "DEBUG", "-I", "/usr/My Include Dir/", "--cpu=Cortex-A53", "-D", "\"MyStringDefine\"", "--no_cse"]);
            stringArrayAssert(invocations[1], ["iccavr", "-D", "DEBUG", "-I", "/usr/My Include Dir/", "--cpu=Cortex-A53", "-D", "\"MyStringDefine\"", "--no_cse"]);
        }
    });
});

function stringArrayAssert(a1: string[], a2: string[]) {
    Assert.equal(JSON.stringify(a1), JSON.stringify(a2));
}
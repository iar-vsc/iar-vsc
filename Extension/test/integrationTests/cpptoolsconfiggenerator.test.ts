/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Assert from "assert";
import * as path from "path";
import * as Vscode from "vscode";
import { StaticConfigGenerator } from "../../src/extension/configprovider/staticconfiggenerator";
import { Define } from "../../src/extension/configprovider/data/define";
import { IncludePath } from "../../src/extension/configprovider/data/includepath";
import { PreIncludePath } from "../../src/extension/configprovider/data/preincludepath";
import { PartialSourceFileConfiguration } from "../../src/extension/configprovider/data/partialsourcefileconfiguration";
import { Project } from "../../src/iar/project/project";
import { Workbench } from "../../src/iar/tools/workbench";
import { ToolManager } from "../../src/iar/tools/manager";
import { Settings } from "../../src/extension/settings";
import { Compiler } from "../../src/iar/tools/compiler";
import { Platform } from "../../src/iar/tools/platform";
import { DynamicConfigGenerator } from "../../src/extension/configprovider/dynamicconfiggenerator";
import { unlinkSync, existsSync } from "fs";

const TEST_PROJECT_FILE = path.resolve(__dirname, "../../../test/ewpFiles/test_project.ewp");
const TEST_SOURCE_FILE = path.resolve(__dirname, "../../../test/ewpFiles/main.c");

/// NOTE: these tests require an EW installation with an arm toolchain installed, and some will probably only succeed on windows
// These tests use an actual EW together with a prepared .ewp file to to make sure the config generators
// find the include paths and defines they're supposed to.
suite("CppTools Config Generators for ARM", function() {
    this.timeout(0);

    let workbench: Workbench | undefined;
    let project: Project | undefined;
    let platform: Platform | undefined;
    let compiler: Compiler | undefined;

    suiteSetup(() => {
        let manager = ToolManager.createIarToolManager();
        Settings.getIarInstallDirectories().forEach(directory => {
            manager.collectFrom(directory);
        });

        const workbenches = manager.findWorkbenchesContainingPlatform("arm");
        Assert(workbenches && workbenches.length > 0, "These tests require an ARM EW to run");
        workbench = workbenches!![0];

        platform = workbench!!.platforms.find(platform => {
            let armCompiler = platform.compilers.find(comp => comp.name.startsWith("iccarm"));
            if (armCompiler) {
                compiler = armCompiler;
                return true;
            }
            return false;
        });
        Assert(compiler && platform, "These tests requires an ARM compiler");

        project = Project.createProjectFrom(TEST_PROJECT_FILE);
        if (!project) {
            Assert.fail("Unable to load test project");
        }
    });

    suiteTeardown(() => {
        const depFile = TEST_PROJECT_FILE.replace(".ewp", ".dep");
        if (existsSync(depFile)) {
            unlinkSync(depFile);
        }
    });

    test(".ewp parsing", () => {
        const expected = createExpectedResultFromParsing();

        const actual = StaticConfigGenerator.generateConfiguration("c", project!!.configurations[0], project);

        verifySourceConfiguration(actual, expected);
    });

    test("Compiler specifics", () => {
        const expected = createExpectedResultFromCompilerSpecifics(platform!!);

        const actual = StaticConfigGenerator.generateConfiguration("c", undefined, undefined, compiler);

        // It's infeasible and unmaintainable to check for all compiler defines (there are about 400),
        // just check that some common ones are present
        verifyDefinesLenient(actual.defines, expected.defines);
        expected.defines = actual.defines;

        verifySourceConfiguration(actual, expected);
    });

    test("Dynamic generator", async function() {
        const generator = new DynamicConfigGenerator();
        Assert(await generator.generateConfiguration(workbench!!, project!!, compiler!!, project!!.configurations[0]));
        const uri = Vscode.Uri.file(TEST_SOURCE_FILE);

        const actual = generator.getConfiguration(uri);
        Assert(actual !== undefined);

        const expected = createExpectedResultFromDynamicGenerator(platform!!);

        // It's infeasible and unmaintainable to check for all compiler defines (there are about 400),
        // just check that some common expected ones are present
        verifyDefinesLenient(actual!!.defines, expected.defines);
        expected.defines = actual!!.defines;

        verifySourceConfiguration(actual!!, expected);
    });

  
});

// checks that all expected defines are in the actual defines, does _not_ check that all actual defines are in the expected defines
function verifyDefinesLenient(actual: Define[], expected: Define[]) {
    Assert(!expected.some(expectedDefine => {
        return !actual.some(actualDefine => defineEqual(actualDefine, expectedDefine));
    }));
}

function verifySourceConfiguration(actual: PartialSourceFileConfiguration, expected: PartialSourceFileConfiguration): void {

    Assert.equal(actual.defines.length, expected.defines.length);
    Assert.equal(actual.includes.length, expected.includes.length);
    Assert.equal(actual.preIncludes.length, expected.preIncludes.length);

    const includePathEqual = (p1: IncludePath, p2: IncludePath): boolean => {
        // skip workspace relative path here, since it depends on where the test is run
        return ((path.resolve(p1.absolutePath.toString()) === path.resolve(p2.absolutePath.toString()))
                    && (path.resolve(p1.path.toString()) === path.resolve(p2.path.toString())));
    };
    const preincludePathEqual = (p1: PreIncludePath, p2: PreIncludePath): boolean => {
        // skip workspace relative path here, since it depends on where the test is run
        return ((path.resolve(p1.absolutePath.toString()) === path.resolve(p2.absolutePath.toString()))
                    && (path.resolve(p1.path.toString()) === path.resolve(p2.path.toString())));
    };

    Assert.equal(arraysContainSameElements(defineEqual, actual.defines, expected.defines), true);
    Assert.equal(arraysContainSameElements(includePathEqual, actual.includes, expected.includes), true);
    Assert.equal(arraysContainSameElements(preincludePathEqual, actual.preIncludes, expected.preIncludes), true);
}

function defineEqual(d1: Define, d2: Define): boolean {
    return ((d1.value === d2.value) && (d1.identifier === d2.identifier));
}

function createExpectedResultFromParsing(): PartialSourceFileConfiguration {
    let defines: Define[] = [
        Define.fromIdentifierValuePair("_MySymbol", "1"),
        Define.fromIdentifierValuePair("_HelloEwpParser", "\"nice\""),
    ];
    let includePaths: IncludePath[] = [
        { path: "C:\\Program Files", absolutePath: "C:\\Program Files", workspacePath: "C:\\Program Files" },
    ];

    let preIncludePaths: PreIncludePath[] = [
        { path: "C:\\MyPreinclude.h", absolutePath: "C:\\MyPreinclude.h", workspaceRelativePath: "C:\\MyPreinclude.h" }
    ];

    return {
        defines,
        includes: includePaths,
        preIncludes: preIncludePaths,
    };
}

function createExpectedResultFromCompilerSpecifics(platform: Platform): PartialSourceFileConfiguration {
    let defines: Define[] = [
        Define.fromIdentifierValuePair("__CHAR_BITS__", "8"),
        Define.fromIdentifierValuePair("_VA_DEFINED", undefined),
        // keywords are supposed to be included
        Define.fromIdentifierValuePair("__thumb", ""),
        Define.fromIdentifierValuePair("__no_init", ""),
    ];
    let platformIncPath = path.join(platform.path.toString(), "inc");
    let langIncPath = path.join(platformIncPath, "c");
    let includePaths: IncludePath[] = [
        { path: platformIncPath, absolutePath: platformIncPath, workspacePath: platformIncPath },
        { path: langIncPath, absolutePath: langIncPath, workspacePath: langIncPath },
    ];

    let preIncludePaths: PreIncludePath[] = [
    ];

    return {
        defines,
        includes: includePaths,
        preIncludes: preIncludePaths,
    };
}

function createExpectedResultFromDynamicGenerator(platform: Platform): PartialSourceFileConfiguration {
    let defines: Define[] = [
        // Now we should have project/configuration specific defines
        // This value is normally 0xff, but is 127 because "signed chars" is enabled for the project
        Define.fromIdentifierValuePair("__CHAR_MAX__", "127"),
        // This macro is only defined for main.c
        Define.fromIdentifierValuePair("_LocalMacro", "1"),
    ];
    // And should be able to find CMSIS
    let cmsisIncPath = path.join(platform.path.toString(), "CMSIS/Core/Include");
    let dspIncPath = path.join(platform.path.toString(), "CMSIS/DSP/Include");
    let includePaths: IncludePath[] = [
        { path: cmsisIncPath, absolutePath: cmsisIncPath, workspacePath: cmsisIncPath },
        { path: dspIncPath, absolutePath: dspIncPath, workspacePath: dspIncPath },
    ];

    let preIncludePaths: PreIncludePath[] = [
    ];

    // We should also find all includes and preincludes we found with the static generator
    const parsed = createExpectedResultFromParsing();
    const compSpec = createExpectedResultFromCompilerSpecifics(platform);

    return {
        defines: defines.concat(parsed.defines),
        includes: includePaths.concat(parsed.includes).concat(compSpec.includes),
        preIncludes: preIncludePaths.concat(parsed.preIncludes).concat(compSpec.preIncludes),
    };
}

/**
 * This function compares multiple arrays to check if they ALL contain the
 * same elements. This does not mean the order of the elements are the same!
 * 
 * @param fnEqual A function that can check equality of each item
 * @param arrays The arrays to compare
 */
function arraysContainSameElements<T>(fnEqual: (item1: T, item2: T) => boolean, ...arrays: T[][]): boolean {
    let areEqual = true;

    // we use the first array as the master array, all others need to be the same as this one
    const masterArray: ReadonlyArray<T> = arrays[0];

    // go over all other arrays and check if they are equal
    arrays.slice(1).some((array): boolean => {
        if (masterArray.length !== array.length) {
            areEqual = false;
        } else {
            // We are going to remove items from the master array, so we need to take a copy to not modify the
            // passed array.
            let masterCopy = Array.from(masterArray);

            // find an item that is not found in the master array
            array.some((item): boolean => {
                let itemIndex: number | undefined = undefined;

                masterCopy.some((masterItem, index): boolean => {
                    if (fnEqual(item, masterItem)) {
                        itemIndex = index;
                    }

                    return itemIndex !== undefined;
                });

                // In case the item is found, remove it from the master. This way we fasten the function a bit
                // and we can also handle duplicates.
                if (itemIndex !== undefined) {
                    masterCopy.splice(itemIndex, 1);
                }

                // Stop  when an item is not found
                return itemIndex === undefined;
            });

            // If the master array is not empty, not all items from the array were found in the master
            if (masterCopy.length > 0) {
                areEqual = false;
            }
        }

        return areEqual === false;
    });

    return areEqual;
}
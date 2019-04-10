var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const debugUtils = require("./utils");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const extension_1 = require("../LanguageServer/extension");
const util = require("../common");
const fs = require("fs");
const Telemetry = require("../telemetry");
const extension_2 = require("./extension");
const configurations_1 = require("./configurations");
const jsonc_parser_1 = require("jsonc-parser");
const platform_1 = require("../platform");
function isDebugLaunchStr(str) {
    return str === "(gdb) Launch" || str === "(lldb) Launch" || str === "(Windows) Launch";
}
class QuickPickConfigurationProvider {
    constructor(provider) {
        this.underlyingProvider = provider;
    }
    provideDebugConfigurations(folder, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const configs = yield this.underlyingProvider.provideDebugConfigurations(folder, token);
            const defaultConfig = configs.find(config => { return isDebugLaunchStr(config.name); });
            console.assert(defaultConfig);
            const editor = vscode.window.activeTextEditor;
            if (!editor || !util.fileIsCOrCppSource(editor.document.fileName) || configs.length <= 1) {
                return [defaultConfig];
            }
            const items = configs.map(config => {
                let menuItem = { label: config.name, configuration: config };
                if (isDebugLaunchStr(menuItem.label)) {
                    menuItem.label = "Default Configuration";
                }
                return menuItem;
            });
            const selection = yield vscode.window.showQuickPick(items, { placeHolder: "Select a configuration" });
            if (!selection) {
                throw new Error();
            }
            if (selection.label.startsWith("cl.exe")) {
                if (!process.env.DevEnvDir || process.env.DevEnvDir.length === 0) {
                    vscode.window.showErrorMessage('cl.exe build and debug is only usable when VS Code is run from the Developer Command Prompt for VS.');
                    throw new Error();
                }
            }
            if (selection.label.indexOf(extension_2.buildAndDebugActiveFileStr()) !== -1 && selection.configuration.preLaunchTask) {
                try {
                    yield util.ensureBuildTaskExists(selection.configuration.preLaunchTask);
                    yield vscode.debug.startDebugging(folder, selection.configuration);
                    Telemetry.logDebuggerEvent("buildAndDebug", { "success": "true" });
                }
                catch (e) {
                    Telemetry.logDebuggerEvent("buildAndDebug", { "success": "false" });
                }
            }
            return [selection.configuration];
        });
    }
    resolveDebugConfiguration(folder, config, token) {
        return this.underlyingProvider.resolveDebugConfiguration(folder, config, token);
    }
}
exports.QuickPickConfigurationProvider = QuickPickConfigurationProvider;
class CppConfigurationProvider {
    constructor(provider, type) {
        this.provider = provider;
        this.type = type;
    }
    provideDebugConfigurations(folder, token) {
        return __awaiter(this, void 0, void 0, function* () {
            let buildTasks = yield extension_1.getBuildTasks(true);
            if (buildTasks.length === 0) {
                return Promise.resolve(this.provider.getInitialConfigurations(this.type));
            }
            const defaultConfig = this.provider.getInitialConfigurations(this.type).find(config => {
                return isDebugLaunchStr(config.name);
            });
            console.assert(defaultConfig, "Could not find default debug configuration.");
            const platformInfo = yield platform_1.PlatformInformation.GetPlatformInformation();
            const platform = platformInfo.platform;
            buildTasks = buildTasks.filter((task) => {
                if (defaultConfig.name === "(Windows) Launch") {
                    if (task.name.startsWith("cl.exe")) {
                        return true;
                    }
                }
                else {
                    if (!task.name.startsWith("cl.exe")) {
                        return true;
                    }
                }
                return false;
            });
            let configs = yield Promise.all(buildTasks.map((task) => __awaiter(this, void 0, void 0, function* () {
                const definition = task.definition;
                const compilerName = path.basename(definition.compilerPath);
                let newConfig = Object.assign({}, defaultConfig);
                newConfig.name = compilerName + extension_2.buildAndDebugActiveFileStr();
                newConfig.preLaunchTask = task.name;
                newConfig.externalConsole = false;
                const exeName = path.join("${fileDirname}", "${fileBasenameNoExtension}");
                newConfig.program = platform === "win32" ? exeName + ".exe" : exeName;
                return new Promise(resolve => {
                    if (platform === "darwin") {
                        return resolve(newConfig);
                    }
                    else {
                        let debuggerName;
                        if (compilerName.startsWith("clang")) {
                            newConfig.MIMode = "lldb";
                            const suffixIndex = compilerName.indexOf("-");
                            const suffix = suffixIndex === -1 ? "" : compilerName.substr(suffixIndex);
                            debuggerName = "lldb-mi" + suffix;
                        }
                        else if (compilerName === "cl.exe") {
                            newConfig.miDebuggerPath = undefined;
                            newConfig.type = "cppvsdbg";
                            return resolve(newConfig);
                        }
                        else {
                            debuggerName = "gdb";
                        }
                        if (platform === "win32") {
                            debuggerName += ".exe";
                        }
                        const compilerDirname = path.dirname(definition.compilerPath);
                        const debuggerPath = path.join(compilerDirname, debuggerName);
                        fs.stat(debuggerPath, (err, stats) => {
                            if (!err && stats && stats.isFile) {
                                newConfig.miDebuggerPath = debuggerPath;
                            }
                            else {
                                newConfig.miDebuggerPath = path.join("/usr", "bin", debuggerName);
                            }
                            return resolve(newConfig);
                        });
                    }
                });
            })));
            configs.push(defaultConfig);
            return configs;
        });
    }
    resolveDebugConfiguration(folder, config, token) {
        if (config) {
            if (config.type === 'cppvsdbg' && os.platform() !== 'win32') {
                vscode.window.showErrorMessage("Debugger of type: 'cppvsdbg' is only available on Windows. Use type: 'cppdbg' on the current OS platform.");
                return undefined;
            }
            if (os.platform() === 'win32' &&
                config.pipeTransport &&
                config.pipeTransport.pipeProgram) {
                let replacedPipeProgram = null;
                const pipeProgramStr = config.pipeTransport.pipeProgram.toLowerCase().trim();
                replacedPipeProgram = debugUtils.ArchitectureReplacer.checkAndReplaceWSLPipeProgram(pipeProgramStr, debugUtils.ArchType.ia32);
                if (!replacedPipeProgram && !path.isAbsolute(pipeProgramStr) && config.pipeTransport.pipeCwd) {
                    const pipeCwdStr = config.pipeTransport.pipeCwd.toLowerCase().trim();
                    const newPipeProgramStr = path.join(pipeCwdStr, pipeProgramStr);
                    replacedPipeProgram = debugUtils.ArchitectureReplacer.checkAndReplaceWSLPipeProgram(newPipeProgramStr, debugUtils.ArchType.ia32);
                }
                if (replacedPipeProgram) {
                    config.pipeTransport.pipeProgram = replacedPipeProgram;
                }
            }
        }
        return config && config.type ? config : null;
    }
}
class CppVsDbgConfigurationProvider extends CppConfigurationProvider {
    constructor(provider) {
        super(provider, configurations_1.DebuggerType.cppvsdbg);
    }
}
exports.CppVsDbgConfigurationProvider = CppVsDbgConfigurationProvider;
class CppDbgConfigurationProvider extends CppConfigurationProvider {
    constructor(provider) {
        super(provider, configurations_1.DebuggerType.cppdbg);
    }
}
exports.CppDbgConfigurationProvider = CppDbgConfigurationProvider;
class ConfigurationAssetProviderFactory {
    static getConfigurationProvider() {
        switch (os.platform()) {
            case 'win32':
                return new WindowsConfigurationProvider();
            case 'darwin':
                return new OSXConfigurationProvider();
            case 'linux':
                return new LinuxConfigurationProvider();
            default:
                throw new Error("Unexpected OS type");
        }
    }
}
exports.ConfigurationAssetProviderFactory = ConfigurationAssetProviderFactory;
class DefaultConfigurationProvider {
    getInitialConfigurations(debuggerType) {
        let configurationSnippet = [];
        this.configurations.forEach(configuration => {
            configurationSnippet.push(configuration.GetLaunchConfiguration());
        });
        let initialConfigurations = configurationSnippet.filter(snippet => snippet.debuggerType === debuggerType && snippet.isInitialConfiguration)
            .map(snippet => JSON.parse(snippet.bodyText));
        return initialConfigurations;
    }
    getConfigurationSnippets() {
        let completionItems = [];
        this.configurations.forEach(configuration => {
            completionItems.push(convertConfigurationSnippetToCompetionItem(configuration.GetLaunchConfiguration()));
            completionItems.push(convertConfigurationSnippetToCompetionItem(configuration.GetAttachConfiguration()));
        });
        return completionItems;
    }
}
class WindowsConfigurationProvider extends DefaultConfigurationProvider {
    constructor() {
        super();
        this.executable = "a.exe";
        this.pipeProgram = "<full path to pipe program such as plink.exe>";
        this.MIMode = 'gdb';
        this.setupCommandsBlock = `"setupCommands": [
    {
        "description": "Enable pretty-printing for gdb",
        "text": "-enable-pretty-printing",
        "ignoreFailures": true
    }
]`;
        this.configurations = [
            new configurations_1.MIConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock),
            new configurations_1.PipeTransportConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock),
            new configurations_1.WindowsConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock),
            new configurations_1.WSLConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock),
        ];
    }
}
class OSXConfigurationProvider extends DefaultConfigurationProvider {
    constructor() {
        super();
        this.MIMode = 'lldb';
        this.executable = "a.out";
        this.pipeProgram = "/usr/bin/ssh";
        this.configurations = [
            new configurations_1.MIConfigurations(this.MIMode, this.executable, this.pipeProgram),
        ];
    }
}
class LinuxConfigurationProvider extends DefaultConfigurationProvider {
    constructor() {
        super();
        this.MIMode = 'gdb';
        this.setupCommandsBlock = `"setupCommands": [
    {
        "description": "Enable pretty-printing for gdb",
        "text": "-enable-pretty-printing",
        "ignoreFailures": true
    }
]`;
        this.executable = "a.out";
        this.pipeProgram = "/usr/bin/ssh";
        this.configurations = [
            new configurations_1.MIConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock),
            new configurations_1.PipeTransportConfigurations(this.MIMode, this.executable, this.pipeProgram, this.setupCommandsBlock)
        ];
    }
}
function convertConfigurationSnippetToCompetionItem(snippet) {
    let item = new vscode.CompletionItem(snippet.label, vscode.CompletionItemKind.Snippet);
    item.insertText = snippet.bodyText;
    return item;
}
class ConfigurationSnippetProvider {
    constructor(provider) {
        this.provider = provider;
        this.snippets = this.provider.getConfigurationSnippets();
    }
    resolveCompletionItem(item, token) {
        return Promise.resolve(item);
    }
    provideCompletionItems(document, position, token, context) {
        let items = this.snippets;
        const launch = jsonc_parser_1.parse(document.getText());
        if (launch.configurations.length !== 0) {
            items = [];
            this.snippets.forEach((item) => items.push(Object.assign({}, item)));
            items.map((item) => {
                item.insertText = item.insertText + ',';
            });
        }
        return Promise.resolve(new vscode.CompletionList(items, true));
    }
}
exports.ConfigurationSnippetProvider = ConfigurationSnippetProvider;
//# sourceMappingURL=configurationProvider.js.map
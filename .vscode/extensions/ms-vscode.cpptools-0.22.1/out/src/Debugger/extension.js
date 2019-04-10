var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const os = require("os");
const attachToProcess_1 = require("./attachToProcess");
const nativeAttach_1 = require("./nativeAttach");
const configurationProvider_1 = require("./configurationProvider");
const debugAdapterDescriptorFactory_1 = require("./debugAdapterDescriptorFactory");
const util = require("../common");
const Telemetry = require("../telemetry");
let disposables = [];
function buildAndDebugActiveFileStr() {
    return " build and debug active file";
}
exports.buildAndDebugActiveFileStr = buildAndDebugActiveFileStr;
function initialize(context) {
    let attachItemsProvider = nativeAttach_1.NativeAttachItemsProviderFactory.Get();
    let attacher = new attachToProcess_1.AttachPicker(attachItemsProvider);
    disposables.push(vscode.commands.registerCommand('extension.pickNativeProcess', () => attacher.ShowAttachEntries()));
    let remoteAttacher = new attachToProcess_1.RemoteAttachPicker();
    disposables.push(vscode.commands.registerCommand('extension.pickRemoteNativeProcess', (any) => remoteAttacher.ShowAttachEntries(any)));
    let configurationProvider = configurationProvider_1.ConfigurationAssetProviderFactory.getConfigurationProvider();
    let vsdbgProvider = null;
    if (os.platform() === 'win32') {
        vsdbgProvider = new configurationProvider_1.CppVsDbgConfigurationProvider(configurationProvider);
        disposables.push(vscode.debug.registerDebugConfigurationProvider('cppvsdbg', new configurationProvider_1.QuickPickConfigurationProvider(vsdbgProvider)));
    }
    const provider = new configurationProvider_1.CppDbgConfigurationProvider(configurationProvider);
    disposables.push(vscode.debug.registerDebugConfigurationProvider('cppdbg', new configurationProvider_1.QuickPickConfigurationProvider(provider)));
    disposables.push(vscode.commands.registerTextEditorCommand("C_Cpp.BuildAndDebugActiveFile", (textEditor, edit, ...args) => __awaiter(this, void 0, void 0, function* () {
        const folder = vscode.workspace.getWorkspaceFolder(textEditor.document.uri);
        if (!folder) {
            vscode.window.showErrorMessage('This command is not yet available for single-file mode.');
            return Promise.resolve();
        }
        if (!util.fileIsCOrCppSource(textEditor.document.uri.fsPath)) {
            vscode.window.showErrorMessage('Cannot build and debug because the active file is not a C or C++ source file.');
            return Promise.resolve();
        }
        let configs = (yield provider.provideDebugConfigurations(folder)).filter(config => {
            return config.name.indexOf(buildAndDebugActiveFileStr()) !== -1;
        });
        if (vsdbgProvider) {
            let vsdbgConfigs = (yield vsdbgProvider.provideDebugConfigurations(folder)).filter(config => {
                return config.name.indexOf(buildAndDebugActiveFileStr()) !== -1;
            });
            if (vsdbgConfigs) {
                configs.push(...vsdbgConfigs);
            }
        }
        const items = configs.map(config => {
            return { label: config.name, configuration: config };
        });
        vscode.window.showQuickPick(items, { placeHolder: (items.length === 0 ? "No compiler found" : "Select a compiler") }).then((selection) => __awaiter(this, void 0, void 0, function* () {
            if (!selection) {
                return;
            }
            if (selection.label.startsWith("cl.exe")) {
                if (!process.env.DevEnvDir || process.env.DevEnvDir.length === 0) {
                    vscode.window.showErrorMessage('cl.exe build and debug is only usable when VS Code is run from the Developer Command Prompt for VS.');
                    return;
                }
            }
            if (selection.configuration.preLaunchTask) {
                if (folder) {
                    try {
                        yield util.ensureBuildTaskExists(selection.configuration.preLaunchTask);
                        Telemetry.logDebuggerEvent("buildAndDebug", { "success": "false" });
                    }
                    catch (e) {
                        if (e && e.message === util.failedToParseTasksJson) {
                            vscode.window.showErrorMessage(util.failedToParseTasksJson);
                        }
                        return Promise.resolve();
                    }
                }
                else {
                    return Promise.resolve();
                }
            }
            try {
                yield vscode.debug.startDebugging(folder, selection.configuration.name);
                Telemetry.logDebuggerEvent("buildAndDebug", { "success": "true" });
            }
            catch (e) {
                try {
                    vscode.debug.startDebugging(folder, selection.configuration);
                }
                catch (e) {
                    Telemetry.logDebuggerEvent("buildAndDebug", { "success": "false" });
                }
            }
        }));
    })));
    configurationProvider.getConfigurationSnippets();
    const launchJsonDocumentSelector = [{
            scheme: 'file',
            language: 'jsonc',
            pattern: '**/launch.json'
        }];
    disposables.push(vscode.languages.registerCompletionItemProvider(launchJsonDocumentSelector, new configurationProvider_1.ConfigurationSnippetProvider(configurationProvider)));
    disposables.push(vscode.debug.registerDebugAdapterDescriptorFactory(debugAdapterDescriptorFactory_1.CppvsdbgDebugAdapterDescriptorFactory.DEBUG_TYPE, new debugAdapterDescriptorFactory_1.CppvsdbgDebugAdapterDescriptorFactory(context)));
    disposables.push(vscode.debug.registerDebugAdapterDescriptorFactory(debugAdapterDescriptorFactory_1.CppdbgDebugAdapterDescriptorFactory.DEBUG_TYPE, new debugAdapterDescriptorFactory_1.CppdbgDebugAdapterDescriptorFactory(context)));
    vscode.Disposable.from(...disposables);
}
exports.initialize = initialize;
function dispose() {
    disposables.forEach(d => d.dispose());
}
exports.dispose = dispose;
//# sourceMappingURL=extension.js.map
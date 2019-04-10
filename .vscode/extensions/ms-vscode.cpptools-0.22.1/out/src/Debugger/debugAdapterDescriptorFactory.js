Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const util = require("../common");
const path = require("path");
const os = require("os");
class AbstractDebugAdapterDescriptorFactory {
    constructor(context) {
        this.context = context;
    }
}
class CppdbgDebugAdapterDescriptorFactory extends AbstractDebugAdapterDescriptorFactory {
    constructor(context) {
        super(context);
    }
    createDebugAdapterDescriptor(session, executable) {
        return util.isExtensionReady().then(ready => {
            if (ready) {
                let command = path.join(this.context.extensionPath, './debugAdapters/OpenDebugAD7');
                if (os.platform() === 'win32') {
                    command = path.join(this.context.extensionPath, "./debugAdapters/bin/OpenDebugAD7.exe");
                }
                return new vscode.DebugAdapterExecutable(command, []);
            }
            else {
                throw new Error(util.extensionNotReadyString);
            }
        });
    }
}
CppdbgDebugAdapterDescriptorFactory.DEBUG_TYPE = "cppdbg";
exports.CppdbgDebugAdapterDescriptorFactory = CppdbgDebugAdapterDescriptorFactory;
class CppvsdbgDebugAdapterDescriptorFactory extends AbstractDebugAdapterDescriptorFactory {
    constructor(context) {
        super(context);
    }
    createDebugAdapterDescriptor(session, executable) {
        if (os.platform() !== 'win32') {
            vscode.window.showErrorMessage("Debugger type 'cppvsdbg' is not avaliable for non-Windows machines.");
            return null;
        }
        else {
            return util.isExtensionReady().then(ready => {
                if (ready) {
                    return new vscode.DebugAdapterExecutable(path.join(this.context.extensionPath, './debugAdapters/vsdbg/bin/vsdbg.exe'), ['--interpreter=vscode']);
                }
                else {
                    throw new Error(util.extensionNotReadyString);
                }
            });
        }
    }
}
CppvsdbgDebugAdapterDescriptorFactory.DEBUG_TYPE = "cppvsdbg";
exports.CppvsdbgDebugAdapterDescriptorFactory = CppvsdbgDebugAdapterDescriptorFactory;
//# sourceMappingURL=debugAdapterDescriptorFactory.js.map
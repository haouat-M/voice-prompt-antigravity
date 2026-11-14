const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let statusBarItem;
let recordingProcess = null;
let isRecording = false;
let lastTranscribedText = "";

function activate(context) {
    // 1. Create minimal status bar icon (Microphone only, no text)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    statusBarItem.command = 'antigravityVoice.toggleRecording';
    setIdleStatus();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 2. Register Toggle Command
    const toggleCmd = vscode.commands.registerCommand('antigravityVoice.toggleRecording', async () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording(context);
        }
    });
    context.subscriptions.push(toggleCmd);

    // 3. Register Copy Last Text Command
    const copyCmd = vscode.commands.registerCommand('antigravityVoice.copyLastText', async () => {
        if (lastTranscribedText) {
            await vscode.env.clipboard.writeText(lastTranscribedText);
            vscode.window.showInformationMessage(`Copied: "${lastTranscribedText}"`);
        } else {
            vscode.window.showInformationMessage("No previous transcript available.");
        }
    });
    context.subscriptions.push(copyCmd);

    // 4. Register Select Language Command
    const langCmd = vscode.commands.registerCommand('antigravityVoice.selectLanguage', async () => {
        const languages = [
            { label: '🇸🇦 العربية (Arabic - Default)', code: 'ar-SA' },
            { label: '🇪🇬 العربية (Arabic - Egypt)', code: 'ar-EG' },
            { label: '🇲🇦 العربية (Arabic - Maghreb)', code: 'ar-MA' },
            { label: '🇺🇸 English (United States)', code: 'en-US' },
            { label: '🇬🇧 English (United Kingdom)', code: 'en-GB' },
            { label: '🇫🇷 Français (French)', code: 'fr-FR' },
            { label: '🇩🇪 Deutsch (German)', code: 'de-DE' },
            { label: '🇪🇸 Español (Spanish)', code: 'es-ES' },
            { label: '🇹🇷 Türkçe (Turkish)', code: 'tr-TR' }
        ];

        const picked = await vscode.window.showQuickPick(languages, {
            placeHolder: 'Select your preferred voice input language (saved permanently)'
        });

        if (picked) {
            await vscode.workspace.getConfiguration('antigravityVoice').update('language', picked.code, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Voice language set to: ${picked.label}`);
            setIdleStatus();
        }
    });
    context.subscriptions.push(langCmd);
}

function setIdleStatus() {
    isRecording = false;
    const config = vscode.workspace.getConfiguration('antigravityVoice');
    const lang = config.get('language') || 'ar-SA';
    // Clean minimal icon only
    statusBarItem.text = `$(mic)`;
    statusBarItem.tooltip = `Voice Prompt for Antigravity (Language: ${lang})\n• Click or press Ctrl+Alt+A to speak\n• Speaks naturally with automatic technical term fixes`;
    statusBarItem.backgroundColor = undefined;
}

function setRecordingStatus() {
    isRecording = true;
    // Sleek red icon only - no long disruptive text
    statusBarItem.text = `$(record)`;
    statusBarItem.tooltip = `Listening... Click or press Ctrl+Alt+A when done speaking`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
}

function setProcessingStatus() {
    // Sleek spinning icon only
    statusBarItem.text = `$(sync~spin)`;
    statusBarItem.tooltip = `Transcribing and auto-converting tech terms...`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
}

function resolvePythonPath(configuredPath) {
    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }
    const sysPython = 'C:\\Python314\\python.exe';
    if (fs.existsSync(sysPython)) {
        return sysPython;
    }
    const venvPython = 'C:\\Users\\alladdinexpress\\.antigravity-mic\\venv\\Scripts\\python.exe';
    if (fs.existsSync(venvPython)) {
        return venvPython;
    }
    return 'python';
}

async function startRecording(context) {
    if (isRecording) return;

    const config = vscode.workspace.getConfiguration('antigravityVoice');
    const pythonPath = resolvePythonPath(config.get('pythonPath'));
    const language = config.get('language') || 'ar-SA';
    const silenceSeconds = config.get('silenceSeconds') || 2.2;
    const customFixes = config.get('customFixes') || [];

    const scriptPath = path.join(context.extensionPath, 'scripts', 'engine.py');

    const args = [
        scriptPath,
        '--action', 'record',
        '--language', language,
        '--silence', silenceSeconds.toString(),
        '--timeout', '90'
    ];

    if (customFixes && customFixes.length > 0) {
        args.push('--custom-fixes-json', JSON.stringify(customFixes));
    }

    setRecordingStatus();

    try {
        const env = Object.assign({}, process.env, {
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
        });

        recordingProcess = spawn(pythonPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env
        });
        recordingProcess.stdout.setEncoding('utf-8');
        recordingProcess.stderr.setEncoding('utf-8');
    } catch (err) {
        setIdleStatus();
        vscode.window.showErrorMessage(`Failed to start Python (${pythonPath}): ${err.message}`);
        return;
    }

    let stdoutBuffer = "";
    let stderrBuffer = "";

    recordingProcess.stdout.on('data', (str) => {
        stdoutBuffer += str;

        if (str.includes('__STATUS_RECORDING__')) {
            setRecordingStatus();
        }
        if (str.includes('__STATUS_PROCESSING__')) {
            setProcessingStatus();
        }
    });

    recordingProcess.stderr.on('data', (str) => {
        stderrBuffer += str;
    });

    recordingProcess.on('close', async (code) => {
        recordingProcess = null;

        const startTag = '__JSON_START__';
        const endTag = '__JSON_END__';
        const startIdx = stdoutBuffer.indexOf(startTag);
        const endIdx = stdoutBuffer.indexOf(endTag);

        setIdleStatus();

        if (startIdx !== -1 && endIdx !== -1) {
            const jsonStr = stdoutBuffer.substring(startIdx + startTag.length, endIdx).trim();
            try {
                const res = JSON.parse(jsonStr);
                if (res.success && res.text) {
                    await handleTranscribedText(res.text, config);
                } else if (res.code === 'NO_SPEECH') {
                    vscode.window.setStatusBarMessage("ℹ️ No speech detected", 3000);
                } else {
                    vscode.window.showWarningMessage(`Voice Input: ${res.error || 'Unknown error'}`);
                }
            } catch (e) {
                vscode.window.showErrorMessage(`Error processing engine response: ${e.message}`);
            }
        } else {
            if (stderrBuffer && stderrBuffer.trim().length > 0 && !stderrBuffer.includes('UserWarning')) {
                console.error("Voice Prompt stderr:", stderrBuffer);
            }
        }
    });

    recordingProcess.on('error', (err) => {
        recordingProcess = null;
        setIdleStatus();
        vscode.window.showErrorMessage(`Audio recording process error: ${err.message}`);
    });
}

function stopRecording() {
    if (recordingProcess) {
        setProcessingStatus();
        try {
            recordingProcess.stdin.write("stop\n");
        } catch (e) {}
    }
}

async function handleTranscribedText(text, config) {
    lastTranscribedText = text;
    const target = config.get('target') || 'antigravity';
    const autoSend = config.get('autoSend') || false;

    // Always copy to clipboard as safe backup
    await vscode.env.clipboard.writeText(text);

    if (target === 'antigravity') {
        let injected = false;

        // 1. Focus Antigravity Panel
        try {
            await vscode.commands.executeCommand("antigravity.panel.focus");
        } catch (e) {
            try {
                await vscode.commands.executeCommand("antigravity.toggleChatFocus", "focus");
            } catch (e2) {}
        }

        await new Promise(r => setTimeout(r, 80));

        // 2. Add text directly to Antigravity Prompt Editor
        try {
            await vscode.commands.executeCommand("antigravity.addContext", text);
            injected = true;
        } catch (e) {
            try {
                await vscode.commands.executeCommand("antigravity.addContext", [text]);
                injected = true;
            } catch (e2) {
                try {
                    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
                    injected = true;
                } catch (e3) {}
            }
        }

        // 3. Auto send if enabled
        if (autoSend && injected) {
            await new Promise(r => setTimeout(r, 100));
            try {
                await vscode.commands.executeCommand("antigravity.triggerSend");
            } catch (e) {}
        }

        vscode.window.setStatusBarMessage(`✅ ${text}`, 4000);
    } else if (target === 'activeEditor') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, text + ' ');
            });
            vscode.window.setStatusBarMessage(`✅ Inserted: "${text}"`, 4000);
        } else {
            vscode.window.setStatusBarMessage(`✅ Copied: "${text}"`, 4000);
        }
    } else {
        vscode.window.setStatusBarMessage(`✅ Copied: "${text}"`, 4000);
    }
}

function deactivate() {
    if (recordingProcess) {
        try {
            recordingProcess.kill();
        } catch (e) {}
    }
}

module.exports = {
    activate,
    deactivate
};

const vscode = require('vscode');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let statusBarItem;
let recordingProcess = null;
let isRecording = false;
let isInstallingDeps = false;
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
        if (isInstallingDeps) {
            vscode.window.showInformationMessage("Voice Prompt: Installing required dependencies in the background, please wait a moment...");
            return;
        }

        if (isRecording) {
            stopRecording();
        } else {
            // Check and ensure dependencies exist before recording
            const ready = await ensureDependencies(context);
            if (ready) {
                startRecording(context);
            }
        }
    });
    context.subscriptions.push(toggleCmd);

    // 3. Register Install Dependencies Command (Can also be triggered manually)
    const installCmd = vscode.commands.registerCommand('antigravityVoice.installDependencies', async () => {
        await installRequiredPackages();
    });
    context.subscriptions.push(installCmd);

    // 4. Register Copy Last Text Command
    const copyCmd = vscode.commands.registerCommand('antigravityVoice.copyLastText', async () => {
        if (lastTranscribedText) {
            await vscode.env.clipboard.writeText(lastTranscribedText);
            vscode.window.showInformationMessage(`Copied: "${lastTranscribedText}"`);
        } else {
            vscode.window.showInformationMessage("No previous transcript available.");
        }
    });
    context.subscriptions.push(copyCmd);

    // 5. Register Select Language Command
    const langCmd = vscode.commands.registerCommand('antigravityVoice.selectLanguage', async () => {
        const languages = [
            { label: '🇸🇦 العربية (Arabic - Saudi Arabia / Default)', code: 'ar-SA' },
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
    statusBarItem.text = `$(mic)`;
    statusBarItem.tooltip = `Voice Prompt for Antigravity (Language: ${lang})\n• Click or press Ctrl+Alt+A to speak\n• Speaks naturally with automatic technical term fixes`;
    statusBarItem.backgroundColor = undefined;
}

function setRecordingStatus() {
    isRecording = true;
    statusBarItem.text = `$(record)`;
    statusBarItem.tooltip = `Listening... Click or press Ctrl+Alt+A when done speaking`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
}

function setProcessingStatus() {
    statusBarItem.text = `$(sync~spin)`;
    statusBarItem.tooltip = `Transcribing and auto-converting tech terms...`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
}

function setInstallingStatus() {
    statusBarItem.text = `$(cloud-download~spin)`;
    statusBarItem.tooltip = `Installing required audio packages (SpeechRecognition, sounddevice, numpy)...`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
}

function resolvePythonPath(configuredPath) {
    if (configuredPath && configuredPath.trim() !== '') {
        return configuredPath.trim();
    }
    const candidates = [
        'C:\\Python314\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe'
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return c;
        }
    }
    return 'python';
}

async function ensureDependencies(context) {
    const config = vscode.workspace.getConfiguration('antigravityVoice');
    const pythonPath = resolvePythonPath(config.get('pythonPath'));

    return new Promise((resolve) => {
        const checkCmd = `"${pythonPath}" -c "import speech_recognition, sounddevice, numpy; print('READY')"`;
        exec(checkCmd, { env: process.env }, async (err, stdout) => {
            if (!err && stdout && stdout.includes('READY')) {
                resolve(true);
            } else {
                const installed = await installRequiredPackages(pythonPath);
                resolve(installed);
            }
        });
    });
}

async function installRequiredPackages(pyPath) {
    if (isInstallingDeps) return false;
    isInstallingDeps = true;
    setInstallingStatus();

    const config = vscode.workspace.getConfiguration('antigravityVoice');
    const pythonPath = pyPath || resolvePythonPath(config.get('pythonPath'));

    vscode.window.setStatusBarMessage("🎙️ Setting up Voice dependencies (SpeechRecognition, sounddevice, numpy)...", 6000);

    return new Promise((resolve) => {
        const installCmd = `"${pythonPath}" -m pip install --quiet SpeechRecognition sounddevice numpy`;

        exec(installCmd, { env: process.env }, (err, stdout, stderr) => {
            isInstallingDeps = false;
            setIdleStatus();

            if (!err) {
                vscode.window.showInformationMessage("✅ Voice Prompt dependencies successfully installed! You can now speak anytime.");
                resolve(true);
            } else {
                vscode.window.showErrorMessage(
                    `Failed to auto-install dependencies: ${stderr || err.message}. Please run: pip install SpeechRecognition sounddevice numpy in terminal.`,
                    "Copy Pip Command"
                ).then(selection => {
                    if (selection === "Copy Pip Command") {
                        vscode.env.clipboard.writeText("pip install SpeechRecognition sounddevice numpy");
                    }
                });
                resolve(false);
            }
        });
    });
}

async function startRecording(context) {
    if (isRecording) return;

    const config = vscode.workspace.getConfiguration('antigravityVoice');
    const pythonPath = resolvePythonPath(config.get('pythonPath'));
    const language = config.get('language') || 'ar-SA';
    // Increased default silence tolerance to 3.2s to support relaxed natural speech without cutting off
    const silenceSeconds = config.get('silenceSeconds') || 3.2;
    // Increased timeout to 180s (3 minutes) to support long dictations
    const timeout = config.get('timeout') || 180;
    const customFixes = config.get('customFixes') || [];

    const scriptPath = path.join(context.extensionPath, 'scripts', 'engine.py');

    const args = [
        scriptPath,
        '--action', 'record',
        '--language', language,
        '--silence', silenceSeconds.toString(),
        '--timeout', timeout.toString()
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

    // Smart spacing check: ensure leading space so it doesn't glue to existing text
    // E.g. "existing" + " new voice" => "existing new voice"
    const textToInsert = text.trim();
    const spacedText = " " + textToInsert;

    // Always copy clean text to clipboard as safe backup
    await vscode.env.clipboard.writeText(textToInsert);

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

        // 2. Add text directly to Antigravity Prompt Editor with smart prepended space
        try {
            await vscode.commands.executeCommand("antigravity.addContext", spacedText);
            injected = true;
        } catch (e) {
            try {
                await vscode.commands.executeCommand("antigravity.addContext", [spacedText]);
                injected = true;
            } catch (e2) {
                // Clipboard fallback: put spaced text in clipboard, paste, then restore clean clipboard
                try {
                    await vscode.env.clipboard.writeText(spacedText);
                    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
                    injected = true;
                    // Restore clipboard to clean text
                    await vscode.env.clipboard.writeText(textToInsert);
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

        vscode.window.setStatusBarMessage(`✅ ${textToInsert}`, 4000);
    } else if (target === 'activeEditor') {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const pos = editor.selection.active;
            const doc = editor.document;
            let prefix = "";
            if (pos.character > 0) {
                const charBefore = doc.getText(new vscode.Range(pos.translate(0, -1), pos));
                if (!/\s/.test(charBefore)) {
                    prefix = " ";
                }
            }
            await editor.edit(editBuilder => {
                editBuilder.insert(pos, prefix + textToInsert + " ");
            });
            vscode.window.setStatusBarMessage(`✅ Inserted: "${textToInsert}"`, 4000);
        } else {
            vscode.window.setStatusBarMessage(`✅ Copied: "${textToInsert}"`, 4000);
        }
    } else {
        vscode.window.setStatusBarMessage(`✅ Copied: "${textToInsert}"`, 4000);
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

import sys
import os
import re
import io
import time
import json
import wave
import argparse
import threading

# Force UTF-8 encoding on Windows to prevent charmap codec errors
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        except Exception:
            pass

# Helper to build prefix-aware Arabic regex rules (handles و، فـ، بـ، لـ، كـ، الـ)
def make_term_rule(words_regex, english_term):
    pattern = re.compile(r'(?:^|\b)([وفلك]?(?:ب)?)?(?:ال)?(?:' + words_regex + r')\b', re.IGNORECASE)
    def repl(m):
        prefix = m.group(1) or ''
        return (prefix + ' ' if prefix else '') + english_term
    return pattern, repl

RAW_TERMS = [
    # Core Tools & Agents
    (r"انتي جرافيتي|أنتي غرافيتي|انتي غرافيتي|انتيجرافيتي|أنتيجرافيتي|انتي جرفيتي", "Antigravity"),
    (r"اوبن كود|أوبن كود", "Open Code"),
    (r"اي بي اي|إي بي آي|اي بي آي|اب اي", "API"),
    (r"ام سي بي|إم سي بي", "MCP"),
    (r"برومت|برومبت", "Prompt"),
    (r"توكن|توكنز", "Token"),
    
    # Containers & Environments
    (r"جوكر|الجوكر|دوكر|الدوكر|دوكار|داكر|دكر", "Docker"),
    (r"دوكر كومبوز|دوكر كمبوز", "Docker Compose"),
    (r"لاراجون|لاراجن|لارغون|لاراجان|لارجون|لاراغون|الاراجوز|الأراجوز", "Laragon"),
    (r"كوبيرنيتس|كوبرنيتس|كوبرنيتيز", "Kubernetes"),
    
    # Version Control
    (r"جيت هاب|غيتهاب|جتهاب|جيت هب", "GitHub"),
    (r"جيت لاب|غيتلاب", "GitLab"),
    (r"جيت|غت", "Git"),
    (r"كوميت|كوميتات|كمت", "commit"),
    (r"بوش|بوشينج", "push"),
    (r"بول ريكويست|بول ريكوست|بي ار", "Pull Request"),
    (r"برانش|برانشات", "branch"),
    (r"ميرج|ميرجنج", "merge"),
    
    # Web Frameworks & Libraries
    (r"فيو جي اس|فيو جي إس|فيو جيس|فيوجي اس|فيوز", "Vue.js"),
    (r"رياكت جي اس|رياكت جي إس|رياكت", "React"),
    (r"انجلر|أنجولار|انغولار", "Angular"),
    (r"نكست جي اس|نكست جي إس|نكست", "Next.js"),
    (r"تايلوند|تيلويند", "Tailwind CSS"),
    (r"بوتستراب|بوت سكراب", "Bootstrap"),
    
    # Runtimes & Languages
    (r"بايثون|بيثون", "Python"),
    (r"بي اتش بي|بي إتش بي", "PHP"),
    (r"نود جي اس|نود جي إس|نود", "Node.js"),
    (r"جافا سكريبت|جافاسكريبت", "JavaScript"),
    (r"تايب سكريبت|تايبسكريبت", "TypeScript"),
    
    # Databases
    (r"ماي اس كيو ال|ماي اسكيو ال|مايسكوال", "MySQL"),
    (r"بوستجريس|بوستجرس|بوستغري", "PostgreSQL"),
    (r"مونجو دي بي|مونغو دي بي|مونجو", "MongoDB"),
    (r"ريديس|ريدس", "Redis"),
    (r"اس كيو لايت|سيكوال لايت", "SQLite"),
    
    # Development Concepts
    (r"تيرمينال|ترمينال", "terminal"),
    (r"ديباج|ديباجينج|ديبوق", "debug"),
    (r"فرونت اند|فرونت إند", "frontend"),
    (r"باك اند|باك إند", "backend"),
    (r"فول ستاك|فل ستاك", "fullstack"),
    (r"داتا بيز|داتابيز", "database"),
    (r"سيرفر|سيرفرات", "server"),
    (r"كاش|كاشينج", "cache"),
    (r"اوتوميشن|أوتوميشن", "automation"),
    (r"ورك فلو|ويرك فلو", "workflow"),
    (r"في اس كود|فياسكود", "VS Code")
]

COMPILED_RULES = [make_term_rule(pattern, eng) for pattern, eng in RAW_TERMS]

def apply_fixes(text, custom_fixes=None):
    if not text:
        return text

    res = text
    for pattern, repl in COMPILED_RULES:
        res = pattern.sub(repl, res)

    if custom_fixes and isinstance(custom_fixes, list):
        for item in custom_fixes:
            try:
                ar = item.get("ar", "")
                en = item.get("en", "")
                if ar and en:
                    pat, rep = make_term_rule(re.escape(ar), en)
                    res = pat.sub(rep, res)
            except Exception:
                pass

    res = re.sub(r'\s+', ' ', res).strip()
    return res

def record_and_transcribe(language="ar-SA", timeout=180, silence_seconds=3.2, custom_fixes=None):
    import sounddevice as sd
    import speech_recognition as sr

    sample_rate = 16000
    channels = 1
    block_size = 1024

    # Tuned for natural long dictation:
    # 0.009 threshold prevents cutting off soft/distant voice or mid-sentence pauses
    silence_threshold = 0.009
    chunk_duration = block_size / sample_rate
    max_silent_chunks = int(silence_seconds / chunk_duration)
    min_speech_chunks = int(0.5 / chunk_duration)

    recorded_chunks = []
    speech_detected = False
    silent_chunks_count = 0
    stop_event = threading.Event()

    def listen_stdin():
        try:
            for line in sys.stdin:
                line_str = line.strip().lower()
                if line_str in ("stop", "exit", "quit"):
                    stop_event.set()
                    break
        except Exception:
            pass

    t_in = threading.Thread(target=listen_stdin, daemon=True)
    t_in.start()

    print("__STATUS_RECORDING__", flush=True)

    start_time = time.time()

    try:
        with sd.InputStream(samplerate=sample_rate, channels=channels, blocksize=block_size, dtype='float32') as stream:
            while not stop_event.is_set():
                if time.time() - start_time > timeout:
                    break

                data, _ = stream.read(block_size)
                rms = float(np.linalg.norm(data) / np.sqrt(len(data)))

                recorded_chunks.append(data.copy())

                if rms > silence_threshold:
                    speech_detected = True
                    silent_chunks_count = 0
                else:
                    if speech_detected:
                        silent_chunks_count += 1
                        if silent_chunks_count >= max_silent_chunks:
                            if len(recorded_chunks) >= min_speech_chunks:
                                break
    except Exception as e:
        res = {"success": False, "error": f"Audio recording error: {str(e)}"}
        print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)
        return

    if not recorded_chunks:
        res = {"success": False, "error": "لم يتم التقاط صوت"}
        print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)
        return

    print("__STATUS_PROCESSING__", flush=True)

    audio_full = np.concatenate(recorded_chunks, axis=0)
    duration = round(len(audio_full) / sample_rate, 2)

    int16_data = (np.clip(audio_full, -1.0, 1.0) * 32767).astype(np.int16)
    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16_data.tobytes())
    wav_io.seek(0)

    recognizer = sr.Recognizer()
    lang_code = "ar-SA" if (not language or language.lower() in ("auto", "none")) else language

    try:
        with sr.AudioFile(wav_io) as source:
            audio_record = recognizer.record(source)
            raw_text = recognizer.recognize_google(audio_record, language=lang_code)
            cleaned_text = apply_fixes(raw_text, custom_fixes)
            res = {
                "success": True,
                "text": cleaned_text,
                "raw_text": raw_text,
                "duration": duration,
                "language": lang_code
            }
            print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)
    except sr.UnknownValueError:
        res = {"success": False, "error": "لم يتم التقاط صوت واضح", "code": "NO_SPEECH"}
        print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)
    except sr.RequestError as e:
        res = {"success": False, "error": f"خطأ في الاتصال بالخدمة: {str(e)}", "code": "NETWORK_ERROR"}
        print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)
    except Exception as e:
        res = {"success": False, "error": str(e), "code": "UNKNOWN_ERROR"}
        print(f"__JSON_START__{json.dumps(res, ensure_ascii=False)}__JSON_END__", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fast Arabic Voice Transcriber")
    parser.add_argument("--action", choices=["record", "test"], default="record")
    parser.add_argument("--language", type=str, default="ar-SA")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--silence", type=float, default=3.2)
    parser.add_argument("--custom-fixes-json", type=str, default="")

    args = parser.parse_args()

    custom_fixes = None
    if args.custom_fixes_json:
        try:
            custom_fixes = json.loads(args.custom_fixes_json)
        except Exception:
            pass

    if args.action == "record":
        record_and_transcribe(
            language=args.language,
            timeout=args.timeout,
            silence_seconds=args.silence,
            custom_fixes=custom_fixes
        )
    elif args.action == "test":
        print("Engine Test OK")

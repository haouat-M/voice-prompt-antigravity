import sys
import os
import re
import io
import time
import json
import wave
import argparse
import threading
import numpy as np

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
    (r"نوكست جي اس|نوكست", "Nuxt.js"),
    (r"نوفيل|لارافيل|لارافل|لاريفيل", "Laravel"),
    (r"تيلويند|تيلوند|تلويند|تلويند سي اس اس", "Tailwind CSS"),
    (r"بوتستراب|بوت ستراب", "Bootstrap"),
    (r"جانجو|ديجانجو|دي جانجو", "Django"),
    (r"فلاسك", "Flask"),
    (r"فاست اي بي اي|فاست اب اي", "FastAPI"),
    (r"اكسبريس|إكسبريس", "Express.js"),
    (r"نست جي اس|نست", "NestJS"),
    
    # Programming Languages
    (r"بايثون|بيثون|بايثن", "Python"),
    (r"جافا سكريبت|جافاسكريبت", "JavaScript"),
    (r"تايب سكريبت|تايبسكريبت", "TypeScript"),
    (r"نود جي اس|نود جي إس|نود", "Node.js"),
    (r"بي اتش بي|بي إتش بي", "PHP"),
    (r"اتش تي ام ال|إتش تي إم إل|اتش تي ام ال فايف", "HTML"),
    (r"سي اس اس|سي إس إس|سي اس اس ثري", "CSS"),
    (r"سي بلس بلس", "C++"),
    (r"سي شارب", "C#"),
    (r"جافا", "Java"),
    (r"راست|رست", "Rust"),
    (r"جو لانج|جولانج", "Go"),
    (r"فلاتر|فلوتر", "Flutter"),
    (r"دارت", "Dart"),
    
    # Databases & Caching
    (r"ماي اس كيو ال|ماي إس كيو إل|ماي سيكول", "MySQL"),
    (r"بوستجري|بوستجرس|بوستجريس", "PostgreSQL"),
    (r"سيكولايت|اس كيو لايت", "SQLite"),
    (r"اس كيو ال|إس كيو إل|سيكول", "SQL"),
    (r"مونجو|مونجو دي بي", "MongoDB"),
    (r"ريديس|ريدس", "Redis"),
    (r"سوبابيس|سوبا بيز", "Supabase"),
    (r"فايربيس|فاير بيس", "Firebase"),
    
    # Web Servers & Infra
    (r"اباتشي|أباتشي", "Apache"),
    (r"انجكس|انجن اكس|إنجن إكس|انجنكس|انجينكس", "Nginx"),
    (r"سيرفر|سيرفرات", "server"),
    (r"فرونت اند|فرونت إند", "Frontend"),
    (r"باك اند|باك إند", "Backend"),
    (r"فول ستاك|فل ستاك", "Fullstack"),
    (r"ويب هوك|ويب هوكس", "Webhook"),
    (r"ميدل وير|ميدلوير", "middleware"),
    (r"كومبوننت|كومبوننتس|كمبوننت", "Component"),
    (r"ريفاكتور|ريفاكتورينج", "refactor"),
    (r"ديباج|ديباجينج|ديبوق", "debug"),
    (r"تيرمنال|الترمينال|تيرمينال", "terminal"),
]

DEFAULT_RULES = [make_term_rule(regex_str, term) for regex_str, term in RAW_TERMS]

def apply_fixes(text, custom_fixes=None):
    rules = list(DEFAULT_RULES)
    if custom_fixes:
        for item in custom_fixes:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                pattern_str = item[0]
                term = item[1]
                rules.insert(0, make_term_rule(re.escape(pattern_str), term))
    
    for pat, repl in rules:
        text = pat.sub(repl, text)
    return text.strip()

def record_and_transcribe(language="ar-SA", timeout=90, silence_seconds=2.2, custom_fixes=None):
    import sounddevice as sd
    import speech_recognition as sr

    sample_rate = 16000
    channels = 1
    block_size = 1024
    # Lower threshold slightly so natural breathing/soft speech is not cut prematurely
    silence_threshold = 0.014

    recorded_chunks = []
    stop_event = threading.Event()
    silent_chunks_count = 0
    speech_detected = False
    
    chunks_per_sec = int(sample_rate / block_size)
    max_silent_chunks = int(chunks_per_sec * silence_seconds)
    min_speech_chunks = int(chunks_per_sec * 0.3)

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
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--silence", type=float, default=2.2)
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

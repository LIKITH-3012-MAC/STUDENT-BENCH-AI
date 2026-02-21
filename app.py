import os
import io
import csv
import re
import zipfile
import tarfile
import gzip
import logging
from typing import Optional

import openpyxl
from docx import Document
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from flask_session import Session
from dotenv import load_dotenv
from groq import Groq
from PyPDF2 import PdfReader

# ===================== LOAD ENV =====================
load_dotenv()

# ===================== CONFIG =====================
class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "prometheus_super_secret_key")
    SESSION_TYPE = "filesystem"
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_FILE_DIR = "./.flask_session/"
    SESSION_FILE_THRESHOLD = 100

    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    MODEL_NAME = os.getenv("MODEL_NAME", "llama-3.1-8b-instant")

    MAX_FILE_SIZE_MB = 25
    MAX_ARCHIVE_FILES = 20
    MAX_CONTEXT_CHARS = 12000

    BOT_NAME = "Prometheus AI"
    CREATOR_NAME = "Likith Naidu Anumakonda"

# ===================== APP INIT =====================
app = Flask(__name__)
app.config.from_object(Config)

Session(app)
CORS(app, supports_credentials=True)

logging.basicConfig(level=logging.INFO)

# ===================== GROQ CLIENT =====================
if not Config.GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY not found in environment.")

client = Groq(api_key=Config.GROQ_API_KEY)

# ===================== SECURITY =====================
def is_identity_question(message: str) -> bool:
    message = message.lower()
    patterns = [
        r"who (developed|created|built|made) you",
        r"who is your (creator|owner|god)",
        r"who owns you",
        r"your developer",
        r"your creator",
        r"who made you",
    ]
    return any(re.search(pattern, message) for pattern in patterns)

IDENTITY_RESPONSE = f"I was developed and created by {Config.CREATOR_NAME}."

# ===================== SYSTEM PROMPT =====================
BASE_SYSTEM_PROMPT = f"""
You are {Config.BOT_NAME}, an intelligent AI assistant.

You were developed and created by {Config.CREATOR_NAME}.

Always remain helpful, professional, and intelligent.
Never mention backend providers.
"""

# ===================== HELPERS =====================
def is_binary_string(bytes_data: bytes) -> bool:
    textchars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)))
    return bool(bytes_data.translate(None, textchars))

def extract_text_from_file(file) -> Optional[str]:
    filename = file.filename.lower()

    # File size protection
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > Config.MAX_FILE_SIZE_MB * 1024 * 1024:
        return "⚠️ File too large."

    try:
        # ===== PDF =====
        if filename.endswith(".pdf"):
            reader = PdfReader(file)
            return "\n".join(page.extract_text() or "" for page in reader.pages)

        # ===== DOCX =====
        if filename.endswith(".docx"):
            doc = Document(file)
            return "\n".join(p.text for p in doc.paragraphs)

        # ===== EXCEL =====
        if filename.endswith((".xlsx", ".xlsm", ".xltx", ".xltm")):
            wb = openpyxl.load_workbook(file)
            text = ""
            for sheet in wb.worksheets:
                text += f"\n--- Sheet: {sheet.title} ---\n"
                for row in sheet.iter_rows(values_only=True):
                    text += " ".join(str(cell) for cell in row if cell) + "\n"
            return text

        # ===== CSV =====
        if filename.endswith(".csv"):
            stream = io.StringIO(file.read().decode("utf-8", errors="ignore"))
            reader = csv.reader(stream)
            return "\n".join(" ".join(row) for row in reader)

        # ===== ZIP =====
        if filename.endswith(".zip"):
            text = ""
            with zipfile.ZipFile(file) as z:
                for i, name in enumerate(z.namelist()):
                    if i >= Config.MAX_ARCHIVE_FILES:
                        break
                    with z.open(name) as f:
                        content = f.read()
                        if not is_binary_string(content):
                            text += f"\n--- {name} ---\n"
                            text += content.decode("utf-8", errors="ignore")
            return text

        # ===== TAR =====
        if filename.endswith((".tar", ".tar.gz", ".tgz")):
            text = ""
            with tarfile.open(fileobj=file) as tar:
                for i, member in enumerate(tar.getmembers()):
                    if i >= Config.MAX_ARCHIVE_FILES:
                        break
                    f = tar.extractfile(member)
                    if f:
                        content = f.read()
                        if not is_binary_string(content):
                            text += f"\n--- {member.name} ---\n"
                            text += content.decode("utf-8", errors="ignore")
            return text

        # ===== GZIP =====
        if filename.endswith(".gz"):
            with gzip.open(file, "rb") as f:
                content = f.read()
                if not is_binary_string(content):
                    return content.decode("utf-8", errors="ignore")

        # ===== GENERIC TEXT =====
        raw_bytes = file.read()
        file.seek(0)
        if not is_binary_string(raw_bytes):
            return raw_bytes.decode("utf-8", errors="ignore")

    except Exception as e:
        logging.error(f"File extraction error: {str(e)}")
        return None

    return None

# ===================== ROUTES =====================
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({
        "status": "OK",
        "bot": Config.BOT_NAME,
        "creator": Config.CREATOR_NAME,
        "model": Config.MODEL_NAME
    }), 200

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()

        if not user_message:
            return jsonify({"reply": "⚠️ Empty message"}), 400

        if is_identity_question(user_message):
            return jsonify({"reply": IDENTITY_RESPONSE})

        context = session.get("file_text", "")

        messages = [{"role": "system", "content": BASE_SYSTEM_PROMPT}]

        if context:
            messages.append({
                "role": "system",
                "content": f"Use this document if relevant:\n{context[:Config.MAX_CONTEXT_CHARS]}"
            })

        messages.append({"role": "user", "content": user_message})

        response = client.chat.completions.create(
            model=Config.MODEL_NAME,
            messages=messages,
            temperature=0.5,
            max_tokens=1000
        )

        return jsonify({"reply": response.choices[0].message.content})

    except Exception as e:
        logging.error(str(e))
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500

@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if not file.filename:
            return jsonify({"reply": "⚠️ No file selected"}), 400

        extracted_text = extract_text_from_file(file)

        if not extracted_text:
            return jsonify({"reply": "⚠️ Could not extract text."}), 400

        session["file_text"] = extracted_text

        messages = [
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Document:\n{extracted_text[:Config.MAX_CONTEXT_CHARS]}\n\nQuestion: {user_query}"
            }
        ]

        response = client.chat.completions.create(
            model=Config.MODEL_NAME,
            messages=messages,
            temperature=0.4
        )

        return jsonify({
            "reply": response.choices[0].message.content,
            "status": "success"
        })

    except Exception as e:
        logging.error(str(e))
        return jsonify({"reply": f"⚠️ Upload error: {str(e)}"}), 500

@app.route("/clear", methods=["POST"])
def clear():
    session.pop("file_text", None)
    return jsonify({"reply": "Memory cleared!"})

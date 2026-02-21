import os
import io
import csv
import re
import zipfile
import tarfile
import gzip
import openpyxl
from docx import Document
from flask import Flask, request, jsonify, render_template, session
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from flask_cors import CORS
from flask_session import Session
from werkzeug.utils import secure_filename

# ================= INIT =================
load_dotenv()

app = Flask(__name__)

# ================= CONFIG =================
app.secret_key = os.getenv("SECRET_KEY", "prometheus_super_secret_key")

app.config.update(
    SESSION_TYPE="filesystem",
    SESSION_PERMANENT=False,
    SESSION_USE_SIGNER=True,
    SESSION_FILE_DIR="./.flask_session/",
    SESSION_FILE_THRESHOLD=100,
    MAX_CONTENT_LENGTH=25 * 1024 * 1024  # 25MB hard limit
)

Session(app)
CORS(app, supports_credentials=True)

# ================= GROQ =================
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEFAULT_MODEL = os.getenv("MODEL_NAME", "llama-3.1-8b-instant")

if not GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY not found in environment.")

client = Groq(api_key=GROQ_API_KEY)

# ================= CONSTANTS =================
CREATOR_NAME = "Likith Naidu Anumakonda"
BOT_NAME = "Prometheus AI"
IDENTITY_RESPONSE = f"I was developed and created by {CREATOR_NAME}."

MAX_ARCHIVE_FILES = 20
MAX_CONTEXT_LENGTH = 12000

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".xlsx", ".xlsm", ".xltx", ".xltm",
    ".csv", ".zip", ".tar", ".tar.gz", ".tgz", ".gz", ".txt"
}

# ================= UTILITIES =================

def allowed_file(filename):
    return any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS)


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


def safe_archive_member(name):
    return not (".." in name or name.startswith("/"))


def ai_generate(messages, model=None, temperature=0.5, max_tokens=1000):
    response = client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens
    )
    return response.choices[0].message.content


# ================= FILE EXTRACTION =================

def extract_text_from_file(file):
    filename = secure_filename(file.filename.lower())

    if not allowed_file(filename):
        return "⚠️ Unsupported file type."

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
                if i >= MAX_ARCHIVE_FILES:
                    break
                if safe_archive_member(name):
                    with z.open(name) as f:
                        text += f"\n--- {name} ---\n"
                        text += f.read().decode("utf-8", errors="ignore")
        return text

    # ===== TAR =====
    if filename.endswith((".tar", ".tar.gz", ".tgz")):
        text = ""
        with tarfile.open(fileobj=file) as tar:
            for i, member in enumerate(tar.getmembers()):
                if i >= MAX_ARCHIVE_FILES:
                    break
                if member.isfile() and safe_archive_member(member.name):
                    f = tar.extractfile(member)
                    if f:
                        text += f"\n--- {member.name} ---\n"
                        text += f.read().decode("utf-8", errors="ignore")
        return text

    # ===== GZIP =====
    if filename.endswith(".gz"):
        with gzip.open(file, "rb") as f:
            return f.read().decode("utf-8", errors="ignore")

    # ===== TXT =====
    return file.read().decode("utf-8", errors="ignore")


# ================= ROUTES =================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "OK",
        "bot": BOT_NAME,
        "creator": CREATOR_NAME,
        "model": DEFAULT_MODEL,
        "session_active": "file_text" in session
    })


@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()
        model = data.get("model")
        temperature = float(data.get("temperature", 0.5))

        if not user_message:
            return jsonify({"error": "Empty message"}), 400

        if is_identity_question(user_message):
            return jsonify({"reply": IDENTITY_RESPONSE})

        context = session.get("file_text", "")

        messages = [{
            "role": "system",
            "content": f"You are {BOT_NAME}. Created by {CREATOR_NAME}."
        }]

        if context:
            messages.append({
                "role": "system",
                "content": f"Document Context:\n{context[:MAX_CONTEXT_LENGTH]}"
            })

        messages.append({"role": "user", "content": user_message})

        reply = ai_generate(messages, model=model, temperature=temperature)

        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if not file.filename:
            return jsonify({"error": "No file selected"}), 400

        extracted_text = extract_text_from_file(file)

        if not extracted_text.strip():
            return jsonify({"error": "Could not extract text"}), 400

        session["file_text"] = extracted_text

        messages = [
            {"role": "system", "content": f"You are {BOT_NAME}."},
            {"role": "user", "content": f"{extracted_text[:MAX_CONTEXT_LENGTH]}\n\nQuestion: {user_query}"}
        ]

        reply = ai_generate(messages)

        return jsonify({"reply": reply, "status": "success"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/clear", methods=["POST"])
def clear():
    session.clear()
    return jsonify({"reply": "Memory cleared"})


# ================= ERROR HANDLER =================

@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large (Max 25MB)"}), 413


# ================= RUN =================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

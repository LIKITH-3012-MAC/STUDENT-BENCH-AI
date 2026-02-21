import os
import io
import csv
import openpyxl
from docx import Document
from flask import Flask, request, jsonify, render_template, session
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from flask_cors import CORS
from flask_session import Session

# ================= INIT =================
load_dotenv()

app = Flask(__name__)

# --- SECRET KEY ---
app.secret_key = os.getenv("SECRET_KEY", "prometheus_super_secret_key")

# --- SESSION CONFIG ---
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_USE_SIGNER"] = True
app.config["SESSION_FILE_DIR"] = "./.flask_session/"
app.config["SESSION_FILE_THRESHOLD"] = 100

Session(app)

CORS(app, supports_credentials=True)

# --- GROQ CLIENT ---
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")

# ================= HEALTH =================
@app.route("/health")
def health():
    return "OK", 200


# ================= CHAT =================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")

        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        context = session.get("file_text", "")

        if context:
            messages = [
                {
                    "role": "system",
                    "content": f"You are Prometheus AI. Use this document content:\n{context[:12000]}"
                },
                {"role": "user", "content": user_message}
            ]
        else:
            messages = [{"role": "user", "content": user_message}]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )

        return jsonify({"reply": response.choices[0].message.content})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500


# ================= FILE TEXT EXTRACTION FUNCTION =================
def extract_text_from_file(file):
    filename = file.filename.lower()

    # PDF
    if filename.endswith(".pdf"):
        reader = PdfReader(file)
        text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
        return text

    # DOCX
    elif filename.endswith(".docx"):
        doc = Document(file)
        return "\n".join([para.text for para in doc.paragraphs])

    # TXT, CODE, HTML, JSON, MD, XML
    elif filename.endswith((
        ".txt", ".py", ".js", ".html", ".css",
        ".json", ".md", ".xml"
    )):
        return file.read().decode("utf-8", errors="ignore")

    # CSV
    elif filename.endswith(".csv"):
        stream = io.StringIO(file.stream.read().decode("utf-8"))
        reader = csv.reader(stream)
        text = ""
        for row in reader:
            text += " ".join(row) + "\n"
        return text

    # Excel
    elif filename.endswith(".xlsx"):
        wb = openpyxl.load_workbook(file)
        sheet = wb.active
        text = ""
        for row in sheet.iter_rows(values_only=True):
            text += " ".join([str(cell) for cell in row if cell]) + "\n"
        return text

    else:
        return None


# ================= UPLOAD =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if file.filename == "":
            return jsonify({"reply": "⚠️ No file selected"}), 400

        extracted_text = extract_text_from_file(file)

        if not extracted_text or not extracted_text.strip():
            return jsonify({"reply": "⚠️ Could not extract text from this file."}), 400

        # Save in session memory
        session["file_text"] = extracted_text

        messages = [
            {
                "role": "system",
                "content": "You are Prometheus AI. Use the provided document content."
            },
            {
                "role": "user",
                "content": f"Document Content:\n{extracted_text[:12000]}\n\nUser Question: {user_query}"
            }
        ]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.3
        )

        return jsonify({
            "reply": response.choices[0].message.content,
            "status": "success"
        })

    except Exception as e:
        return jsonify({"reply": f"⚠️ Upload error: {str(e)}"}), 500


# ================= CLEAR =================
@app.route("/clear", methods=["POST"])
def clear():
    session.pop("file_text", None)
    return jsonify({"reply": "Memory cleared!"})


# ================= RUN LOCAL =================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

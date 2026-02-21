import os
from flask import Flask, request, jsonify, render_template, session
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from flask_cors import CORS
from flask_session import Session  # pip install Flask-Session

# ================= INIT =================
load_dotenv()

app = Flask(__name__)

# --- SECRET KEY ---
app.secret_key = os.getenv("SECRET_KEY", "prometheus_super_secret_key")

# --- SESSION CONFIG (Server-side storage) ---
app.config["SESSION_TYPE"] = "filesystem"   # Stores PDF text on server
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_USE_SIGNER"] = True
app.config["SESSION_FILE_DIR"] = "./.flask_session/"
app.config["SESSION_FILE_THRESHOLD"] = 100

Session(app)

# Allow credentials so browser sends session cookie
CORS(app, supports_credentials=True)

# --- GROQ CLIENT ---
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")

# ================= HEALTH CHECK (For UptimeRobot) =================
@app.route("/health")
def health():
    return "OK", 200


# ================= CHAT (With PDF Memory) =================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")

        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        # Retrieve PDF text from session
        pdf_context = session.get("pdf_text", "")

        if pdf_context:
            messages = [
                {
                    "role": "system",
                    "content": f"You are Prometheus AI. Use this PDF content to help:\n{pdf_context[:12000]}"
                },
                {"role": "user", "content": user_message}
            ]
        else:
            messages = [
                {"role": "user", "content": user_message}
            ]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )

        return jsonify({"reply": response.choices[0].message.content})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500


# ================= PDF UPLOAD + EXTRACTION =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if file.filename == "":
            return jsonify({"reply": "⚠️ No file selected"}), 400

        # Extract text from PDF
        reader = PdfReader(file)
        pdf_text = ""

        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                pdf_text += extracted + "\n"

        if not pdf_text.strip():
            return jsonify({"reply": "⚠️ Could not read text from this PDF."}), 400

        # Save PDF content to session
        session["pdf_text"] = pdf_text

        messages = [
            {
                "role": "system",
                "content": "You are Prometheus AI. Use the provided PDF context to answer the query."
            },
            {
                "role": "user",
                "content": f"PDF Content:\n{pdf_text[:12000]}\n\nUser Question: {user_query}"
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


# ================= CLEAR MEMORY =================
@app.route("/clear", methods=["POST"])
def clear():
    session.pop("pdf_text", None)
    return jsonify({"reply": "Memory cleared!"})


# ================= RUN (For Local Only) =================
# ⚠️ DO NOT USE THIS IN RENDER START COMMAND
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

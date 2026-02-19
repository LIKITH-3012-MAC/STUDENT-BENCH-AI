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

# --- CRITICAL CONFIG FOR PDF MEMORY ---
app.secret_key = os.getenv("SECRET_KEY", "prometheus_super_secret_key")
app.config["SESSION_TYPE"] = "filesystem"  # Stores PDF text on server, not in browser cookie
app.config["SESSION_PERMANENT"] = False
Session(app)

# Allow credentials so the browser sends the session cookie back
CORS(app, supports_credentials=True)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")

# ================= CHAT (With Memory) =================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")
        
        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        # Retrieve the PDF text from the server-side session
        pdf_context = session.get("pdf_text", "")

        if pdf_context:
            # If a PDF was previously uploaded, inject it as context
            messages = [
                {
                    "role": "system", 
                    "content": f"You are Prometheus AI. Use this PDF content to help: {pdf_context[:12000]}"
                },
                {"role": "user", "content": user_message}
            ]
        else:
            # Normal chat if no PDF is in memory
            messages = [{"role": "user", "content": user_message}]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )
        return jsonify({"reply": response.choices[0].message.content})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500

# ================= UPLOAD + EXTRACTION =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if file.filename == "":
            return jsonify({"reply": "⚠️ No file selected"}), 400

        # Extract Text
        reader = PdfReader(file)
        pdf_text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                pdf_text += extracted + "\n"

        if not pdf_text.strip():
            return jsonify({"reply": "⚠️ Could not read text from this PDF."}), 400

        # --- SAVE TO SESSION ---
        session["pdf_text"] = pdf_text 

        # Call Groq for the initial upload response
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

# Route to clear memory if the user wants to start fresh
@app.route("/clear", methods=["POST"])
def clear():
    session.pop("pdf_text", None)
    return jsonify({"reply": "Memory cleared!"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

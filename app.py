import os
from flask import Flask, request, jsonify, render_template
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from flask_cors import CORS

# ================= INIT =================
load_dotenv()

# Absolute base directory (IMPORTANT for Render)
base_dir = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(base_dir, "templates"),
    static_folder=os.path.join(base_dir, "static")
)

CORS(app)

# Upload folder
UPLOAD_FOLDER = os.path.join(base_dir, "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")


# ================= CHAT =================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")
        filename = data.get("filename")

        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        messages = []

        # Attach PDF context if provided
        if filename:
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            if os.path.exists(filepath) and filename.lower().endswith(".pdf"):
                reader = PdfReader(filepath)
                pdf_text = ""

                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        pdf_text += extracted

                if pdf_text.strip():
                    pdf_text = pdf_text[:4000]  # Prevent token overflow
                    messages.append({
                        "role": "system",
                        "content": f"Context from PDF ({filename}):\n{pdf_text}"
                    })

        # Add user message
        messages.append({
            "role": "user",
            "content": user_message
        })

        # Groq completion
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )

        reply = response.choices[0].message.content

        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500


# ================= FILE UPLOAD =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"message": "⚠️ No file provided"}), 400

        file = request.files["file"]

        if file.filename == "":
            return jsonify({"message": "⚠️ No file selected"}), 400

        if not file.filename.lower().endswith(".pdf"):
            return jsonify({"message": "⚠️ Only PDF files supported"}), 400

        filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(filepath)

        return jsonify({
            "message": f"📎 {file.filename} uploaded successfully",
            "filename": file.filename
        })

    except Exception as e:
        return jsonify({"message": f"⚠️ Upload error: {str(e)}"}), 500


# ================= RUN =================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

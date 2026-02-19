import os
from flask import Flask, request, jsonify, render_template
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from flask_cors import CORS

# ================= INIT =================
load_dotenv()

base_dir = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(base_dir, "templates"),
    static_folder=os.path.join(base_dir, "static")
)

CORS(app)

UPLOAD_FOLDER = os.path.join(base_dir, "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")

# ================= CHAT (Normal) =================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")
        
        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        messages = [{"role": "user", "content": user_message}]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )
        return jsonify({"reply": response.choices[0].message.content})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500

# ================= FILE UPLOAD + QUERY =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        user_query = request.form.get("query", "Summarize this document.")

        if file.filename == "":
            return jsonify({"reply": "⚠️ No file selected"}), 400

        if not file.filename.lower().endswith(".pdf"):
            return jsonify({"reply": "⚠️ Only PDF files supported"}), 400

        # Save file
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(filepath)

        # Extract Text
        reader = PdfReader(filepath)
        pdf_text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                pdf_text += extracted

        if not pdf_text.strip():
            return jsonify({"reply": "⚠️ Could not read text from this PDF."}), 400

        # Limit context to avoid token limits
        context_text = pdf_text[:6000] 

        # Call Groq with Context
        messages = [
            {"role": "system", "content": f"You are a helpful assistant. Use the following PDF content to answer the user's question.\n\nPDF Content:\n{context_text}"},
            {"role": "user", "content": user_query}
        ]

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )

        reply = response.choices[0].message.content
        return jsonify({"reply": reply, "filename": file.filename})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Upload error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

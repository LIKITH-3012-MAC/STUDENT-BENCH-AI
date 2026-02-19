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

# Ensure your .env file has GROQ_API_KEY
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================
@app.route("/")
def home():
    return render_template("index.html")

# ================= CHAT (Normal / Voice) =================
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

# ================= FILE UPLOAD + PDF READING =================
@app.route("/upload", methods=["POST"])
def upload():
    try:
        # 1. Check if file exists in request
        if "file" not in request.files:
            return jsonify({"reply": "⚠️ No file provided"}), 400

        file = request.files["file"]
        # Support for voice or text query alongside the file
        user_query = request.form.get("query", "Summarize this document and tell me the key points.")

        if file.filename == "":
            return jsonify({"reply": "⚠️ No file selected"}), 400

        if not file.filename.lower().endswith(".pdf"):
            return jsonify({"reply": "⚠️ Only PDF files supported"}), 400

        # 2. Save file temporarily
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(filepath)

        # 3. Extract Text from PDF
        # This is where the conversion from binary to string happens
        reader = PdfReader(filepath)
        pdf_text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                pdf_text += extracted + "\n"

        # 4. Handle Empty PDFs (like scanned images or empty files)
        if not pdf_text.strip():
            return jsonify({"reply": "⚠️ This PDF seems to be an image or empty. I cannot read the text inside."}), 400

        # 5. Limit context (Llama 3.1 8B on Groq has a specific window)
        # 12,000 characters is roughly 3,000 tokens—safe for the 8k limit.
        context_text = pdf_text[:12000] 

        # 6. Construct the prompt for Groq
        messages = [
            {
                "role": "system", 
                "content": (
                    "You are a helpful assistant. Use the provided PDF context to answer the user's question accurately. "
                    "If the answer is not in the context, tell the user you don't know based on the document."
                )
            },
            {
                "role": "user", 
                "content": f"PDF Content:\n{context_text}\n\nUser Question: {user_query}"
            }
        ]

        # 7. Call Groq
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.3 # Lower temperature = more factual for documents
        )

        reply = response.choices[0].message.content
        
        # Clean up: optional - remove file after reading to save space
        # os.remove(filepath) 

        return jsonify({
            "reply": reply, 
            "filename": file.filename,
            "status": "success"
        })

    except Exception as e:
        return jsonify({"reply": f"⚠️ Upload error: {str(e)}"}), 500

if __name__ == "__main__":
    # Running on 0.0.0.0 makes it accessible on your local network
    app.run(host="0.0.0.0", port=5000, debug=True)

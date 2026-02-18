import os
from flask import Flask, request, jsonify, render_template
from groq import Groq
from dotenv import load_dotenv
from PyPDF2 import PdfReader

# ================= INIT =================

load_dotenv()

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = "uploads"

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= HOME =================

@app.route("/")
def home():
    return render_template("index.html")

# ================= CHAT (TEXT + OPTIONAL FILE CONTEXT) =================

@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        user_message = data.get("message", "")
        filename = data.get("filename")

        if not user_message.strip():
            return jsonify({"reply": "⚠️ Empty message"}), 400

        messages = []

        # If file attached → read and inject context
        if filename:
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)

            if os.path.exists(filepath):

                reader = PdfReader(filepath)
                text = ""

                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted

                if text.strip():
                    trimmed_text = text[:4000]

                    messages.append({
                        "role": "system",
                        "content": "Answer the user's question using the provided document."
                    })

                    messages.append({
                        "role": "user",
                        "content": f"""
DOCUMENT CONTENT:
{trimmed_text}

USER QUESTION:
{user_message}
"""
                    })
                else:
                    messages.append({
                        "role": "user",
                        "content": user_message
                    })
            else:
                messages.append({
                    "role": "user",
                    "content": user_message
                })
        else:
            messages.append({
                "role": "user",
                "content": user_message
            })

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages
        )

        reply = response.choices[0].message.content
        return jsonify({"reply": reply})

    except Exception as e:
        return jsonify({"reply": f"⚠️ Error: {str(e)}"}), 500


# ================= FILE UPLOAD (ONLY SAVE, NO AI CALL) =================

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
            "message": "File attached successfully",
            "filename": file.filename
        })

    except Exception as e:
        return jsonify({"message": f"⚠️ Upload error: {str(e)}"}), 500


# ================= RUN =================

if __name__ == "__main__":
    app.run(debug=True, port=5001)

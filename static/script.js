const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// ====== BACKEND URL ======
const BACKEND_URL = "https://student-bench-ai.onrender.com";

// ================= CHAT =================
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage(extraMessage = "") {
    let text = input.value.trim() + (extraMessage ? "\n\n" + extraMessage : "");
    if (!text) return;

    addMessage(text, "user");
    input.value = "";
    statusText.innerText = "Thinking...";

    fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.reply, "ai");
        statusText.innerText = "Ready";
    })
    .catch(err => {
        addMessage("⚠️ Server error", "ai");
        statusText.innerText = "Error";
    });
}

function addMessage(text, type) {
    const msg = document.createElement("div");
    msg.classList.add("message", type);
    msg.innerText = text;
    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
    chatWindow.innerHTML = "";
}

// ================= FILE UPLOAD =================
let pendingFile = null;

uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    // Keep file pending until user sends query
    pendingFile = file;
    addMessage("📎 " + file.name + " ready to send. Enter your query below.", "user");
});

// Send PDF + query together
sendBtn.addEventListener("click", () => {
    if (!pendingFile) return;
    const query = input.value.trim();
    if (!query) {
        alert("Add your query about the PDF first!");
        return;
    }

    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage("📎 " + pendingFile.name + " + your query sent", "user");
    input.value = "";
    statusText.innerText = "Processing PDF...";

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.message, "ai");
        statusText.innerText = "Ready";
        pendingFile = null;
    })
    .catch(err => {
        addMessage("⚠️ PDF processing failed", "ai");
        statusText.innerText = "Error";
    });
});

// ================= VOICE INPUT =================
if ("webkitSpeechRecognition" in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => {
        recognition.start();
        statusText.innerText = "Listening...";
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        statusText.innerText = "Ready";
    };

    recognition.onerror = () => {
        statusText.innerText = "Mic Error";
    };

} else {
    micBtn.disabled = true;
    micBtn.innerText = "❌";
}

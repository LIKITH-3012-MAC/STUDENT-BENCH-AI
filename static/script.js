const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// ====== BACKEND URL ======
const BACKEND_URL = "https://student-bench-ai.onrender.com";

// ================= FILE STATE =================
let pendingFile = null;

// ================= SEND HANDLER =================
sendBtn.addEventListener("click", handleSend);

input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

function handleSend() {
    const text = input.value.trim();
    if (!text) return;

    // If a file is attached → send PDF + query
    if (pendingFile) {
        sendPDFQuery(text);
    } else {
        sendMessage(text);
    }
}

// ================= NORMAL CHAT =================
function sendMessage(text) {
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
    .catch(() => {
        addMessage("⚠️ Server error", "ai");
        statusText.innerText = "Error";
    });
}

// ================= PDF UPLOAD =================
function sendPDFQuery(query) {

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
        pendingFile = null; // Reset after success
    })
    .catch(() => {
        addMessage("⚠️ PDF processing failed", "ai");
        statusText.innerText = "Error";
    });
}

// ================= ADD MESSAGE =================
function addMessage(text, type) {
    const msg = document.createElement("div");
    msg.classList.add("message", type);

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.innerText = text;

    msg.appendChild(bubble);
    chatWindow.appendChild(msg);

    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ================= CLEAR CHAT =================
function clearChat() {
    chatWindow.innerHTML = "";
}

// ================= FILE SELECT =================
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    pendingFile = file;

    addMessage("📎 " + file.name + " ready. Now enter your question.", "user");
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

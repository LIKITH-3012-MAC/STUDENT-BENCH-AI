const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

const BACKEND_URL = "https://student-bench-ai.onrender.com";

let pendingFile = null;

// ================= SEND =================
sendBtn.addEventListener("click", handleSend);

input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
    }
});

function handleSend() {
    const text = input.value.trim();
    if (!text && !pendingFile) return;

    sendBtn.disabled = true;

    if (pendingFile) {
        sendPDFQuery(text || "Summarize this document.");
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
        addMessage(data.reply || "No response", "ai");
        statusText.innerText = "Ready";
        sendBtn.disabled = false;
    })
    .catch(err => {
        console.error(err);
        addMessage("⚠️ Server error", "ai");
        statusText.innerText = "Error";
        sendBtn.disabled = false;
    });
}

// ================= PDF =================
function sendPDFQuery(query) {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage(`📎 [${pendingFile.name}] ${query}`, "user");
    input.value = "";
    statusText.innerText = "Processing PDF...";

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        // Now expecting 'reply' from the backend
        addMessage(data.reply || "No response", "ai");
        pendingFile = null; // Clear file after use
        statusText.innerText = "Ready";
        sendBtn.disabled = false;
    })
    .catch(err => {
        console.error(err);
        addMessage("⚠️ PDF processing failed", "ai");
        statusText.innerText = "Error";
        sendBtn.disabled = false;
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

// ================= FILE =================
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    pendingFile = file;
    addMessage("📎 " + file.name + " ready. Ask your question.", "user");
});

// ================= VOICE =================
if ("webkitSpeechRecognition" in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => {
        recognition.start();
        statusText.innerText = "Listening...";
    });

    recognition.onresult = (event) => {
        input.value = event.results[0][0].transcript;
        statusText.innerText = "Ready";
    };

    recognition.onerror = () => {
        statusText.innerText = "Mic Error";
    };

} else {
    micBtn.disabled = true;
}

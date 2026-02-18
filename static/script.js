const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// ================= CHAT =================

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keypress", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, "user");
    input.value = "";
    statusText.innerText = "Thinking...";

    fetch("/chat", {
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

uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload", {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        addMessage("📎 " + file.name + " uploaded", "user");
        addMessage(data.message, "ai");
    })
    .catch(err => {
        addMessage("⚠️ Upload failed", "ai");
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

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        statusText.innerText = "Ready";
    };

    recognition.onerror = function() {
        statusText.innerText = "Mic Error";
    };

} else {
    micBtn.disabled = true;
    micBtn.innerText = "❌";
}


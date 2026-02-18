const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const themeToggle = document.getElementById("theme-toggle");

const BACKEND_URL = "https://student-bench-ai.onrender.com";

let pendingFile = null;
let lastRequestTime = 0;

// ================= INIT =================
window.onload = () => {
    loadChat();
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
    }
};

// ================= RATE LIMIT =================
function canSend() {
    const now = Date.now();
    if (now - lastRequestTime < 2000) return false;
    lastRequestTime = now;
    return true;
}

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

    if (!canSend()) {
        addMessage("⚠️ Please wait before sending another message.", "ai");
        return;
    }

    sendBtn.disabled = true;

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
    showTyping();

    fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => {
        removeTyping();
        addMessage(data.reply, "ai");
        sendBtn.disabled = false;
    })
    .catch(() => {
        removeTyping();
        addMessage("⚠️ Server error", "ai");
        sendBtn.disabled = false;
    });
}

// ================= PDF UPLOAD =================
function sendPDFQuery(query) {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage("📎 " + pendingFile.name + " + your query sent", "user");
    input.value = "";
    showTyping();

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        removeTyping();
        addMessage(data.message, "ai");
        pendingFile = null;
        sendBtn.disabled = false;
    })
    .catch(() => {
        removeTyping();
        addMessage("⚠️ PDF processing failed", "ai");
        sendBtn.disabled = false;
    });
}

// ================= TYPING INDICATOR =================
function showTyping() {
    const typing = document.createElement("div");
    typing.classList.add("message", "ai");
    typing.id = "typing-indicator";

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.innerHTML = "⏳ AI is thinking...";

    typing.appendChild(bubble);
    chatWindow.appendChild(typing);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTyping() {
    const typing = document.getElementById("typing-indicator");
    if (typing) typing.remove();
}

// ================= TYPEWRITER EFFECT =================
function typeWriterEffect(text, element) {
    let i = 0;
    const speed = 15;
    element.innerHTML = "";

    function typing() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(typing, speed);
        }
    }

    typing();
}

// ================= ADD MESSAGE =================
function addMessage(text, type) {
    const msg = document.createElement("div");
    msg.classList.add("message", type);

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");

    if (type === "ai") {
        typeWriterEffect(text, bubble);

        const copyBtn = document.createElement("button");
        copyBtn.innerText = "📋";
        copyBtn.classList.add("copy-btn");
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text);
        };

        bubble.appendChild(document.createElement("br"));
        bubble.appendChild(copyBtn);
    } else {
        bubble.innerText = text;
    }

    const time = document.createElement("span");
    time.classList.add("timestamp");
    time.innerText = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    msg.appendChild(bubble);
    msg.appendChild(time);

    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    saveChat();
}

// ================= LOCAL STORAGE =================
function saveChat() {
    localStorage.setItem("chatHistory", chatWindow.innerHTML);
}

function loadChat() {
    const saved = localStorage.getItem("chatHistory");
    if (saved) {
        chatWindow.innerHTML = saved;
    }
}

// ================= CLEAR CHAT =================
function clearChat() {
    chatWindow.innerHTML = "";
    localStorage.removeItem("chatHistory");
}

// ================= FILE SELECT =================
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    pendingFile = file;
    addMessage("📎 " + file.name + " ready. Enter your question.", "user");
});

// ================= DRAG & DROP =================
chatWindow.addEventListener("dragover", (e) => {
    e.preventDefault();
});

chatWindow.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
        pendingFile = file;
        addMessage("📎 " + file.name + " ready. Enter your question.", "user");
    }
});

// ================= THEME TOGGLE =================
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme",
        document.body.classList.contains("dark") ? "dark" : "light"
    );
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
        input.value = event.results[0][0].transcript;
        statusText.innerText = "Ready";
    };

    recognition.onerror = () => {
        statusText.innerText = "Mic Error";
    };

} else {
    micBtn.disabled = true;
    micBtn.innerText = "❌";
}

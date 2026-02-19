const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// Replace this with your actual Render URL
const BACKEND_URL = "https://student-bench-ai.onrender.com";

let pendingFile = null;

// ================= SEND LOGIC =================
sendBtn.addEventListener("click", handleSend);

input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
    }
});

function handleSend() {
    const text = input.value.trim();
    
    // If no text and no file, do nothing
    if (!text && !pendingFile) return;

    sendBtn.disabled = true;

    if (pendingFile) {
        // Use upload route when a file is attached
        sendPDFQuery(text || "Summarize this document.");
    } else {
        // Normal chat interaction
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
        // CRITICAL: Tells browser to send/receive the session cookie
        credentials: "include", 
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
        addMessage("⚠️ Server error. Check your connection.", "ai");
        statusText.innerText = "Error";
        sendBtn.disabled = false;
    });
}

// ================= PDF UPLOAD + QUERY =================
function sendPDFQuery(query) {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage(`📎 [${pendingFile.name}] ${query}`, "user");
    input.value = "";
    statusText.innerText = "Processing PDF...";

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        // CRITICAL: Connects this file upload to your session memory
        credentials: "include", 
        body: formData 
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.reply || "No response", "ai");
        clearPendingFile(); 
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

// ================= HELPERS =================
function addMessage(text, type) {
    const msg = document.createElement("div");
    msg.classList.add("message", type);

    const bubble = document.createElement("div");
    bubble.classList.add("bubble");
    bubble.innerText = text;

    msg.appendChild(bubble);
    chatWindow.appendChild(msg);

    // Auto-scroll to bottom
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearPendingFile() {
    pendingFile = null;
    fileInput.value = ""; 
}

// ================= FILE SELECTION =================
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
        addMessage("⚠️ Only PDF files are supported.", "ai");
        fileInput.value = "";
        return;
    }

    pendingFile = file;
    addMessage(`📎 Ready: ${file.name}. What would you like to know?`, "ai");
});

// ================= VOICE INPUT =================
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = "en-US";
    recognition.interimResults = false;

    micBtn.addEventListener("click", () => {
        try {
            recognition.start();
            statusText.innerText = "Listening...";
            micBtn.style.color = "red"; 
        } catch (e) {
            console.warn("Recognition already active");
        }
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        statusText.innerText = "Ready";
        micBtn.style.color = "";
        input.focus();
    };

    recognition.onerror = () => {
        statusText.innerText = "Mic Error";
        micBtn.style.color = "";
    };

    recognition.onend = () => {
        micBtn.style.color = "";
        if (statusText.innerText === "Listening...") statusText.innerText = "Ready";
    };

} else {
    micBtn.disabled = true;
    micBtn.title = "Voice not supported in this browser";
}

// ================= RESET SESSION (Optional) =================
// You can call this if you want to clear the AI's memory of the PDF
function clearMemory() {
    fetch(`${BACKEND_URL}/clear`, { method: "POST", credentials: "include" })
    .then(() => addMessage("Memory cleared successfully.", "ai"));
}

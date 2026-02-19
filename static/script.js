const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

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
        // If a file is attached, use the upload route (handles voice or text query)
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

// ================= PDF UPLOAD + QUERY =================
function sendPDFQuery(query) {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage(`📎 [${pendingFile.name}] ${query}`, "user");
    input.value = "";
    statusText.innerText = "Reading PDF...";

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData // Fetch automatically sets multipart/form-data for FormData
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.reply || "No response", "ai");
        clearPendingFile(); // Reset file after successful query
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

    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearPendingFile() {
    pendingFile = null;
    fileInput.value = ""; // Clear the input so the same file can be uploaded again
}

// ================= FILE SELECTION =================
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
        addMessage("⚠️ Please select a PDF file.", "ai");
        return;
    }

    pendingFile = file;
    addMessage(`📎 Ready to analyze: ${file.name}. Ask a question or hit send to summarize.`, "ai");
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
            micBtn.style.color = "red"; // Visual feedback for recording
        } catch (e) {
            console.error("Recognition already started");
        }
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        statusText.innerText = "Ready";
        micBtn.style.color = "";
        
        // Auto-focus the input so the user can see their voice transcript
        input.focus();
    };

    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        statusText.innerText = "Mic Error";
        micBtn.style.color = "";
    };

    recognition.onend = () => {
        micBtn.style.color = "";
        if(statusText.innerText === "Listening...") statusText.innerText = "Ready";
    };

} else {
    micBtn.title = "Speech recognition not supported in this browser";
    micBtn.style.opacity = "0.5";
    micBtn.disabled = true;
}

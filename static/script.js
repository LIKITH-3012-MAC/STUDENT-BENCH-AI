// ================= CONFIG =================

// Auto detect environment (Local vs Production)
const BACKEND_URL =
  window.location.hostname === "localhost"
    ? "http://127.0.0.1:5000"
    : "https://student-bench-ai.onrender.com";

const MAX_FILE_SIZE_MB = 25;

// ================= ELEMENTS =================
const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.querySelector(".chat-window");
const statusText = document.getElementById("status");

const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const clearBtn = document.getElementById("clear-btn"); // optional

let pendingFile = null;
let isProcessing = false;

// ================= SCROLL MANAGEMENT =================
let userScrolling = false;

function scrollToBottom(force = false) {
  const threshold = 100; // px from bottom
  const distanceFromBottom = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight;

  if (!userScrolling || force || distanceFromBottom < threshold) {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

chatWindow.addEventListener("scroll", () => {
  const distanceFromBottom = chatWindow.scrollHeight - chatWindow.scrollTop - chatWindow.clientHeight;
  userScrolling = distanceFromBottom > 100; // user is scrolling up
});

// ================= SEND EVENTS =================
sendBtn.addEventListener("click", handleSend);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// ================= MAIN SEND HANDLER =================
function handleSend() {
  if (isProcessing) return;

  const text = input.value.trim();
  if (!text && !pendingFile) return;

  isProcessing = true;
  sendBtn.disabled = true;

  if (pendingFile) {
    sendFileQuery(text || "Summarize this document.");
  } else {
    sendMessage(text);
  }
}

// ================= NORMAL CHAT =================
async function sendMessage(text) {
  addMessage(text, "user");
  input.value = "";

  const loader = addLoader();
  setStatus("Thinking...");

  try {
    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();
    removeLoader(loader);

    await addMessageWithTyping(data.reply || "⚠️ No response", "ai");
  } catch (err) {
    removeLoader(loader);
    addMessage("⚠️ Server connection failed.", "ai");
    console.error(err);
  }

  finishProcessing();
}

// ================= FILE UPLOAD =================
async function sendFileQuery(query) {
  const formData = new FormData();
  formData.append("file", pendingFile);
  formData.append("query", query);

  addMessage(`📎 ${pendingFile.name}\n${query}`, "user");
  input.value = "";

  const loader = addLoader();
  setStatus("Processing file...");

  try {
    const response = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      credentials: "include",
      body: formData
    });

    const data = await response.json();
    removeLoader(loader);

    await addMessageWithTyping(data.reply || "⚠️ No response", "ai");
    clearPendingFile();
  } catch (err) {
    removeLoader(loader);
    addMessage("⚠️ File processing failed.", "ai");
    console.error(err);
  }

  finishProcessing();
}

// ================= TYPING EFFECT =================
async function addMessageWithTyping(text, type) {
  const msg = document.createElement("div");
  msg.classList.add("message", type);

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  msg.appendChild(bubble);
  chatWindow.appendChild(msg);

  // Auto-scroll as AI types, respecting user scroll
  for (let i = 0; i < text.length; i++) {
    bubble.innerText += text[i];
    await new Promise((r) => setTimeout(r, 15));
    scrollToBottom();
  }
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
  scrollToBottom();
}

function addLoader() {
  const loader = document.createElement("div");
  loader.classList.add("message", "ai");

  const bubble = document.createElement("div");
  bubble.classList.add("bubble", "loading");
  bubble.innerText = "⏳ ...";

  loader.appendChild(bubble);
  chatWindow.appendChild(loader);
  scrollToBottom();

  return loader;
}

function removeLoader(loader) {
  if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
}

function setStatus(text) {
  statusText.innerText = text;
}

function finishProcessing() {
  isProcessing = false;
  sendBtn.disabled = false;
  setStatus("Ready");
}

function clearPendingFile() {
  pendingFile = null;
  fileInput.value = "";
}

// ================= FILE SELECTION =================
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    addMessage(`⚠️ File exceeds ${MAX_FILE_SIZE_MB}MB limit.`, "ai");
    fileInput.value = "";
    return;
  }

  const allowedExtensions = ["pdf", "csv", "docx", "xlsx"];
  const extension = file.name.split(".").pop().toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    addMessage(`⚠️ Unsupported file type: .${extension}`, "ai");
    fileInput.value = "";
    return;
  }

  pendingFile = file;
  addMessage(`📎 Ready: ${file.name}. What would you like to know?`, "ai");
});

// ================= CLEAR MEMORY =================
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    await fetch(`${BACKEND_URL}/clear`, {
      method: "POST",
      credentials: "include"
    });
    addMessage("🧠 Memory cleared.", "ai");
  });
}

// ================= VOICE INPUT =================
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;

  micBtn.addEventListener("click", () => {
    try {
      recognition.start();
      micBtn.style.color = "red";
      setStatus("Listening...");
    } catch (e) {
      console.warn("Mic already active");
    }
  });

  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    micBtn.style.color = "";
    setStatus("Ready");
    input.focus();
  };

  recognition.onerror = () => {
    micBtn.style.color = "";
    setStatus("Mic error");
  };

  recognition.onend = () => {
    micBtn.style.color = "";
    if (statusText.innerText === "Listening...") setStatus("Ready");
  };
} else {
  micBtn.disabled = true;
  micBtn.title = "Voice not supported in this browser";
}

// ================= AI AUTO-SCROLL HELPER (EXTRA) =================
function addAIMessage(content) {
  const msg = document.createElement("div");
  msg.classList.add("message", "ai");
  msg.textContent = content;
  chatWindow.appendChild(msg);
  scrollToBottom();
}

// Example AI typing simulation (can remove in prod)
function simulateAIResponse(messages) {
  let index = 0;
  const interval = setInterval(() => {
    if (index >= messages.length) return clearInterval(interval);
    addAIMessage(messages[index]);
    index++;
  }, 800);
}

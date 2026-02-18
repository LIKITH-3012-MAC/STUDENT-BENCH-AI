const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");
const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// ====== BACKEND URL ======
const BACKEND_URL = "https://student-bench-ai.onrender.com";

console.log("🔧 DEBUG MODE - Backend URL:", BACKEND_URL);

// ================= STATE =================
let pendingFile = null;
let pdfContentStored = null;

// ================= CHAT =================
sendBtn.addEventListener("click", () => {
  if (pendingFile) {
    uploadAndReadPDF();
  } else if (pdfContentStored) {
    sendQueryWithPDF();
  } else {
    sendMessage();
  }
});

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (pendingFile) {
      uploadAndReadPDF();
    } else if (pdfContentStored) {
      sendQueryWithPDF();
    } else {
      sendMessage();
    }
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
      addMessage("⚠️ Server error: " + err.message, "ai");
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
  pdfContentStored = null;
  pendingFile = null;
}

// ================= FILE UPLOAD WORKFLOW =================
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.type.includes("pdf")) {
    alert("Please upload a PDF file");
    return;
  }

  pendingFile = file;
  console.log("📄 File selected:", {
    name: file.name,
    size: file.size,
    type: file.type
  });
  
  addMessage(`📎 File selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)\n\nNow sending to read...`, "user");
  
  setTimeout(uploadAndReadPDF, 500);
});

// STEP 1: Upload PDF and extract text from it
function uploadAndReadPDF() {
  if (!pendingFile) {
    alert("No file selected!");
    return;
  }

  const formData = new FormData();
  formData.append("file", pendingFile);

  statusText.innerText = "Reading PDF...";
  console.log("🚀 Starting PDF upload to:", `${BACKEND_URL}/upload`);

  fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData
  })
    .then(async res => {
      console.log("📨 Response status:", res.status);
      const data = await res.json();
      console.log("📨 Response data:", data);
      
      if (res.ok || data.success || data.content) {
        pdfContentStored = data.content || data.message;
        addMessage(`✅ PDF read successfully!\n\n"${pendingFile.name}" is ready.\n\nNow ask me anything about this document:`, "ai");
        input.placeholder = "Ask a question about the PDF...";
        statusText.innerText = "Ready - Ask your question";
        pendingFile = null;
      } else {
        throw new Error(data.error || data.message || "Unknown error from server");
      }
    })
    .catch(err => {
      console.error("❌ ERROR:", err);
      const errorMsg = `⚠️ PDF reading failed!\n\nError: ${err.message}\n\n📋 DEBUGGING INFO:\n1. Check console (F12) for details\n2. Backend URL: ${BACKEND_URL}\n3. File: ${pendingFile?.name}\n\nMake sure your backend has:\n- POST /upload endpoint\n- pdfplumber installed\n- CORS enabled`;
      addMessage(errorMsg, "ai");
      statusText.innerText = "Error - Check console";
    });
}

// STEP 2: Send query with stored PDF content
function sendQueryWithPDF() {
  const query = input.value.trim();
  if (!query) {
    alert("Please ask a question about the PDF!");
    return;
  }

  addMessage(`Question: ${query}`, "user");
  input.value = "";
  statusText.innerText = "Analyzing PDF...";
  console.log("💬 Sending query:", query);

  fetch(`${BACKEND_URL}/query-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query,
      pdf_content: pdfContentStored
    })
  })
    .then(async res => {
      console.log("📨 Query response status:", res.status);
      const data = await res.json();
      console.log("📨 Query response data:", data);
      
      if (res.ok) {
        addMessage(data.answer || data.reply || "No answer found", "ai");
        statusText.innerText = "Ready";
      } else {
        throw new Error(data.answer || data.error || "Unknown error");
      }
    })
    .catch(err => {
      console.error("❌ QUERY ERROR:", err);
      addMessage(`⚠️ Query failed: ${err.message}\n\nMake sure your backend has POST /query-pdf endpoint`, "ai");
      statusText.innerText = "Error";
    });
}

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

// ================= INIT =================
console.log("✅ Chat app loaded - DEBUG mode active");
console.log("🔧 Open DevTools (F12) to see detailed error logs");

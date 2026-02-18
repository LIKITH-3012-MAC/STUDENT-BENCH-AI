const sendBtn = document.getElementById("send-btn");
const input = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const statusText = document.getElementById("status");
const micBtn = document.getElementById("mic-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// ====== BACKEND URL ======
const BACKEND_URL = "https://student-bench-ai.onrender.com";

// ================= STATE =================
let pendingFile = null;
let pdfContentStored = null; // Store extracted PDF content from backend

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
  addMessage(`📎 File selected: ${file.name}\n\nNow sending to read...`, "user");
  
  // Auto-trigger upload after showing message
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

  fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      // Backend should return: { success: true, content: "extracted text...", fileName: "..." }
      if (data.success || data.content) {
        pdfContentStored = data.content || data.message;
        addMessage(`✅ PDF read successfully!\n\n"${pendingFile.name}" is ready.\n\nNow ask me anything about this document:`, "ai");
        input.placeholder = "Ask a question about the PDF...";
        statusText.innerText = "Ready - Ask your question";
        pendingFile = null;
      } else {
        addMessage("⚠️ Failed to read PDF: " + (data.error || "Unknown error"), "ai");
        statusText.innerText = "Error";
      }
    })
    .catch(err => {
      addMessage("⚠️ PDF reading failed: " + err.message, "ai");
      statusText.innerText = "Error";
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

  // Send query + PDF content together to backend
  fetch(`${BACKEND_URL}/query-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query,
      pdf_content: pdfContentStored
    })
  })
    .then(res => res.json())
    .then(data => {
      addMessage(data.answer || data.reply || "No answer found", "ai");
      statusText.innerText = "Ready";
    })
    .catch(err => {
      addMessage("⚠️ Query processing failed: " + err.message, "ai");
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

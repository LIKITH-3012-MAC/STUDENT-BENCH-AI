// ... (your existing variable declarations) ...

function sendMessage(text) {
    addMessage(text, "user");
    input.value = "";
    statusText.innerText = "Thinking...";

    fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // --- ADD THIS LINE ---
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
        addMessage("⚠️ Server error", "ai");
        sendBtn.disabled = false;
    });
}

function sendPDFQuery(query) {
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("query", query);

    addMessage(`📎 [${pendingFile.name}] ${query}`, "user");
    input.value = "";
    statusText.innerText = "Processing PDF...";

    fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        // --- ADD THIS LINE ---
        credentials: "include", 
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.reply || "No response", "ai");
        pendingFile = null; 
        statusText.innerText = "Ready";
        sendBtn.disabled = false;
    })
    .catch(err => {
        addMessage("⚠️ PDF processing failed", "ai");
        sendBtn.disabled = false;
    });
}
// ... (rest of your voice and message UI logic) ...

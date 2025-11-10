let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordedBlob = null;
let selectedFile = null; // To store the uploaded file
let stream = null;

const recordBtn = document.getElementById("recordBtn");
const transcribeBtn = document.getElementById("transcribeBtn");
const resultDiv = document.getElementById("result");
const fileInput = document.getElementById("audio");
const audioPreview = document.getElementById("audioPreview");
const fileDisplayBox = document.getElementById("fileDisplayBox");
const fileNameSpan = document.getElementById("fileName");
const fileSizeSmall = document.getElementById("fileSize");
const deleteFileBtn = document.getElementById("deleteFileBtn");

const realtimeSwitch = document.querySelector(".switch input");
const uploadBox = document.querySelector(".upload-box");
const recordBox = document.querySelector(".record-box");

recordBtn.addEventListener("click", toggleRecording);
transcribeBtn.addEventListener("click", () => {
    if (!realtimeSwitch.checked) {
        upload(); // Normal mode
        return;
    }

    // Realtime mode
    if (!transcribeBtn.classList.contains("active")) {
        transcribeBtn.classList.add("active");
        transcribeBtn.innerHTML = '<span>Stop Real-Time</span>';
        startRealtimeTranscription();
    } else {
        transcribeBtn.classList.remove("active");
        transcribeBtn.innerHTML = '<span>Real Time Transcription Audio</span>';
        stopRealtimeTranscription();
    }
});

fileInput.addEventListener("change", handleFileUpload);
deleteFileBtn.addEventListener("click", deleteFile);

realtimeSwitch.addEventListener("change", () => {
    if (realtimeSwitch.checked) {
        // Hide and disable the upload and record buttons
        uploadBox.style.display = "none";
        recordBox.style.display = "none";
        transcribeBtn.innerHTML = '<span>Real Time Transcription Audio</span>';
    } else {
        // Show and enable the upload and record buttons
        uploadBox.style.display = "flex";
        recordBox.style.display = "flex";
        transcribeBtn.innerHTML = '<span>Transcribe Audio</span>';
        transcribeBtn.classList.remove("active"); // Remove active class to reset background
        stopRealtimeTranscription();
    }
});

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function displayAudioInfo(name, size, blobUrl) {
    fileNameSpan.textContent = name;
    fileSizeSmall.textContent = formatBytes(size);
    audioPreview.src = blobUrl;
    fileDisplayBox.style.display = "flex";
    audioPreview.style.display = "block";
}

function clearAudioInfo() {
    fileNameSpan.textContent = "";
    fileSizeSmall.textContent = "";
    audioPreview.src = "";
    fileDisplayBox.style.display = "none";
    audioPreview.style.display = "none";
    recordedBlob = null;
    selectedFile = null;
    fileInput.value = ""; // Clear file input value
}

function handleFileUpload() {
    if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        recordedBlob = null; // Clear recorded blob if a file is uploaded
        const fileUrl = URL.createObjectURL(selectedFile);
        console.log("Uploaded file:", selectedFile);
        
        displayAudioInfo(selectedFile.name, selectedFile.size, fileUrl);
    } else {
        selectedFile = null;
        // If no file is selected and no recorded audio exists, clear info
        if (!recordedBlob) {
            clearAudioInfo();
        }
    }
}

function deleteFile() {
    clearAudioInfo();
}

async function toggleRecording() {
  if (!isRecording) {
    // Clear any previously uploaded file or recorded audio display
    clearAudioInfo();

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(audioChunks, { type: "audio/webm" });
      const blobUrl = URL.createObjectURL(recordedBlob);
      displayAudioInfo("recorded_audio.webm", recordedBlob.size, blobUrl);
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.innerHTML = '<i class="fas fa-stop"></i> <span>Stop Recording</span> <small class="file-info">Click to stop recording</small>';
    recordBtn.style.backgroundColor = "#b91c1c"; // red
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.innerHTML = '<i class="fas fa-microphone"></i> <span>Start Recording</span> <small class="file-info">Click to record from microphone</small>';
    recordBtn.style.backgroundColor = "#2b3a57"; // blue
  }
}

async function upload() {
  let audioBlob = null;
  let filename = "audio.wav"; // Default filename

  if (selectedFile) {
    audioBlob = selectedFile;
    filename = selectedFile.name;
  } else if (recordedBlob) {
    audioBlob = recordedBlob;
    filename = "recorded_audio.webm"; // Use a consistent name for recorded audio
  } else {
    alert("Please record or upload an audio file first!");
    return;
  }

  const formData = new FormData();
  formData.append("file", audioBlob, filename);

  resultDiv.textContent = "⏳ Transcribing...";
  transcribeBtn.disabled = true; // Disable button during transcription

  try {
    const res = await fetch("/transcribe", { method: "POST", body: formData });
    const data = await res.json();
    resultDiv.textContent = data.text || data.error || "Error occurred.";
  } catch (err) {
    resultDiv.textContent = "Error occurred during transcription.";
    console.error(err);
  } finally {
    transcribeBtn.disabled = false; // Re-enable button
    // Optionally clear the audio info after transcription if desired
    // clearAudioInfo();
  }
}

let ws = null;
let audioContext = null;
let processorNode = null;
let sourceNode = null;


async function startRealtimeTranscription() {
    resultDiv.textContent = "🎙️ Listening...";

    ws = new WebSocket(`ws://${window.location.host}/ws`);

    ws.onmessage = (event) => {
      resultDiv.textContent = event.data.trim();
      console.log("New Text received:", event.data); // Log newText to browser console
    };

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext({ sampleRate: 16000 });
    sourceNode = audioContext.createMediaStreamSource(stream);

    // Buffer size 4096 gives ~0.25s per chunk; good for smooth streaming
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    processorNode.onaudioprocess = (e) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const float32Data = e.inputBuffer.getChannelData(0);
            ws.send(float32Data.buffer); // Send PCM chunk
        }
    };
}

function stopRealtimeTranscription() {
    resultDiv.textContent = "⏹️ Stopped \n" + resultDiv.textContent;

    if (processorNode) processorNode.disconnect();
    if (sourceNode) sourceNode.disconnect();
    if (audioContext) audioContext.close();
    stream.getTracks().forEach(t => t.stop());

    processorNode = null;
    sourceNode = null;
    audioContext = null;

    if (ws) ws.close();
    ws = null;
}

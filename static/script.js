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

recordBtn.addEventListener("click", toggleRecording);
transcribeBtn.addEventListener("click", upload);
fileInput.addEventListener("change", handleFileUpload);
deleteFileBtn.addEventListener("click", deleteFile);

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
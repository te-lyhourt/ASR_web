// html elements
let subtitle = document.getElementById("subtitle");

// websocket variables
let socket;
let stream;
let audioContext;
let sourceNode;
let workletNode;

//recording variables
let sendInterval;
let pcmChunks = [];
const chunk_ms = 1000;

// subtitle variables
// const maxlengh = 10;

/* =========================
   1. Start WebSocket
========================= */
function startWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket("wss://test.asr-api.idri.edu.kh/api/v02/L2Fzcl9jbGllbnRzL1l0THBnejZYUmxyZ0FZSkhiY2VoL2FwaV9rZXlzL3QyaGo2dG4wSWJrRVVra0FVN3Fo");
    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
        console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log(data);
            if (data.partial) {
                // const words = data.partial.trim().split(/\s+/);
                // const lastWords = words.slice(-maxlengh).join(" ");
                // subtitle.innerText = lastWords.replace(/\s+/g, "");
                subtitle.innerText = data.partial.replace(/\s+/g, "");
            }
            if (data.partial === "") {
                subtitle.innerText = "";
                return;
            }
        } catch (e) {
            console.error("Invalid JSON:", event.data);
        }
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };

    socket.onclose = () => {
        console.log("WebSocket closed");
        socket = null;
    };
}

/* =========================
   2. Start Recording
========================= */


async function startRecording() {
    if (audioContext) return;

    startWebSocket();

    stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    });

    // Force 16kHz
    audioContext = new AudioContext({ sampleRate: 16000 });

    sourceNode = audioContext.createMediaStreamSource(stream);

    await audioContext.audioWorklet.addModule("/static/audio-processor.js");


    workletNode = new AudioWorkletNode(audioContext, "audio-processor");

    sourceNode.connect(workletNode);

    // Collect chunks instead of sending immediately
    workletNode.port.onmessage = (event) => {
        pcmChunks.push(event.data);
    };

    // Send chunks every 500ms
    sendInterval = setInterval(() => {
        if (pcmChunks.length > 0 && socket && socket.readyState === WebSocket.OPEN) {
            // 1. Calculate total byte length
            let totalLength = 0;
            for (const chunk of pcmChunks) {
                totalLength += chunk.byteLength;
            }

            // 2. Merge all chunks
            const mergedBuffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of pcmChunks) {
                mergedBuffer.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            // 3. Send and clear buffer
            socket.send(mergedBuffer.buffer);
            pcmChunks = [];
        }
    }, chunk_ms);

    console.log("Recording started (16kHz, mono, PCM16, batch " + chunk_ms + "ms)");
}

/* =========================
   3. Stop Recording
========================= */
async function stopRecording() {
    if (!audioContext) return;

    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
    }

    if (workletNode) {
        workletNode.disconnect();
        workletNode = null;
    }

    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }

    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    // Flush remaining chunks if any
    if (pcmChunks.length > 0 && socket && socket.readyState === WebSocket.OPEN) {
        let totalLength = 0;
        for (const chunk of pcmChunks) totalLength += chunk.byteLength;
        const mergedBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of pcmChunks) {
            mergedBuffer.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        socket.send(mergedBuffer.buffer);
        pcmChunks = [];
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: "end_of_stream" }));
    }

    console.log("Recording stopped");
}


startWebSocket();
// 1. Start recording immediately
startRecording();
// 2. Schedule the STOP function to run 10 seconds (10000ms) later
setTimeout(stopRecording, 30000000);
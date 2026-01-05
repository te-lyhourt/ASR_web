from fastapi import FastAPI, UploadFile, File, WebSocket
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import tempfile
from model import transcribe, load_model,transcribe_stream # Import the new load_model function
from contextlib import asynccontextmanager
import numpy as np

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(lifespan=lifespan)

# Serve frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

# home page
@app.get("/", response_class=HTMLResponse)
def home():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/subtitle", response_class=HTMLResponse)
def subtitle():
    with open("static/subtitle.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # Save uploaded audio temporarily
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        text = transcribe(tmp_path)
        return JSONResponse({"text": text})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        os.remove(tmp_path)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Sliding buffer: keep last 10 seconds of audio
    SAMPLE_RATE = 16000
    MAX_SECONDS = 10
    buffer = np.array([], dtype=np.float32)

    while True:
        try:
            # Receive raw PCM float32 audio bytes
            chunk = await websocket.receive_bytes()
        except:
            break

        # Convert received bytes → float32 array
        audio_np = np.frombuffer(chunk, dtype=np.float32)

        # Append to sliding buffer
        buffer = np.concatenate([buffer, audio_np])

        # Trim old audio
        max_samples = SAMPLE_RATE * MAX_SECONDS
        if len(buffer) > max_samples:
            buffer = buffer[-max_samples:]

        # Run real-time transcription
        text = transcribe_stream(buffer)

        # Send text back to client
        await websocket.send_text(text)
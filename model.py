import torch
import torchaudio
from transformers import WhisperProcessor, WhisperForConditionalGeneration

MODEL_NAME = "PhanithLIM/whisper-small-khmer"
CACHE_DIR = "../models/whisper-small-khmer"

# Initialize these as None, they will be loaded on startup
processor = None
model = None
device = None

def load_model():
    """Loads the Whisper model and processor into memory."""
    global processor, model, device
    print("🔄 Loading model...")
    processor = WhisperProcessor.from_pretrained(MODEL_NAME, cache_dir=CACHE_DIR)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_NAME, cache_dir=CACHE_DIR)
    processor.tokenizer.set_prefix_tokens(language="km", task="transcribe")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()
    print(f"✅ Model loaded on {device}")

def transcribe(audio_path: str):
    # Ensure model is loaded before transcription (should be handled by startup event)
    if model is None or processor is None:
        raise RuntimeError("Model not loaded. Ensure load_model() is called on startup.")

    # Load and preprocess
    speech, sr = torchaudio.load(audio_path)
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(sr, 16000)
        speech = resampler(speech)
    speech = speech.squeeze()

    inputs = processor(speech, sampling_rate=16000, return_tensors="pt").input_features.to(device)
    with torch.no_grad():
        predicted_ids = model.generate(inputs)
    transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    return transcription.strip()
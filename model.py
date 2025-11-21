import torch
import torchaudio
from transformers import WhisperProcessor, WhisperForConditionalGeneration

MODEL_NAME = "Lyhourtlyhourt/whisper-openai-small-kh"
CACHE_DIR = "../models/whisper-small-kh-ft"

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
    processor.tokenizer.set_prefix_tokens(language="km")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()
    print(f"✅ Model loaded on {device}")

def transcribe(audio_path: str,chunk_length_s=20):
    # Ensure model is loaded before transcription (should be handled by startup event)
    if model is None or processor is None:
        raise RuntimeError("Model not loaded. Ensure load_model() is called on startup.")

    # Load and preprocess
    speech, sr = torchaudio.load(audio_path)
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(sr, 16000)
        speech = resampler(speech)
    
    # Ensure audio is mono (1D tensor)
    if speech.dim() > 1:
        speech = speech.mean(dim=0)
    # Calculate chunk size in samples
    chunk_size_samples = chunk_length_s * 16000
    total_transcription = []

    for i in range(0, speech.shape[0], chunk_size_samples):
        chunk = speech[i:i + chunk_size_samples]
        
        # Preprocess audio for Whisper
        inputs = processor(
            chunk,
            sampling_rate=16000,
            return_tensors="pt"
        ).input_features
        
        inputs = inputs.to(device)
        
        # Generate transcription for the chunk
        try:
            with torch.no_grad():
                predicted_ids = model.generate(
                    inputs,
                    task="transcribe",
                    suppress_tokens=[1, 2, 7, 8, 9, 10, 14, 25, 26, 27, 28, 29, 31, 58, 59, 60, 61, 62, 63, 90, 91, 92, 93, 359, 503, 522, 542, 873, 893, 902, 918, 922, 931, 1350, 1853, 1982, 2460, 2627, 3246, 3253, 3268, 3536, 3846, 3961, 4183, 4667, 6585, 6647, 7273, 9061, 9383, 10428, 10929, 11938, 12033, 12331, 12562, 13793, 14157, 14635, 15265, 15618, 16553, 16604, 18362, 18956, 20075, 21675, 22520, 26130, 26161, 26435, 28279, 29464, 31650, 32302, 32470, 36865, 42863, 47425, 49870, 50254, 50258, 50360, 50361, 50362],
                    begin_suppress_tokens=[220, 50257],
                    attention_mask=inputs.attention_mask if hasattr(inputs, 'attention_mask') else None
                )
            transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
            total_transcription.append(transcription.strip())
        except Exception as e:
            print(f"An error occurred during transcription of a chunk: {e}")
            # Optionally, append an empty string or a placeholder for failed chunks
            total_transcription.append("")

    return " ".join(total_transcription).strip()

def transcribe_stream(buffer, sample_rate=16000):
    """Transcribe from an in-memory float32 PCM numpy array."""
    if buffer is None or len(buffer) == 0:
        return ""

    # Convert to tensor
    speech = torch.tensor(buffer, dtype=torch.float32)

    # Ensure model is loaded
    if model is None or processor is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    # Whisper expects mono, so just ensure 1D
    if speech.dim() > 1:
        speech = speech.mean(dim=0)

    inputs = processor(
        speech,
        sampling_rate=sample_rate,
        return_tensors="pt"
    ).input_features.to(device)

    with torch.no_grad():
        predicted_ids = model.generate(
            inputs, 
            task="transcribe",
            suppress_tokens=[1, 2, 7, 8, 9, 10, 14, 25, 26, 27, 28, 29, 31, 58, 59, 60, 61, 62, 63, 90, 91, 92, 93, 359, 503, 522, 542, 873, 893, 902, 918, 922, 931, 1350, 1853, 1982, 2460, 2627, 3246, 3253, 3268, 3536, 3846, 3961, 4183, 4667, 6585, 6647, 7273, 9061, 9383, 10428, 10929, 11938, 12033, 12331, 12562, 13793, 14157, 14635, 15265, 15618, 16553, 16604, 18362, 18956, 20075, 21675, 22520, 26130, 26161, 26435, 28279, 29464, 31650, 32302, 32470, 36865, 42863, 47425, 49870, 50254, 50258, 50360, 50361, 50362],
            begin_suppress_tokens=[220, 50257],
            attention_mask=inputs.attention_mask if hasattr(inputs, 'attention_mask') else None
        )

    text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    return text.strip()

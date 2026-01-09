class AudioProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input[0]) {
            const pcm16 = floatToPCM16(input[0]);
            this.port.postMessage(pcm16);
        }
        return true;
    }
}

function floatToPCM16(float32Array) {
    // 1. Calculate buffer size
    // PCM16 uses 2 bytes per sample, so the new buffer needs to be 
    // twice the length of the input float array.
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);

    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        // 2. Clamping
        // Web Audio uses floats strictly between -1.0 and 1.0. 
        // Sometimes values can go slightly out of bounds, so this ensures 
        // they stay within the valid range to avoid distortion or wrapping.
        let sample = Math.max(-1, Math.min(1, float32Array[i]));

        // 3. Bit Depth Conversion
        // Converts the float (-1.0 to 1.0) to a 16-bit integer (-32768 to 32767).
        // - If sample < 0: multiply by 0x8000 (32768)
        // - If sample >= 0: multiply by 0x7FFF (32767)
        // The 'true' argument tells DataView to write in Little Endian format.
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return buffer;
}

registerProcessor("audio-processor", AudioProcessor);

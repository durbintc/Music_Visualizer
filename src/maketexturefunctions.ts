import {
    initShaders,
    perspective,
    vec2,
    vec4,
    mat4,
    flatten,
    lookAt,
    rotateX,
    rotateY,
    translate, scalem
} from './helperfunctions.ts';

// ==================== SPOTIFY CONFIGURATION ====================
const SPOTIFY_CLIENT_ID = "bad550ab93564712ae6d3f8f3b6690b6";
const REDIRECT_URI = "http://127.0.0.1:5173/callback";

let spotifyPlayer: any = null;
let spotifyDeviceId: string = '';
let spotifyAccessToken: string = '';
let spotifyPlaying: boolean = false;
let albumArtUrl: string | null = null;
let albumMode: boolean = false

// ==================== WEBGL VARIABLES ====================
let gl: WebGLRenderingContext;
let program: WebGLProgram;

let marbleTex: WebGLTexture;
let imageTex: WebGLTexture;
let morphedAlbumTex: WebGLTexture;
let graphTex: WebGLTexture;
let turbTex: WebGLTexture;

let umv: WebGLUniformLocation;
let uproj: WebGLUniformLocation;

let mv: mat4;
let p: mat4;

let vPosition: GLint;
let vTexCoord: GLint;
let uTextureSampler: WebGLUniformLocation;

let canvas: HTMLCanvasElement;

let albumArtCanvas: HTMLCanvasElement | null = null;
let albumArtContext: CanvasRenderingContext2D | null = null;
let albumArtImageData: ImageData | null = null;

// ==================== INTERACTION STATE ====================
let xAngle: number;
let yAngle: number;
let mouse_button_down: boolean = false;
let prevMouseX: number = 0;
let prevMouseY: number = 0;
let zoom: number = 25;

// ==================== NOISE & AUDIO VARIABLES ====================
let noiseWidth = 256;
let noiseHeight = 256;
let noise: number[][];

let bass = 0;
let mid = 0;
let high = 0;

let r = 0;
let g = 0;
let b = 0;
let colorMode = false;

let mode = [1, 1, 1];
let marbleMode = true;

let lowLimit = 100;
let midLimit = 200;
let highLimit = 300;

const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;

const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

let spotify = true;
let audioSource: MediaElementAudioSourceNode | MediaStreamAudioSourceNode;

// ==================== SPOTIFY PKCE FUNCTIONS ====================

function generateCodeVerifier(length: number): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function redirectToAuthCodeFlow(clientId: string): Promise<void> {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", REDIRECT_URI);
    params.append("scope", "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.getElementById("status")!.textContent = "Status: Redirecting to Spotify...";
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function getAccessToken(clientId: string, code: string): Promise<any> {
    const verifier = localStorage.getItem("verifier");

    if (!verifier) {
        throw new Error("No verifier found in localStorage");
    }

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", REDIRECT_URI);
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    if (!result.ok) {
        throw new Error(`Token request failed: ${result.status}`);
    }

    return await result.json();
}

// ==================== SPOTIFY WEB PLAYBACK SDK ====================

function initSpotifyPlayer(token: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!window.Spotify) {
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            document.head.appendChild(script);
        }

        window.onSpotifyWebPlaybackSDKReady = () => {
            spotifyPlayer = new window.Spotify.Player({
                name: 'Music Visualizer',
                getOAuthToken: (cb: (token: string) => void) => { cb(token); },
                volume: 0.5
            });

            spotifyPlayer.addListener('initialization_error', ({ message }: any) => {
                console.error('Failed to initialize:', message);
                reject(message);
            });

            spotifyPlayer.addListener('authentication_error', ({ message }: any) => {
                console.error('Failed to authenticate:', message);
                reject(message);
            });

            spotifyPlayer.addListener('account_error', ({ message }: any) => {
                console.error('Failed to validate account:', message);
                reject(message);
            });

            spotifyPlayer.addListener('playback_error', ({ message }: any) => {
                console.error('Failed to perform playback:', message);
            });

            spotifyPlayer.addListener('ready', ({ device_id }: any) => {
                console.log('✅ Ready with Device ID', device_id);
                spotifyDeviceId = device_id;
                resolve(device_id);
            });

            spotifyPlayer.addListener('not_ready', ({ device_id }: any) => {
                console.log('Device ID has gone offline', device_id);
            });

            spotifyPlayer.connect();
        };
    });
}

async function playSpotifyUri(uri: string): Promise<void> {
    if (!spotifyAccessToken || !spotifyDeviceId) {
        console.error('Spotify not initialized');
        return;
    }

    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${spotifyAccessToken}`
        },
        body: JSON.stringify({
            context_uri: uri,
        })
    });

    if (!response.ok) {
        console.error('Failed to play:', await response.text());
    } else {
        console.log('✅ Playback started!');
    }
}

async function resumeCurrentPlayback(): Promise<void> {
    if (!spotifyAccessToken || !spotifyDeviceId) {
        console.error('Spotify not initialized');
        return;
    }

    // Just resume playback on this device without specifying what to play
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${spotifyAccessToken}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to resume playback:', errorText);
        
        // If there's nothing in queue, suggest user to play something
        if (response.status === 404) {
            alert('No active playback found. Please:\n1. Play something in your Spotify app first, OR\n2. Enter a playlist URL to start playback');
        }
    } else {
        console.log('✅ Resumed current playback!');
    }
}

async function pausePlayback(): Promise<void> {
    const statusEl = document.getElementById('status');

    // 1. Handle Spotify Pause
    if (spotifyAccessToken && spotifyPlayer) {
        try {
            await spotifyPlayer.pause();
            console.log('⏸️ Spotify playback paused');
            if (statusEl) statusEl.textContent = 'Status: ⏸️ Paused';
        } catch (error) {
            console.error('Failed to pause Spotify:', error);
        }
    } 
    
    // 2. Handle Fallback MP3 Pause
    const audio = document.getElementById("music") as HTMLAudioElement;
    if (audio && !audio.paused) {
        audio.pause();
        console.log('⏸️ MP3 playback paused');
        if (statusEl) statusEl.textContent = 'Status: ⏸️ Paused';
    }
}

function extractPlaylistId(input: string): string | null {
    // Remove whitespace
    input = input.trim();
    
    // If empty, return null (will use current playback)
    if (!input) {
        return null;
    }
    
    // Check if it's already just an ID (alphanumeric, ~22 chars)
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
        return input;
    }
    
    // Try to extract from URL
    // Format: https://open.spotify.com/playlist/5Qrui9QhsARGjG3eMX5a0Y
    const urlMatch = input.match(/playlist[\/:]([a-zA-Z0-9]+)/);
    if (urlMatch) {
        return urlMatch[1];
    }
    
    // Try spotify URI format: spotify:playlist:ID
    const uriMatch = input.match(/spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) {
        return uriMatch[1];
    }
    
    return null;
}

function getPlaylistUri(): string | null {
    const input = (document.getElementById('playlist-input') as HTMLInputElement).value;
    const playlistId = extractPlaylistId(input);
    
    // If no input, return null to indicate we should use current playback
    if (input.trim() === '') {
        return null;
    }
    
    if (!playlistId) {
        console.error('Invalid playlist URL or ID');
        alert('Invalid playlist URL or ID. Please enter:\n- A Spotify playlist URL (https://open.spotify.com/playlist/...)\n- Or just the playlist ID (22 character code)\n- Or leave empty to resume current playback');
        return '';
    }
    
    return `spotify:playlist:${playlistId}`;
}

async function toggleShuffle(state: boolean): Promise<void> {
    if (!spotifyAccessToken) {
        console.error('Spotify not initialized');
        return;
    }

    const response = await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${state}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${spotifyAccessToken}`
        }
    });

    if (!response.ok) {
        console.error('Failed to toggle shuffle:', await response.text());
    } else {
        console.log(`✅ Shuffle ${state ? 'enabled' : 'disabled'}!`);
    }
}

async function skipToNext(): Promise<void> {
    if (!spotifyAccessToken) {
        console.error('Spotify not initialized');
        return;
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${spotifyAccessToken}`
        }
    });

    if (!response.ok) {
        console.error('Failed to skip:', await response.text());
    } else {
        console.log('⏭️ Skipped to next track!');
        setTimeout(async () => {
            albumArtUrl = await getCurrentAlbumArtURL();
            if (albumArtUrl) {
                console.log('🎨 New album art:', albumArtUrl);
                updateAlbumArt(albumArtUrl); // ← Add this line
                // TODO: Update display with new album art
            }
        }, 500);
    }
}

async function skipToPrevious(): Promise<void> {
    if (!spotifyAccessToken) {
        console.error('Spotify not initialized');
        return;
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${spotifyAccessToken}`
        }
    });

    if (!response.ok) {
        console.error('Failed to skip back:', await response.text());
    } else {
        console.log('⏮️ Skipped to previous track!');
    }
}

let spotifyAudioConnected = false;

async function connectSpotifyToAnalyser(): Promise<void> {
    if (spotifyAudioConnected) {
        console.log('Audio already connected');
        return;
    }

    console.log('🎤 Connecting audio for Spotify visualization...');
    console.log('⚠️ Note: Spotify Web Playback SDK does not expose its audio stream directly.');
    console.log('💡 Solution: Using microphone to capture audio from your speakers/headphones');
    
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.textContent = 'Status: Grant microphone access to visualize audio...';
    
    try {
        // Use microphone to capture the audio playing from speakers
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,  // Important: don't cancel the music!
                noiseSuppression: false,   // Keep all audio
                autoGainControl: false,    // Don't adjust volume
                sampleRate: 48000
            } 
        });
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        // Don't connect to destination to avoid feedback loop
        
        spotifyAudioConnected = true;
        console.log('✅ Microphone connected! Visualizer will respond to audio from speakers.');
        
        if (statusEl) statusEl.textContent = 'Status: 🎵 Visualizing! (Using microphone input)';
        
        // Test after 1 second
        setTimeout(() => {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            console.log('🔊 Audio input test - Sum:', sum, 'First 10 values:', Array.from(dataArray.slice(0, 10)));
            if (sum === 0) {
                console.log('⚠️ No audio detected. Make sure:');
                console.log('  1. Spotify is playing');
                console.log('  2. Volume is up');
                console.log('  3. Microphone is near speakers OR use stereo mix/loopback');
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ Failed to access microphone:', error);
        if (statusEl) statusEl.textContent = 'Status: ❌ Microphone access denied. Grant permission to visualize.';
        
        // Show helpful message
        alert('To visualize Spotify audio:\n\n1. Grant microphone permission\n2. Turn up your volume\n3. The visualizer will respond to audio from your speakers\n\nAlternative: Enable "Stereo Mix" or "Loopback" in your system audio settings for better quality.');
    }
}

async function getCurrentAlbumArtURL(): Promise<string | null> {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
            'Authorization': `Bearer ${spotifyAccessToken}`
        }
    });

    if (response.status == 204 || !response.ok) {
        console.log('No track currently playing');
        return null;
    }

    const data = await response.json();
    return data.item?.album?.images[0]?.url || null;
}
// ==================== FALLBACK AUDIO FUNCTIONS ====================

function setupMicrophone(): void {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            console.log("Microphone connected!");
        })
        .catch(err => {
            console.error("Microphone access denied:", err);
        });
}

function setupMP3Audio(): void {
    const audio = document.getElementById("music") as HTMLAudioElement;
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
}

// ==================== MAIN INITIALIZATION ====================

window.onload = async function init() {
    console.log('=== MUSIC VISUALIZER INIT ===');

    // Initialize WebGL
    canvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
    gl = canvas.getContext('webgl2', { antialias: true }) as WebGLRenderingContext;
    if (!gl) {
        alert("WebGL isn't available");
        return;
    }

    // Check for stored token or callback code
    const storedToken = localStorage.getItem("spotify_access_token");
    const tokenExpiry = localStorage.getItem("spotify_token_expiry");
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    const statusEl = document.getElementById("status");

    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        // Use existing valid token
        console.log("✅ Using stored token");
        spotifyAccessToken = storedToken;
        if (statusEl) statusEl.textContent = "Status: Initializing Spotify...";

        try {
            await initSpotifyPlayer(spotifyAccessToken);
            console.log('✅ Spotify player initialized!');
            if (statusEl) statusEl.textContent = 'Status: ✅ Spotify ready! Click Start Playback.';
            // Don't try to connect audio yet - wait until playback starts
        } catch (error) {
            console.error('❌ Spotify initialization failed:', error);
            if (statusEl) statusEl.textContent = 'Status: Spotify failed. Using microphone.';
            setupMicrophone();
        }

    } else if (code) {
        // Exchange code for token
        console.log("📝 Exchanging authorization code for token...");
        if (statusEl) statusEl.textContent = "Status: Getting access token...";

        try {
            const tokenData = await getAccessToken(SPOTIFY_CLIENT_ID, code);

            // Store token and expiry
            spotifyAccessToken = tokenData.access_token;
            localStorage.setItem("spotify_access_token", tokenData.access_token);
            localStorage.setItem("spotify_token_expiry", (Date.now() + (tokenData.expires_in * 1000)).toString());

            if (tokenData.refresh_token) {
                localStorage.setItem("spotify_refresh_token", tokenData.refresh_token);
            }

            console.log("✅ Access token received and stored");

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Initialize Spotify player
            if (statusEl) statusEl.textContent = "Status: Initializing Spotify player...";
            await initSpotifyPlayer(spotifyAccessToken);
            console.log('✅ Spotify player initialized!');
            if (statusEl) statusEl.textContent = 'Status: ✅ Spotify ready! Click Start Playback.';
            // Don't connect audio yet - wait for playback to start

        } catch (error) {
            console.error("❌ Error exchanging code:", error);
            localStorage.removeItem("spotify_access_token");
            localStorage.removeItem("spotify_token_expiry");
            if (statusEl) statusEl.textContent = 'Status: Authentication failed. Using microphone.';
            setupMicrophone();
        }

    } else {
        // No token, no code - use fallback
        console.log("No Spotify token, using microphone/MP3");
        if (statusEl) statusEl.textContent = "Status: Using microphone. Login with Spotify for playlist.";
        
        if (spotify) {
            setupMicrophone();
        } else {
            setupMP3Audio();
        }
    }

    // Setup WebGL
    canvas.addEventListener("mousedown", mouse_down);
    canvas.addEventListener("mousemove", mouse_drag);
    canvas.addEventListener("mouseup", mouse_up);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);
    
    umv = gl.getUniformLocation(program, "model_view");
    uproj = gl.getUniformLocation(program, "projection");
    uTextureSampler = gl.getUniformLocation(program, "textureSampler");

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    p = perspective(zoom, (canvas.clientWidth / canvas.clientHeight), 1, 20);
    gl.uniformMatrix4fv(uproj, false, p.flatten());

    initBaseNoise();
    marbleTex = initTexture(256, 256);
    morphedAlbumTex = initTexture(256, 256);
    initTexturesImage();
    graphTex = initTexture(256, 256);
    turbTex = initTexture(256, 256);
    makeSquareAndBuffer();

    xAngle = 0;
    yAngle = 0;

    // Button handlers
    document.getElementById("start")!.addEventListener("click", async () => {
        console.log('▶️ Start button clicked');

        if (spotifyAccessToken && spotifyPlayer) {
            console.log('Starting Spotify playback...');
            await audioCtx.resume();

            // Get playlist URI from input
            const playlistUri = getPlaylistUri();
            
            if (playlistUri === '') {
                return; // Error already shown in getPlaylistUri
            }
            
            if (playlistUri === null) {
                // No playlist entered - resume current playback
                console.log('No playlist specified, resuming current playback...');
                if (statusEl) statusEl.textContent = 'Status: 🎵 Resuming current playback...';
                await resumeCurrentPlayback();
            } else {
                // Play the specified playlist
                console.log('Playing playlist:', playlistUri);
                if (statusEl) statusEl.textContent = 'Status: 🎵 Starting playlist...';
                await playSpotifyUri(playlistUri);
            }
            
            // Wait a bit for the audio element to be created and try to connect
            console.log('Waiting for Spotify audio to start...');
            setTimeout(() => {
                connectSpotifyToAnalyser();
            }, 2000);

            setTimeout(async () => {
            albumArtUrl = await getCurrentAlbumArtURL();
            if (albumArtUrl) {
                console.log('🎨 Album art URL:', albumArtUrl);
                updateAlbumArt(albumArtUrl); // ← Add this line

                // TODO: Use this URL to display album art or apply to texture
            }
            connectSpotifyToAnalyser();
        }, 2000);
            
        } else {
            console.log('Using fallback audio');
            audioCtx.resume().then(() => {
                if (!spotify) {
                    const audio = document.getElementById("music") as HTMLAudioElement;
                    audio.play();
                }
                console.log("Started!");
            });
        }
    });

    document.getElementById("pause")?.addEventListener("click", async () => {
    console.log('⏸️ Pause button clicked');
    await pausePlayback();
});

    document.getElementById("spotify-login")?.addEventListener("click", () => {
        console.log('🔐 Login button clicked');
        redirectToAuthCodeFlow(SPOTIFY_CLIENT_ID);
    });

    document.getElementById("retry-audio")?.addEventListener("click", () => {
        console.log('🔄 Retry audio connection clicked');
        spotifyAudioConnected = false; // Reset flag
        connectSpotifyToAnalyser();
    });

    document.getElementById("shuffle")?.addEventListener("click", async () => {
        console.log('🔀 Shuffle button clicked');
        if (spotifyAccessToken) {
            await toggleShuffle(true);
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.textContent = 'Status: 🔀 Shuffle enabled!';
            setTimeout(() => {
                if (statusEl) statusEl.textContent = 'Status: 🎵 Playing!';
            }, 2000);
        }
    });

    document.getElementById("next")?.addEventListener("click", async () => {
        console.log('⏭️ Next button clicked');
        if (spotifyAccessToken) {
            await skipToNext();
        }
    });

    document.getElementById("previous")?.addEventListener("click", async () => {
        console.log('⏮️ Previous button clicked');
        if (spotifyAccessToken) {
            await skipToPrevious();
        }
    });

    // Keyboard controls
    window.addEventListener("keydown", event => {
        switch (event.key) {
            case "ArrowDown":
                if (zoom < 170) zoom += 5;
                break;
            case "ArrowUp":
                if (zoom > 10) zoom -= 5;
                break;
            case "r": r++; break;
            case "g": g++; break;
            case "b": b++; break;
            case "m": marbleMode = !marbleMode; break;
            case "c": colorMode = !colorMode; break;
            case "t": r--; break;
            case "h": g--; break;
            case "n": b--; break;
            case "a": albumMode = !albumMode; break;
            case "1": mode[0] ^= 1; break;
            case "2": mode[1] ^= 1; break;
            case "3": mode[2] ^= 1; break;
        }

        p = perspective(zoom, (canvas.clientWidth / canvas.clientHeight), 1, 20);
        gl.uniformMatrix4fv(uproj, false, p.flatten());
        requestAnimationFrame(render);
    });

    window.setInterval(update, 32);
    requestAnimationFrame(render);

    console.log('=== INIT COMPLETE ===');
};

// ==================== WEBGL RENDERING FUNCTIONS ====================

function makeSquareAndBuffer(): void {
    let squarePoints: any[] = [];

    let a = 1;
    let b = 1;

    squarePoints.push(new vec4(-1, -1, 0, 1));
    squarePoints.push(new vec2(0, 0));
    squarePoints.push(new vec4(1, -1, 0, 1));
    squarePoints.push(new vec2(a, 0));
    squarePoints.push(new vec4(1, 1, 0, 1));
    squarePoints.push(new vec2(a, b));
    squarePoints.push(new vec4(-1, 1, 0, 1));
    squarePoints.push(new vec2(0, b));

    let bufferId: WebGLBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(squarePoints), gl.STATIC_DRAW);

    vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(vPosition);

    vTexCoord = gl.getAttribLocation(program, "texCoord");
    gl.vertexAttribPointer(vTexCoord, 2, gl.FLOAT, false, 24, 16);
    gl.enableVertexAttribArray(vTexCoord);
}

function mouse_drag(event: MouseEvent): void {
    let thetaY: number, thetaX: number;
    if (mouse_button_down) {
        thetaY = 360.0 * (event.clientX - prevMouseX) / canvas.clientWidth;
        thetaX = 360.0 * (event.clientY - prevMouseY) / canvas.clientHeight;
        prevMouseX = event.clientX;
        prevMouseY = event.clientY;
        xAngle += thetaX;
        yAngle += thetaY;
    }
    requestAnimationFrame(render);
}

function mouse_down(event: MouseEvent): void {
    mouse_button_down = true;
    prevMouseX = event.clientX;
    prevMouseY = event.clientY;
    requestAnimationFrame(render);
}

function mouse_up(): void {
    mouse_button_down = false;
    requestAnimationFrame(render);
}

// ==================== NOISE GENERATION ====================

function initBaseNoise(): void {
    noise = [];
    for (let y = 0; y < noiseHeight; y++) {
        noise[y] = [];
        for (let x = 0; x < noiseWidth; x++) {
            noise[y][x] = Math.random();
        }
    }
}

function smoothNoise(x: number, y: number): number {
    let fractX = x - Math.floor(x);
    let fractY = y - Math.floor(y);

    let x1 = (Math.floor(x) + noiseWidth) % noiseWidth;
    let y1 = (Math.floor(y) + noiseHeight) % noiseHeight;

    let x2 = (x1 + noiseWidth - 1) % noiseWidth;
    let y2 = (y1 + noiseHeight - 1) % noiseHeight;

    let value = 0.0;
    value += fractX * fractY * noise[y1][x1];
    value += (1 - fractX) * fractY * noise[y1][x2];
    value += fractX * (1 - fractY) * noise[y2][x1];
    value += (1 - fractX) * (1 - fractY) * noise[y2][x2];

    return value;
}

function turbulence(x: number, y: number, size: number): number {
    let value = 0.0;
    let initialSize = size;

    while (size >= 1) {
        value += smoothNoise(x / size, y / size) * size;
        size /= 2.0;
    }

    return (128.0 * value / initialSize);
}

function initTexture(width: number, height: number): WebGLTexture {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texture;
}

function initTexturesImage() {
    imageTex = gl.createTexture();
    let marbleImage = new Image();
    marbleImage.crossOrigin = "anonymous";
    marbleImage.onload = function() { handleTextureLoaded(marbleImage, imageTex); };
    marbleImage.src = albumArtUrl || 'default_album_art.jpg';
}

function updateAlbumArt(url: string) {
    let marbleImage = new Image();
    marbleImage.crossOrigin = "anonymous";
    marbleImage.onload = function() { 
        handleTextureLoaded(marbleImage, imageTex);
        requestAnimationFrame(render); // Re-render after loading
    };
    marbleImage.onerror = function() {
        console.error('Failed to load album art from:', url);
    };
    marbleImage.src = url;
}

function handleTextureLoaded(image: HTMLImageElement, texture: WebGLTexture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    // Extract pixel data for morphing
    if (!albumArtCanvas) {
        albumArtCanvas = document.createElement('canvas');
        albumArtCanvas.width = 256;
        albumArtCanvas.height = 256;
        albumArtContext = albumArtCanvas.getContext('2d');
    }
    
    if (albumArtContext) {
        albumArtContext.drawImage(image, 0, 0, 256, 256);
        albumArtImageData = albumArtContext.getImageData(0, 0, 256, 256);
    }
}

function makeAllTextures(width: number, height: number): void {
    const marblePixels = new Uint8ClampedArray(width * height * 4);
    const octavePixels = new Uint8ClampedArray(width * height * 4);
    const graphPixels = new Uint8ClampedArray(width * height * 4);
    const morphedPixels = new Uint8ClampedArray(width * height * 4); // ← Add this

    let xPeriod = 2.0;
    let yPeriod = 5.0;
    let turbPower = 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let bassNoise = mode[0] ? turbulence(x, y, 64) * bass : 0;
            let midNoise = mode[1] ? turbulence(x, y, 16) * mid : 0;
            let highNoise = mode[2] ? turbulence(x, y, 4) * high * .5 : 0;
            let combinedTurb = bassNoise + midNoise + highNoise;

            let idx = 4 * (width * y + x);

            // MARBLE TEXTURE
            let xyValue = x * xPeriod / noiseWidth + y * yPeriod / noiseHeight + turbPower * combinedTurb / 256.0;
            let sineValue = 256 * Math.abs(Math.sin(xyValue * 3.14159));
            let c = Math.floor(sineValue);

            let cr = colorMode ? bass * 100 : 0;
            let cg = colorMode ? mid * 100 : 0;
            let cb = colorMode ? high * 100 : 0;

            marblePixels[idx] = cr + c + r;
            marblePixels[idx + 1] = cg + c + g;
            marblePixels[idx + 2] = cb + c + b;
            marblePixels[idx + 3] = 255;

            // OCTAVE TEXTURE
            octavePixels[idx] = Math.floor(bassNoise);
            octavePixels[idx + 1] = Math.floor(midNoise);
            octavePixels[idx + 2] = Math.floor(highNoise * 2);
            octavePixels[idx + 3] = 255;

            // GRAPH TEXTURE
            let audioIndex = Math.floor((x / width) * bufferLength);
            let value = dataArray[audioIndex];
            let barHeight = (value / 255) * height;
            let brightness = y < barHeight ? value : 0;

            graphPixels[idx] = brightness;
            graphPixels[idx + 1] = brightness;
            graphPixels[idx + 2] = brightness;
            graphPixels[idx + 3] = 255;

            // MORPHED ALBUM ART TEXTURE
            if (albumArtImageData) {
                // Displace the sampling position based on turbulence
                let displacement = combinedTurb * 0.2; // Adjust strength
                let sourceX = Math.floor(x + displacement) % width;
                let sourceY = Math.floor(y + displacement) % height;
                
                // Wrap around if negative
                if (sourceX < 0) sourceX += width;
                if (sourceY < 0) sourceY += height;
                
                let sourceIdx = 4 * (width * sourceY + sourceX);
                
                // Mix album art with turbulence color
                let mixAmount = combinedTurb / 256; // 0-1 range
                morphedPixels[idx] = albumArtImageData.data[sourceIdx] * (1 - mixAmount * 0.3) + octavePixels[idx] * mixAmount * 0.3;
                morphedPixels[idx + 1] = albumArtImageData.data[sourceIdx + 1] * (1 - mixAmount * 0.3) + octavePixels[idx + 1] * mixAmount * 0.3;
                morphedPixels[idx + 2] = albumArtImageData.data[sourceIdx + 2] * (1 - mixAmount * 0.3) + octavePixels[idx + 2] * mixAmount * 0.3;
                morphedPixels[idx + 3] = 255;
            } else {
                // Fallback if no album art loaded
                morphedPixels[idx] = octavePixels[idx];
                morphedPixels[idx + 1] = octavePixels[idx + 1];
                morphedPixels[idx + 2] = octavePixels[idx + 2];
                morphedPixels[idx + 3] = 255;
            }
        }
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.bindTexture(gl.TEXTURE_2D, marbleTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, marblePixels);

    gl.bindTexture(gl.TEXTURE_2D, turbTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, octavePixels);

    gl.bindTexture(gl.TEXTURE_2D, graphTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, graphPixels);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.bindTexture(gl.TEXTURE_2D, morphedAlbumTex); // ← Add this
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, morphedPixels);
}

function update(): void {
    analyser.getByteFrequencyData(dataArray);

    setTimeout(async () => {
            albumArtUrl = await getCurrentAlbumArtURL();
            if (albumArtUrl) {
                console.log('🎨 New album art:', albumArtUrl);
                updateAlbumArt(albumArtUrl);
            }
        }, 3000);

    // Debug: Log audio data every 3 seconds
    if (Math.random() < 0.1) { // ~10% chance = roughly every 3 seconds
        const sum = dataArray.reduce((a, b) => a + b, 0);
        console.log('Audio data check - Sum:', sum, 'Bass:', bass.toFixed(2), 'Mid:', mid.toFixed(2), 'High:', high.toFixed(2));
    }

    bass = dataArray.slice(0, lowLimit).reduce((a, b) => a + b, 0) / lowLimit / 255;
    mid = dataArray.slice(lowLimit, midLimit).reduce((a, b) => a + b, 0) / (midLimit - lowLimit) / 255;
    high = dataArray.slice(midLimit, highLimit).reduce((a, b) => a + b, 0) / (highLimit - midLimit) / 255;

    makeAllTextures(256, 256);
    requestAnimationFrame(render);
}

function render(): void {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let base = lookAt(new vec4(0, 0, 3, 1), new vec4(0, 0, 0, 1), new vec4(0, 1, 0, 0));

    // Left panel - Marble texture
    mv = base.mult(rotateY(yAngle).mult(rotateX(xAngle)).mult(translate(-1.25, 0, 0)).mult(scalem(.6, .6, .6)));
    gl.uniformMatrix4fv(umv, false, mv.flatten());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, albumMode ? morphedAlbumTex : marbleTex);
    gl.uniform1i(uTextureSampler, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // Right panel - Graph texture
    mv = base.mult(rotateY(yAngle).mult(rotateX(xAngle)).mult(translate(1.25, 0, 0)).mult(scalem(.6, .6, .6)));
    gl.uniformMatrix4fv(umv, false, mv.flatten());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, graphTex);
    gl.uniform1i(uTextureSampler, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // Center panel - Turbulence texture
    mv = base.mult(rotateY(yAngle).mult(rotateX(xAngle)).mult(translate(0, 0, 0)).mult(scalem(.6, .6, .6)));
    gl.uniformMatrix4fv(umv, false, mv.flatten());
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, turbTex);
    gl.uniform1i(uTextureSampler, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

// Declare Spotify types for TypeScript
declare global {
    interface Window {
        Spotify: any;
        onSpotifyWebPlaybackSDKReady: () => void;
    }
}
Prerequisites
To run this program successfully you will need

A Node.js LTS environment or later.
npm version 7 or later.
A Spotify account.
Visual Studio Code (Recommended).

Open this project in your IDE, navigate to the innermost "spotify" folder ("cd .\spotify\" in the terminal), run "npm install" in the terminal, then "npm run dev". This will give you the local host url running the program. From there, you can log in and play.

What's Happening

Collecting Input
This program plays an MP3 file from the HTML file, then uses the music data from that to make the textures.
This project uses the Web Audio API to capture audio data from the audio that it hears. It splits the audio by frequency into a 512-length array every frame (30 fps) that can be used by the program.

Processing Audio Data
The frequency data is divided into three ranges:
Bass (indices 0–100)
Mid (100–200)
High (200–300)
Each range is averaged and normalized between 0 and 1, which can be used to change the textures.

You can toggle each range with keys 1, 2, 3.
(We only use indices 0–300, since the upper end is often unused.)

Generating Procedural Textures
Three different textures are generated every frame, each responding to the audio.

Left Panel – Marble Texture
Uses a Perlin noise algorithm to morph the base sine pattern into an interesting marble design.
Bass creates large warps
Mid creates smaller swirls
High creates fine fuzz/detail

Center Panel – Turbulence Visualization
Displays the turbulence function output for each range as color:
Red = Bass
Green = Mid
Blue = High
This helps visualize how each region of the texture is affected by Perlin noise.

Right Panel – Frequency Graph
Displays the audio data as a bar graph, showing how intense each range of frequencies is.

The Noise Algorithm

Base Random Noise

A base grid of random static noise is created at startup and reused throughout the program.
This static noise helps influence the texture into an interesting marble pattern.

Smooth Noise Function
Since random static looks harsh, the noise is smoothed using bilinear interpolation.
Fractional coordinates are used to blend the four nearest grid points, weighted by distance. This creates smooth color transitions instead of static-like noise.

Turbulence Function
The turbulence function creates multiple levels of detail and integrates the audio data.
The function takes an initial size and samples the texture over a (256 / size) × (256 / size) range.

Example:
If the initial size is 64, the texture is sampled over a 4×4 grid.
Larger initial sizes produce broad, large-scale patterns, while smaller sizes add fine detail.
The function repeatedly halves the size (64 → 32 → 16 → … → 1), stacking values until size reaches 1.
Each audio range uses a different initial size:
Bass: 64
Mid: 16
High: 4
This gives each frequency band a distinct visual influence.

Audio Integration
After calculating turbulence for each range, the result is multiplied by its corresponding audio value.
This weighting allows bass, mid, and high frequencies to dynamically control how strongly they affect the final texture.

Color Controls
Using the controls above, you can manually change the color of the texture.
You can also enable color mode, which automatically changes the texture color based on the amount of bass, mid, and high frequencies present.

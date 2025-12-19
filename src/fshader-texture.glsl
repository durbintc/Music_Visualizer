#version 300 es
precision mediump float;

in vec2 ftexCoord; //interpolated texture coordinate for this fragment
uniform sampler2D textureSampler; //connected to memory with colors we can look up

out vec4  fColor;

void main()
{
	//use texture coordinates to look up color for this fragment from sampler
	fColor = texture(textureSampler, ftexCoord);


}
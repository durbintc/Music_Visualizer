#version 300 es

in vec4 vPosition;
in vec2 texCoord;

out vec2 ftexCoord;

uniform mat4 model_view;
uniform mat4 projection;
void main()
{	

	ftexCoord = texCoord;

	gl_Position = projection * model_view*vPosition;
	

}
precision mediump float;

// our texcoords from the vertex shader
varying vec2 vTexCoord;

// the texture that we want to manipulate
uniform sampler2D tex0;

// how big of a step to take. 1.0 / width = 1 texel
// doing this math in p5 saves a little processing power
uniform vec2 stepSize;
uniform float dist;

const int ksize = 7;

// an array with 9 vec2's
// each index in the array will be a step in a different direction around a pixel
// upper left, upper middle, upper right
// middle left, middle, middle right
// lower left, lower middle, lower right
vec2 offset[ksize*ksize];

// the convolution kernel we will use
// different kernels produce different effects
// we can do things like, emboss, sharpen, blur, etc.
float horizkernel[ksize*ksize];
float vertkernel[ksize*ksize];

// our final convolution value that will be rendered to the screen
vec4 horizconv = vec4(0.0);
vec4 vertconv = vec4(0.0);

// this is a common glsl function of unknown origin to convert rgb colors to luminance
// it performs a dot product of the input color against some known values that account for our eyes perception of brighness
// i pulled this one from here https://github.com/hughsk/glsl-luma/blob/master/index.glsl
float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}


void main(){

	// Setup

	// This definitely works
	for (int j = 0; j < ksize; j++) {
		for (int i = 0; i < ksize; i++) {
			if (i == ksize/2 && j == ksize/2) {
				horizkernel[i+j*ksize] = 0.0;
				vertkernel[i+j*ksize] = 0.0;
			} else {
				float xloc = float(i - ksize/2);
				float yloc = float(j - ksize/2);
				horizkernel[i+j*ksize] = xloc / float(xloc*xloc + yloc*yloc);
				vertkernel[i+j*ksize] = yloc / float(xloc*xloc + yloc*yloc);
			}
		}
	}
	

	for (int j = 0; j < ksize; j++) {
		for (int i = 0; i < ksize; i++) {
			offset[i+j*ksize] = vec2((float(i-ksize/2)) * stepSize.x, float(j-ksize/2) * stepSize.y);
		}
	}

	// Actually compute this pixel
	vec2 uv = vTexCoord;
	// flip the y uvs
  	//uv.y = 1.0 - uv.y;
	// (use of framebuffer takes care of this)

	
	for(int i = 0; i < ksize*ksize; i++){
		//sample a ksizexksize grid of pixels
		vec4 color = texture2D(tex0, uv + offset[i]*dist);
	
    		// multiply the color by the kernel value and add it to our conv total
		horizconv += color * horizkernel[i];
		vertconv += color * vertkernel[i];
	}
	
	// vec4 color = texture2D(tex0, uv);
	vec2 deriv = vec2(luma(horizconv.rgb), luma(vertconv.rgb));
	//float mag = length(deriv);
	gl_FragColor = vec4(deriv.x+ 0.5, 0.5, deriv.y + 0.5, 1.0);
}
import { peelGeometry } from './geometry';
import { fragmentShader, vertexShader } from './shaders';

const uniformNames = ['page', 'shadowMap', 'renderShadow', 'size', 'axis', 'crease', 'radius', 'progress', 'paperColorToken', 'cutEdgeColor', 'cutEdgeWidth', 'rasterScale'] as const;
type UniformName = typeof uniformNames[number];

/** Two passes: a half-resolution receiver shadow, then full-resolution matte paper. */
export function createPeelRenderer(canvas: HTMLCanvasElement, image: HTMLCanvasElement, width: number, height: number, paper: string) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl || gl.isContextLost()) throw new Error('Peel context unavailable');
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let shadowTexture: WebGLTexture | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  let disposed = false;

  function destroy() {
    if (disposed) return;
    disposed = true;
    gl!.deleteTexture(texture);
    gl!.deleteTexture(shadowTexture);
    gl!.deleteFramebuffer(framebuffer);
    gl!.deleteBuffer(buffer);
    gl!.deleteProgram(program);
    canvas.width = canvas.height = 0;
  }

  function compile(type: number, source: string) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error('Peel shader allocation failed');
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader);
      gl!.deleteShader(shader);
      throw new Error(message ?? 'Peel shader compilation failed');
    }
    return shader;
  }

  function configureTexture() {
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
  }

  try {
    const scale = Math.min(2, Math.max(1.5, window.devicePixelRatio));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (Math.max(canvas.width, canvas.height, image.width, image.height) > maxTexture) throw new Error('Peel viewport exceeds texture budget');
    program = gl.createProgram();
    if (!program) throw new Error('Peel program allocation failed');
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    let fragment: WebGLShader | null = null;
    try {
      fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
    } finally {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Peel program link failed');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    texture = gl.createTexture();
    shadowTexture = gl.createTexture();
    framebuffer = gl.createFramebuffer();
    if (!buffer || !texture || !shadowTexture || !framebuffer) throw new Error('Peel resource allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'pos');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const uniforms = Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program!, name)])) as Record<UniformName, WebGLUniformLocation | null>;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    configureTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const shadowWidth = Math.ceil(width / 2);
    const shadowHeight = Math.ceil(height / 2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
    configureTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shadowWidth, shadowHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Peel shadow target incomplete');
    // Resolve the existing CSS token through the browser, including non-hex colors.
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const sample = colorCanvas.getContext('2d');
    if (!sample) throw new Error('Peel color conversion unavailable');
    sample.fillStyle = paper;
    sample.fillRect(0, 0, 1, 1);
    const color = sample.getImageData(0, 0, 1, 1).data;
    sample.fillStyle = getComputedStyle(canvas).getPropertyValue('--moss-dark').trim();
    sample.fillRect(0, 0, 1, 1);
    const moss = sample.getImageData(0, 0, 1, 1).data;
    colorCanvas.width = colorCanvas.height = 0;
    gl.uniform3f(uniforms.paperColorToken, color[0] / 255, color[1] / 255, color[2] / 255);
    gl.uniform3f(uniforms.cutEdgeColor,
      (color[0] * .82 + moss[0] * .18) / 255,
      (color[1] * .82 + moss[1] * .18) / 255,
      (color[2] * .82 + moss[2] * .18) / 255);
    gl.uniform1f(uniforms.cutEdgeWidth, 1.25);
    gl.uniform1f(uniforms.rasterScale, Math.min(canvas.width / width, canvas.height / height));
    gl.uniform1i(uniforms.page, 0);
    gl.uniform1i(uniforms.shadowMap, 1);
    gl.uniform2f(uniforms.size, width, height);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Peel texture upload failed');

    return {
      draw(progress: number, side: number) {
        if (disposed || gl.isContextLost()) throw new Error('Peel context lost');
        const geometry = peelGeometry(progress, width, height, side);
        gl.useProgram(program);
        gl.uniform2f(uniforms.axis, geometry.axis.x, geometry.axis.y);
        gl.uniform1f(uniforms.crease, geometry.crease);
        gl.uniform1f(uniforms.radius, geometry.radius);
        gl.uniform1f(uniforms.progress, geometry.progress);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Do not bind the shadow target as a sampler while rendering into it.
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, shadowWidth, shadowHeight);
        gl.uniform1f(uniforms.renderShadow, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
        gl.uniform1f(uniforms.renderShadow, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Peel draw failed');
        return geometry.clip;
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}

export type PeelRenderer = ReturnType<typeof createPeelRenderer>;

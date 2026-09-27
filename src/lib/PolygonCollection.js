import {GLCollection, defineProgram} from 'w-gl';

/**
 * Renders filled polygons as a single batch of solid colored triangles.
 * Vertices are added in triangle order (see `addTriangles()`).
 */
export default class PolygonCollection extends GLCollection {
  constructor(gl, capacity) {
    super(defineProgram({
      gl,
      capacity,
      vertex: `
  uniform mat4 modelViewProjection;
  attribute vec2 point;

  void main() {
    gl_Position = modelViewProjection * vec4(point, 0.0, 1.0);
  }`,
      fragment: `
  precision highp float;
  uniform vec4 color;

  void main() {
    gl_FragColor = color;
  }`
    }));
    this.color = {r: 0, g: 0, b: 0, a: 1};
  }

  /**
   * @param {number[]} coords flat [x0, y0, x1, y1, ...] vertex coordinates
   * @param {number[]} indices triangle vertex indices into `coords`
   */
  addTriangles(coords, indices) {
    for (let i = 0; i < indices.length; ++i) {
      let offset = indices[i] * 2;
      this.add({point: [coords[offset], coords[offset + 1]]});
    }
  }

  draw() {
    if (!this.uniforms) {
      this.uniforms = {
        modelViewProjection: this.modelViewProjection,
        color: new Float32Array(4)
      };
    }
    let {r, g, b, a} = this.color;
    let c = this.uniforms.color;
    c[0] = r; c[1] = g; c[2] = b; c[3] = a;

    this.program.draw(this.uniforms);
  }
}

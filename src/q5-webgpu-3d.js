/**
 * q5.js 3D WebGPU Renderer Extension
 * Standalone add-on for 3D graphics in q5.js
 */

(function () {
	if (typeof Q5 === 'undefined') return;

	// Alias for p5.js compatibility
	Q5.WEBGL = '3d';
	Q5['3D'] = '3d';

	// Matrix4 Math Utilities (Float32Array 16 elements, Column-Major)
	const Mat4 = {
		identity() {
			return new Float32Array([
				1, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, 0, 1
			]);
		},
		perspective(fovy, aspect, near, far) {
			const f = 1.0 / Math.tan(fovy / 2);
			const nf = 1 / (near - far);
			const out = new Float32Array(16);
			out[0] = f / aspect;
			out[5] = f;
			out[10] = far * nf;
			out[11] = -1;
			out[14] = near * far * nf;
			return out;
		},
		ortho(left, right, bottom, top, near, far) {
			const lr = 1 / (left - right);
			const bt = 1 / (bottom - top);
			const nf = 1 / (near - far);
			const out = new Float32Array(16);
			out[0] = -2 * lr;
			out[5] = -2 * bt;
			out[10] = nf;
			out[12] = (left + right) * lr;
			out[13] = (top + bottom) * bt;
			out[14] = near * nf;
			out[15] = 1;
			return out;
		},
		lookAt(eye, center, up) {
			const z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
			let len = 1 / (Math.hypot(z0, z1, z2) || 1);
			const zx = z0 * len, zy = z1 * len, zz = z2 * len;

			const x0 = up[1] * zz - up[2] * zy, x1 = up[2] * zx - up[0] * zz, x2 = up[0] * zy - up[1] * zx;
			len = 1 / (Math.hypot(x0, x1, x2) || 1);
			const xx = x0 * len, xy = x1 * len, xz = x2 * len;

			const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

			const out = new Float32Array(16);
			out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
			out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
			out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
			out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
			out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
			out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
			out[15] = 1;
			return out;
		},
		multiply(a, b) {
			const out = new Float32Array(16);
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					out[j * 4 + i] =
						a[i] * b[j * 4 + 0] +
						a[4 + i] * b[j * 4 + 1] +
						a[8 + i] * b[j * 4 + 2] +
						a[12 + i] * b[j * 4 + 3];
				}
			}
			return out;
		},
		translate(m, v) {
			const out = new Float32Array(m);
			out[12] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
			out[13] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
			out[14] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
			out[15] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
			return out;
		},
		rotateX(m, rad) {
			const s = Math.sin(rad), c = Math.cos(rad);
			const out = new Float32Array(m);
			const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
			const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
			out[4] = a10 * c + a20 * s;
			out[5] = a11 * c + a21 * s;
			out[6] = a12 * c + a22 * s;
			out[7] = a13 * c + a23 * s;
			out[8] = a20 * c - a10 * s;
			out[9] = a21 * c - a11 * s;
			out[10] = a22 * c - a12 * s;
			out[11] = a23 * c - a13 * s;
			return out;
		},
		rotateY(m, rad) {
			const s = Math.sin(rad), c = Math.cos(rad);
			const out = new Float32Array(m);
			const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
			const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
			out[0] = a00 * c - a20 * s;
			out[1] = a01 * c - a21 * s;
			out[2] = a02 * c - a22 * s;
			out[3] = a03 * c - a23 * s;
			out[8] = a00 * s + a20 * c;
			out[9] = a01 * s + a21 * c;
			out[10] = a02 * s + a22 * c;
			out[11] = a03 * s + a23 * c;
			return out;
		},
		rotateZ(m, rad) {
			const s = Math.sin(rad), c = Math.cos(rad);
			const out = new Float32Array(m);
			const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
			const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
			out[0] = a00 * c + a10 * s;
			out[1] = a01 * c + a12 * s;
			out[2] = a02 * c + a12 * s;
			out[3] = a03 * c + a13 * s;
			out[4] = a10 * c - a00 * s;
			out[5] = a11 * c - a01 * s;
			out[6] = a12 * c - a02 * s;
			out[7] = a13 * c - a03 * s;
			return out;
		},
		scale(m, v) {
			const out = new Float32Array(m);
			out[0] = m[0] * v[0]; out[1] = m[1] * v[0]; out[2] = m[2] * v[0]; out[3] = m[3] * v[0];
			out[4] = m[4] * v[1]; out[5] = m[5] * v[1]; out[6] = m[6] * v[1]; out[7] = m[7] * v[1];
			out[8] = m[8] * v[2]; out[9] = m[9] * v[2]; out[10] = m[10] * v[2]; out[11] = m[11] * v[2];
			return out;
		}
	};

	Q5.renderers ??= {};
	Q5.renderers['3d'] = {};

	Q5.renderers['3d'].canvas = ($, q) => {
		const c = $.canvas;
		let ctx = null;
		let depthTexture = null;

		// Matrix stack
		let modelMatrix = Mat4.identity();
		const matrixStack = [];

		// Camera defaults
		let eye = [0, 0, 400];
		let center = [0, 0, 0];
		let up = [0, 1, 0];
		let fovy = Math.PI / 3;
		let near = 0.1;
		let far = 5000;

		// Lighting defaults
		let ambientLightColor = [0.25, 0.25, 0.25];
		let dirLightColor = [0.85, 0.85, 0.85];
		let dirLightDir = [0.577, 0.577, 0.577];
		let pointLightPos = [0, 0, 0];
		let pointLightColor = [0, 0, 0, 0]; // alpha <= 0 means disabled
		let spotLightPos = [0, 0, 0];
		let spotLightDir = [0, 0, -1, Math.PI / 6]; // xyz: dir, w: angle
		let spotLightColor = [0, 0, 0, 0]; // alpha <= 0 means disabled

		// Styles
		let currentFill = [0.8, 0.8, 0.8, 1.0];
		let currentStroke = [0.0, 0.0, 0.0, 1.0];
		let hasFill = true;
		let hasStroke = true;
		let strokeThickness = 1.0;

		// Orbit control state
		let orbitEnabled = false;
		let rotX = 0, rotY = 0;

		// Geometry vertex arrays: [pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, col.r, col.g, col.b, col.a] (10 floats per vertex)
		const FLOATS_PER_VERTEX = 10;
		let triVertices = [];
		let lineVertices = [];

		// WebGPU Pipelines & Buffers
		let triPipeline = null;
		let linePipeline = null;
		let uniformBuffer = null;
		let bindGroup = null;
		let triVertexBuffer = null;
		let lineVertexBuffer = null;
		let triBufferCapacity = 0;
		let lineBufferCapacity = 0;

		const shaderCode = /* wgsl */ `
			struct Uniforms {
				u_mvp : mat4x4<f32>,
				u_ambientColor : vec4<f32>,
				u_dirColor : vec4<f32>,
				u_dirDir : vec4<f32>,
				u_pointPos : vec4<f32>,
				u_pointColor : vec4<f32>,
				u_spotPos : vec4<f32>,
				u_spotDir : vec4<f32>,
				u_spotColor : vec4<f32>
			};

			@group(0) @binding(0) var<uniform> uniforms : Uniforms;

			struct VertexInput {
				@location(0) position : vec3<f32>,
				@location(1) normal : vec3<f32>,
				@location(2) color : vec4<f32>
			};

			struct VertexOutput {
				@builtin(position) position : vec4<f32>,
				@location(0) v_color : vec4<f32>,
				@location(1) v_normal : vec3<f32>,
				@location(2) v_worldPos : vec3<f32>
			};

			@vertex
			fn vs_main(in : VertexInput) -> VertexOutput {
				var out : VertexOutput;
				out.position = uniforms.u_mvp * vec4<f32>(in.position, 1.0);
				out.v_color = in.color;
				out.v_normal = in.normal;
				out.v_worldPos = in.position;
				return out;
			}

			@fragment
			fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
				var n : vec3<f32> = normalize(in.v_normal);
				
				// 1. Ambient Light
				var totalLight : vec3<f32> = uniforms.u_ambientColor.rgb;

				// 2. Directional Light
				var lDir : vec3<f32> = normalize(uniforms.u_dirDir.xyz);
				var diffDir : f32 = max(dot(n, lDir), 0.0);
				totalLight += uniforms.u_dirColor.rgb * diffDir;

				// 3. Point Light (with attenuation)
				if (uniforms.u_pointColor.a > 0.0) {
					var pVec : vec3<f32> = uniforms.u_pointPos.xyz - in.v_worldPos;
					var dist : f32 = length(pVec);
					var pDir : vec3<f32> = normalize(pVec);
					var diffPoint : f32 = max(dot(n, pDir), 0.0);
					var atten : f32 = 1.0 / (1.0 + 0.005 * dist + 0.00005 * dist * dist);
					totalLight += uniforms.u_pointColor.rgb * diffPoint * atten;
				}

				// 4. Spot Light (with cone cutoff & attenuation)
				if (uniforms.u_spotColor.a > 0.0) {
					var sVec : vec3<f32> = uniforms.u_spotPos.xyz - in.v_worldPos;
					var sDist : f32 = length(sVec);
					var sDir : vec3<f32> = normalize(sVec);
					var spotAngle : f32 = dot(-sDir, normalize(uniforms.u_spotDir.xyz));
					var cutoff : f32 = cos(uniforms.u_spotDir.w);
					if (spotAngle > cutoff) {
						var spotDiff : f32 = max(dot(n, sDir), 0.0);
						var spotAtten : f32 = 1.0 / (1.0 + 0.003 * sDist);
						var intensity : f32 = clamp((spotAngle - cutoff) / (1.0 - cutoff), 0.0, 1.0);
						totalLight += uniforms.u_spotColor.rgb * spotDiff * spotAtten * intensity;
					}
				}

				return vec4<f32>(in.v_color.rgb * totalLight, in.v_color.a);
			}

			@vertex
			fn vs_unlit(in : VertexInput) -> VertexOutput {
				var out : VertexOutput;
				out.position = uniforms.u_mvp * vec4<f32>(in.position, 1.0);
				out.v_color = in.color;
				return out;
			}

			@fragment
			fn fs_unlit(in : VertexOutput) -> @location(0) vec4<f32> {
				return in.v_color;
			}
		`;

		function initPipelines() {
			if (!Q5.device) return;
			const device = Q5.device;
			const format = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';

			const shaderModule = device.createShaderModule({
				label: 'q5_3d_shader',
				code: shaderCode
			});

			const uniformLayout = device.createBindGroupLayout({
				label: 'q5_3d_uniform_layout',
				entries: [{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				}]
			});

			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [uniformLayout]
			});

			const vertexBufferLayout = {
				arrayStride: FLOATS_PER_VERTEX * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: 'float32x3' },
					{ shaderLocation: 1, offset: 12, format: 'float32x3' },
					{ shaderLocation: 2, offset: 24, format: 'float32x4' }
				]
			};

			// Triangle Pipeline with Depth & Lighting
			triPipeline = device.createRenderPipeline({
				label: 'q5_3d_tri_pipeline',
				layout: pipelineLayout,
				vertex: {
					module: shaderModule,
					entryPoint: 'vs_main',
					buffers: [vertexBufferLayout]
				},
				fragment: {
					module: shaderModule,
					entryPoint: 'fs_main',
					targets: [{
						format: format,
						blend: {
							color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
							alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
						}
					}]
				},
				primitive: { topology: 'triangle-list', cullMode: 'none' },
				depthStencil: {
					depthWriteEnabled: true,
					depthCompare: 'less',
					format: 'depth24plus'
				}
			});

			// Line Pipeline (Unlit)
			linePipeline = device.createRenderPipeline({
				label: 'q5_3d_line_pipeline',
				layout: pipelineLayout,
				vertex: {
					module: shaderModule,
					entryPoint: 'vs_unlit',
					buffers: [vertexBufferLayout]
				},
				fragment: {
					module: shaderModule,
					entryPoint: 'fs_unlit',
					targets: [{
						format: format,
						blend: {
							color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
							alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
						}
					}]
				},
				primitive: { topology: 'line-list' },
				depthStencil: {
					depthWriteEnabled: true,
					depthCompare: 'less-equal',
					format: 'depth24plus'
				}
			});

			uniformBuffer = device.createBuffer({
				size: 192, // 16*4 (mvp) + 4*4*8 (ambient, dirColor, dirDir, pointPos, pointColor, spotPos, spotDir, spotColor) = 192 bytes
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
			});

			bindGroup = device.createBindGroup({
				layout: uniformLayout,
				entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
			});
		}

		function initDepth() {
			if (!Q5.device || !c.width || !c.height) return;
			if (depthTexture) depthTexture.destroy();
			depthTexture = Q5.device.createTexture({
				size: [c.width, c.height],
				format: 'depth24plus',
				usage: GPUTextureUsage.RENDER_ATTACHMENT
			});
		}

		$._createCanvas = function (w, h, opt = {}) {
			if (!navigator.gpu) return c;
			ctx = q.ctx = q.drawingContext = c.getContext('webgpu');
			if (!ctx) return c;

			const format = navigator.gpu.getPreferredCanvasFormat();
			const config = {
				device: Q5.device,
				format: format,
				alphaMode: 'premultiplied'
			};

			if (Q5.device) {
				ctx.configure(config);
				initDepth();
				initPipelines();
			} else if (typeof Q5.initWebGPU === 'function') {
				Q5.initWebGPU().then((supported) => {
					if (supported && Q5.device) {
						config.device = Q5.device;
						ctx.configure(config);
						initDepth();
						initPipelines();
					}
				});
			}

			return c;
		};

		$._resizeCanvas = (w, h) => {
			$._setCanvasSize(w, h);
			initDepth();
		};

		// Transformations
		$.translate = (x, y, z = 0) => {
			modelMatrix = Mat4.translate(modelMatrix, [x, y, z]);
		};
		$.rotateX = (rad) => { modelMatrix = Mat4.rotateX(modelMatrix, rad); };
		$.rotateY = (rad) => { modelMatrix = Mat4.rotateY(modelMatrix, rad); };
		$.rotateZ = (rad) => { modelMatrix = Mat4.rotateZ(modelMatrix, rad); };
		$.rotate = (rad, axis = 'z') => {
			if (axis === 'x' || axis === 0) $.rotateX(rad);
			else if (axis === 'y' || axis === 1) $.rotateY(rad);
			else $.rotateZ(rad);
		};
		$.scale = (x, y = x, z = (typeof y === 'number' ? y : x)) => {
			modelMatrix = Mat4.scale(modelMatrix, [x, y, z]);
		};
		$.push = () => {
			matrixStack.push(new Float32Array(modelMatrix));
		};
		$.pop = () => {
			if (matrixStack.length > 0) {
				modelMatrix = matrixStack.pop();
			}
		};
		$.resetMatrix = () => {
			modelMatrix = Mat4.identity();
		};

		// Camera & Projection defaults
		let isOrtho = false;
		let orthoBounds = { left: -200, right: 200, bottom: -200, top: 200, near: -1000, far: 1000 };

		$.perspective = (f = Math.PI / 3, a = (c.w || 400) / (c.h || 400), n = 0.1, fa = 5000) => {
			isOrtho = false;
			fovy = f;
			near = n;
			far = fa;
		};

		$.ortho = (left, right, bottom, top, nearVal = -1000, farVal = 1000) => {
			isOrtho = true;
			const hw = (c.w || 400) / 2;
			const hh = (c.h || 400) / 2;
			orthoBounds = {
				left: left !== undefined ? left : -hw,
				right: right !== undefined ? right : hw,
				bottom: bottom !== undefined ? bottom : -hh,
				top: top !== undefined ? top : hh,
				near: nearVal,
				far: farVal
			};
		};

		// Camera
		$.camera = (eyeX = 0, eyeY = 0, eyeZ = 400, cx = 0, cy = 0, cz = 0, ux = 0, uy = 1, uz = 0) => {
			eye = [eyeX, eyeY, eyeZ];
			center = [cx, cy, cz];
			up = [ux, uy, uz];
		};

		$.createCamera = () => {
			const cam = {
				eye: [0, 0, 400],
				center: [0, 0, 0],
				up: [0, 1, 0],
				setPosition(x, y, z) { cam.eye = [x, y, z]; },
				lookAt(x, y, z) { cam.center = [x, y, z]; },
				perspective(f, a, n, fa) { $.perspective(f, a, n, fa); },
				ortho(l, r, b, t, n, fa) { $.ortho(l, r, b, t, n, fa); }
			};
			return cam;
		};

		$.setCamera = (cam) => {
			if (cam && cam.eye) {
				eye = cam.eye;
				center = cam.center;
				up = cam.up;
			}
		};

		$.orbitControl = function (a = true, b = 0.01, c = 0.01) {
			let sensitivityX = 0.01;
			let sensitivityY = 0.01;

			if (typeof a === 'boolean') {
				orbitEnabled = a;
				if (!orbitEnabled) return;
				if (typeof b === 'number') sensitivityX = b;
				if (typeof c === 'number') sensitivityY = c;
				else if (typeof b === 'number') sensitivityY = b;
			} else {
				orbitEnabled = true;
				if (typeof a === 'number') sensitivityX = a;
				if (typeof b === 'number') sensitivityY = b;
				else if (typeof a === 'number') sensitivityY = a;
			}

			const isPressed = $.mouseIsPressed || window.mouseIsPressed || Q5.mouseIsPressed || ($._parent && $._parent.mouseIsPressed);
			if (isPressed) {
				const dx = $.movedX || window.movedX || (window.mouseX !== undefined && window.pmouseX !== undefined ? window.mouseX - window.pmouseX : 0);
				const dy = $.movedY || window.movedY || (window.mouseY !== undefined && window.pmouseY !== undefined ? window.mouseY - window.pmouseY : 0);
				rotY += dx * sensitivityX;
				rotX += dy * sensitivityY;
			}
		};

		// Lights
		$.ambientLight = (r, g = r, b = g) => {
			ambientLightColor = [r / 255, g / 255, b / 255];
		};
		$.directionalLight = (r, g, b, x = 1, y = 1, z = -1) => {
			dirLightColor = [r / 255, g / 255, b / 255];
			const len = Math.hypot(x, y, z) || 1;
			dirLightDir = [x / len, y / len, z / len];
		};
		$.pointLight = (r, g, b, x = 0, y = 0, z = 0) => {
			pointLightColor = [r / 255, g / 255, b / 255, 1.0];
			pointLightPos = [x, y, z];
		};
		$.spotLight = (r, g, b, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = -1, angle = Math.PI / 6) => {
			spotLightColor = [r / 255, g / 255, b / 255, 1.0];
			spotLightPos = [x, y, z];
			const len = Math.hypot(rx, ry, rz) || 1;
			spotLightDir = [rx / len, ry / len, rz / len, angle];
		};

		// Style & Colors
		$.fill = (r, g = r, b = g, a = 255) => {
			hasFill = true;
			currentFill = [r / 255, g / 255, b / 255, a / 255];
		};
		$.noFill = () => { hasFill = false; };
		$.stroke = (r, g = r, b = g, a = 255) => {
			hasStroke = true;
			currentStroke = [r / 255, g / 255, b / 255, a / 255];
		};
		$.noStroke = () => { hasStroke = false; };
		$.strokeWeight = (w) => { strokeThickness = w; };

		// Transform point helper
		function transformPoint(p, m) {
			const x = p[0], y = p[1], z = p[2] || 0;
			return [
				m[0] * x + m[4] * y + m[8] * z + m[12],
				m[1] * x + m[5] * y + m[9] * z + m[13],
				m[2] * x + m[6] * y + m[10] * z + m[14]
			];
		}

		function transformNormal(n, m) {
			const x = n[0], y = n[1], z = n[2] || 0;
			const tx = m[0] * x + m[4] * y + m[8] * z;
			const ty = m[1] * x + m[5] * y + m[9] * z;
			const tz = m[2] * x + m[6] * y + m[10] * z;
			const len = Math.hypot(tx, ty, tz) || 1;
			return [tx / len, ty / len, tz / len];
		}

		function pushVertex(arr, p, n, c) {
			arr.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3]);
		}

		// Primitives
		$.point = (x, y, z = 0) => {
			const pt = transformPoint([x, y, z], modelMatrix);
			// Draw small cross line for point
			const d = (strokeThickness || 1) * 2;
			lineVertices.push(
				pt[0] - d, pt[1], pt[2], 0, 0, 1, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3],
				pt[0] + d, pt[1], pt[2], 0, 0, 1, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3]
			);
		};

		$.line = (x1, y1, z1, x2, y2, z2 = 0) => {
			if (arguments.length === 4) {
				z2 = 0; z1 = 0;
			}
			const p1 = transformPoint([x1, y1, z1], modelMatrix);
			const p2 = transformPoint([x2, y2, z2], modelMatrix);
			lineVertices.push(
				p1[0], p1[1], p1[2], 0, 0, 1, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3],
				p2[0], p2[1], p2[2], 0, 0, 1, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3]
			);
		};

		$.box = (w = 50, h = w, d = w) => {
			const hw = w / 2, hh = h / 2, hd = d / 2;
			const faces = [
				[[-hw, -hh,  hd], [ hw, -hh,  hd], [ hw,  hh,  hd], [-hw,  hh,  hd], [0, 0, 1]],
				[[ hw, -hh, -hd], [-hw, -hh, -hd], [-hw,  hh, -hd], [ hw,  hh, -hd], [0, 0, -1]],
				[[-hw,  hh,  hd], [ hw,  hh,  hd], [ hw,  hh, -hd], [-hw,  hh, -hd], [0, 1, 0]],
				[[-hw, -hh, -hd], [ hw, -hh, -hd], [ hw, -hh,  hd], [-hw, -hh,  hd], [0, -1, 0]],
				[[ hw, -hh,  hd], [ hw, -hh, -hd], [ hw,  hh, -hd], [ hw,  hh,  hd], [1, 0, 0]],
				[[-hw, -hh, -hd], [-hw, -hh,  hd], [-hw,  hh,  hd], [-hw,  hh, -hd], [-1, 0, 0]]
			];

			for (const f of faces) {
				const [p0, p1, p2, p3, norm] = f;
				const tp0 = transformPoint(p0, modelMatrix);
				const tp1 = transformPoint(p1, modelMatrix);
				const tp2 = transformPoint(p2, modelMatrix);
				const tp3 = transformPoint(p3, modelMatrix);
				const tn = transformNormal(norm, modelMatrix);

				if (hasFill) {
					pushVertex(triVertices, tp0, tn, currentFill);
					pushVertex(triVertices, tp1, tn, currentFill);
					pushVertex(triVertices, tp2, tn, currentFill);

					pushVertex(triVertices, tp0, tn, currentFill);
					pushVertex(triVertices, tp2, tn, currentFill);
					pushVertex(triVertices, tp3, tn, currentFill);
				}
				if (hasStroke) {
					pushVertex(lineVertices, tp0, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp1, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp1, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp2, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp2, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp3, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp3, [0,0,1], currentStroke);
					pushVertex(lineVertices, tp0, [0,0,1], currentStroke);
				}
			}
		};

		$.sphere = (r = 50, detailX = 16, detailY = 12) => {
			for (let i = 0; i < detailY; i++) {
				const lat0 = Math.PI * (-0.5 + i / detailY);
				const z0 = Math.sin(lat0);
				const zr0 = Math.cos(lat0);

				const lat1 = Math.PI * (-0.5 + (i + 1) / detailY);
				const z1 = Math.sin(lat1);
				const zr1 = Math.cos(lat1);

				for (let j = 0; j < detailX; j++) {
					const lng0 = 2 * Math.PI * (j / detailX);
					const x0 = Math.cos(lng0), y0 = Math.sin(lng0);
					const lng1 = 2 * Math.PI * ((j + 1) / detailX);
					const x1 = Math.cos(lng1), y1 = Math.sin(lng1);

					const v1 = [x0 * zr0 * r, y0 * zr0 * r, z0 * r];
					const v2 = [x1 * zr0 * r, y1 * zr0 * r, z0 * r];
					const v3 = [x1 * zr1 * r, y1 * zr1 * r, z1 * r];
					const v4 = [x0 * zr1 * r, y0 * zr1 * r, z1 * r];

					const tp1 = transformPoint(v1, modelMatrix);
					const tp2 = transformPoint(v2, modelMatrix);
					const tp3 = transformPoint(v3, modelMatrix);
					const tp4 = transformPoint(v4, modelMatrix);

					const tn1 = transformNormal([x0 * zr0, y0 * zr0, z0], modelMatrix);
					const tn2 = transformNormal([x1 * zr0, y1 * zr0, z0], modelMatrix);
					const tn3 = transformNormal([x1 * zr1, y1 * zr1, z1], modelMatrix);
					const tn4 = transformNormal([x0 * zr1, y0 * zr1, z1], modelMatrix);

					if (hasFill) {
						pushVertex(triVertices, tp1, tn1, currentFill);
						pushVertex(triVertices, tp2, tn2, currentFill);
						pushVertex(triVertices, tp3, tn3, currentFill);

						pushVertex(triVertices, tp1, tn1, currentFill);
						pushVertex(triVertices, tp3, tn3, currentFill);
						pushVertex(triVertices, tp4, tn4, currentFill);
					}
				}
			}
		};

		$.clear = () => {
			triVertices.length = 0;
			lineVertices.length = 0;
		};

		// Flush WebGPU render commands
		$._render = () => {
			if (!Q5.device || !ctx) return;
			if (!triPipeline) initPipelines();
			if (!depthTexture) initDepth();

			const device = Q5.device;
			let currentTextureView;
			try {
				currentTextureView = ctx.getCurrentTexture().createView();
			} catch (e) {
				return;
			}

			// View & Projection
			const aspect = (c.w || 400) / (c.h || 400);
			const proj = isOrtho
				? Mat4.ortho(orthoBounds.left, orthoBounds.right, orthoBounds.bottom, orthoBounds.top, orthoBounds.near, orthoBounds.far)
				: Mat4.perspective(fovy, aspect, near, far);
			let view = Mat4.lookAt(eye, center, up);

			if (orbitEnabled) {
				view = Mat4.rotateX(view, rotX);
				view = Mat4.rotateY(view, rotY);
			}

			const mvp = Mat4.multiply(proj, view);

			// Update Uniforms (48 floats = 192 bytes)
			const uniformData = new Float32Array(48);
			uniformData.set(mvp, 0);
			uniformData.set([ambientLightColor[0], ambientLightColor[1], ambientLightColor[2], 1.0], 16);
			uniformData.set([dirLightColor[0], dirLightColor[1], dirLightColor[2], 1.0], 20);
			uniformData.set([dirLightDir[0], dirLightDir[1], dirLightDir[2], 0.0], 24);
			uniformData.set([pointLightPos[0], pointLightPos[1], pointLightPos[2], 1.0], 28);
			uniformData.set(pointLightColor, 32);
			uniformData.set([spotLightPos[0], spotLightPos[1], spotLightPos[2], 1.0], 36);
			uniformData.set(spotLightDir, 40);
			uniformData.set(spotLightColor, 44);
			device.queue.writeBuffer(uniformBuffer, 0, uniformData);

			// Command Encoder
			const commandEncoder = device.createCommandEncoder({ label: 'q5_3d_render_encoder' });
			const renderPass = commandEncoder.beginRenderPass({
				colorAttachments: [{
					view: currentTextureView,
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: 'clear',
					storeOp: 'store'
				}],
				depthStencilAttachment: {
					view: depthTexture.createView(),
					depthClearValue: 1.0,
					depthLoadOp: 'clear',
					depthStoreOp: 'store'
				}
			});

			// Draw Triangles
			if (triVertices.length > 0) {
				const triByteLength = triVertices.length * 4;
				if (!triVertexBuffer || triBufferCapacity < triByteLength) {
					if (triVertexBuffer) triVertexBuffer.destroy();
					triBufferCapacity = Math.max(triByteLength, 65536);
					triVertexBuffer = device.createBuffer({
						size: triBufferCapacity,
						usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
					});
				}
				device.queue.writeBuffer(triVertexBuffer, 0, new Float32Array(triVertices));

				renderPass.setPipeline(triPipeline);
				renderPass.setBindGroup(0, bindGroup);
				renderPass.setVertexBuffer(0, triVertexBuffer);
				renderPass.draw(triVertices.length / FLOATS_PER_VERTEX);
			}

			// Draw Lines
			if (lineVertices.length > 0) {
				const lineByteLength = lineVertices.length * 4;
				if (!lineVertexBuffer || lineBufferCapacity < lineByteLength) {
					if (lineVertexBuffer) lineVertexBuffer.destroy();
					lineBufferCapacity = Math.max(lineByteLength, 65536);
					lineVertexBuffer = device.createBuffer({
						size: lineBufferCapacity,
						usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
					});
				}
				device.queue.writeBuffer(lineVertexBuffer, 0, new Float32Array(lineVertices));

				renderPass.setPipeline(linePipeline);
				renderPass.setBindGroup(0, bindGroup);
				renderPass.setVertexBuffer(0, lineVertexBuffer);
				renderPass.draw(lineVertices.length / FLOATS_PER_VERTEX);
			}

			renderPass.end();
			device.queue.submit([commandEncoder.finish()]);

			// Reset queues for next frame
			triVertices.length = 0;
			lineVertices.length = 0;
		};

		// Also execute render on clear or draw completion
		$.flush = $._render;
	};
})();

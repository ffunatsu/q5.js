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

		// Geometry vertex arrays: [pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, uv.u, uv.v, col.r, col.g, col.b, col.a] (12 floats per vertex)
		const FLOATS_PER_VERTEX = 12;
		let triVertices = [];
		let lineVertices = [];
		let triBatches = [];
		let lastBatchStart = 0;

		// WebGPU Pipelines & Buffers
		let triPipeline = null;
		let linePipeline = null;
		let uniformBuffer = null;
		let bindGroup = null;
		let textureLayout = null;
		let defaultSampler = null;
		let defaultTexture = null;
		let defaultTextureBindGroup = null;
		let activeTextureBindGroup = null;
		let triVertexBuffer = null;
		let lineVertexBuffer = null;
		let triBufferCapacity = 0;
		let lineBufferCapacity = 0;

		const textureBindGroupCache = new WeakMap();

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
			@group(1) @binding(0) var u_sampler : sampler;
			@group(1) @binding(1) var u_texture : texture_2d<f32>;

			struct VertexInput {
				@location(0) position : vec3<f32>,
				@location(1) normal : vec3<f32>,
				@location(2) uv : vec2<f32>,
				@location(3) color : vec4<f32>
			};

			struct VertexOutput {
				@builtin(position) position : vec4<f32>,
				@location(0) v_color : vec4<f32>,
				@location(1) v_normal : vec3<f32>,
				@location(2) v_worldPos : vec3<f32>,
				@location(3) v_uv : vec2<f32>
			};

			@vertex
			fn vs_main(in : VertexInput) -> VertexOutput {
				var out : VertexOutput;
				out.position = uniforms.u_mvp * vec4<f32>(in.position, 1.0);
				out.v_color = in.color;
				out.v_normal = in.normal;
				out.v_worldPos = in.position;
				out.v_uv = in.uv;
				return out;
			}

			@fragment
			fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
				var n : vec3<f32> = normalize(in.v_normal);
				var texColor : vec4<f32> = textureSample(u_texture, u_sampler, in.v_uv);
				var baseColor : vec4<f32> = in.v_color * texColor;
				
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

				return vec4<f32>(baseColor.rgb * totalLight, baseColor.a);
			}

			@vertex
			fn vs_unlit(in : VertexInput) -> VertexOutput {
				var out : VertexOutput;
				out.position = uniforms.u_mvp * vec4<f32>(in.position, 1.0);
				out.v_color = in.color;
				out.v_uv = in.uv;
				return out;
			}

			@fragment
			fn fs_unlit(in : VertexOutput) -> @location(0) vec4<f32> {
				var texColor : vec4<f32> = textureSample(u_texture, u_sampler, in.v_uv);
				return in.v_color * texColor;
			}
		`;

		function getOrCreateTextureBindGroup(img) {
			if (!img) return defaultTextureBindGroup;

			const cnv = img.canvas || img;
			const w = cnv.width || cnv.w || img.width || 1;
			const h = cnv.height || cnv.h || img.height || 1;
			const format = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';

			let gpuTexture = img._texture3d;
			let isNew = false;
			if (!gpuTexture) {
				isNew = true;
				gpuTexture = Q5.device.createTexture({
					label: 'q5_3d_user_texture',
					size: [w, h, 1],
					format: format,
					usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
				});
				img._texture3d = gpuTexture;
			}

			// Update texture content if new, modified, or 2D graphics
			if (isNew || img.modified || img._isGraphics || img._renderer === 'c2d') {
				if (typeof Q5.device.queue.copyExternalImageToTexture === 'function') {
					try {
						Q5.device.queue.copyExternalImageToTexture(
							{ source: cnv },
							{ texture: gpuTexture },
							[w, h, 1]
						);
					} catch (e) {
						console.warn('[3D] copyExternalImageToTexture failed:', e);
					}
				}
				img.modified = false;
			}

			if (textureBindGroupCache.has(img)) {
				return textureBindGroupCache.get(img);
			}

			const bg = Q5.device.createBindGroup({
				label: 'q5_3d_texture_bindgroup',
				layout: textureLayout,
				entries: [
					{ binding: 0, resource: defaultSampler },
					{ binding: 1, resource: gpuTexture.createView() }
				]
			});

			textureBindGroupCache.set(img, bg);
			return bg;
		}

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

			textureLayout = device.createBindGroupLayout({
				label: 'q5_3d_texture_layout',
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: 'filtering' }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: { viewDimension: '2d', sampleType: 'float' }
					}
				]
			});

			defaultSampler = device.createSampler({
				magFilter: 'linear',
				minFilter: 'linear'
			});

			defaultTexture = device.createTexture({
				label: 'q5_3d_default_white_texture',
				size: [1, 1, 1],
				format: 'rgba8unorm',
				usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
			});
			device.queue.writeTexture(
				{ texture: defaultTexture },
				new Uint8Array([255, 255, 255, 255]),
				{ bytesPerRow: 4, rowsPerImage: 1 },
				[1, 1, 1]
			);

			defaultTextureBindGroup = device.createBindGroup({
				label: 'q5_3d_default_texture_bindgroup',
				layout: textureLayout,
				entries: [
					{ binding: 0, resource: defaultSampler },
					{ binding: 1, resource: defaultTexture.createView() }
				]
			});
			activeTextureBindGroup = defaultTextureBindGroup;

			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [uniformLayout, textureLayout]
			});

			const vertexBufferLayout = {
				arrayStride: FLOATS_PER_VERTEX * 4,
				attributes: [
					{ shaderLocation: 0, offset: 0, format: 'float32x3' },
					{ shaderLocation: 1, offset: 12, format: 'float32x3' },
					{ shaderLocation: 2, offset: 24, format: 'float32x2' },
					{ shaderLocation: 3, offset: 32, format: 'float32x4' }
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
				},
				multisample: { count: sampleCount }
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
				},
				multisample: { count: sampleCount }
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

		let msaaColorTexture = null;
		let targetTexture = null;
		let sampleCount = 4;

		function ensureTextures() {
			if (!Q5.device) return;
			const w = c.width || c.w || $.width || 400;
			const h = c.height || c.h || $.height || 400;
			const format = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';

			if (sampleCount > 1) {
				if (!msaaColorTexture || msaaColorTexture.width !== w || msaaColorTexture.height !== h) {
					if (msaaColorTexture) msaaColorTexture.destroy();
					msaaColorTexture = Q5.device.createTexture({
						label: 'q5_3d_msaa_color_texture',
						size: [w, h, 1],
						sampleCount: sampleCount,
						format: format,
						usage: GPUTextureUsage.RENDER_ATTACHMENT
					});
				}
			} else if (msaaColorTexture) {
				msaaColorTexture.destroy();
				msaaColorTexture = null;
			}

			if (!depthTexture || depthTexture.width !== w || depthTexture.height !== h) {
				if (depthTexture) depthTexture.destroy();
				depthTexture = Q5.device.createTexture({
					label: 'q5_3d_depth_texture',
					size: [w, h, 1],
					sampleCount: sampleCount,
					format: 'depth24plus',
					usage: GPUTextureUsage.RENDER_ATTACHMENT
				});
			}
			if ($._isGraphics) {
				if (!targetTexture || targetTexture.width !== w || targetTexture.height !== h) {
					if (targetTexture) targetTexture.destroy();
					targetTexture = Q5.device.createTexture({
						label: 'q5_3d_target_texture',
						size: [w, h, 1],
						format: format,
						usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
					});
					$._texture = targetTexture;
					$.canvas._texture = targetTexture;
					if ($._owner && typeof $._owner._addTexture === 'function') {
						$._owner._addTexture($, targetTexture);
					}
				}
			}
		}

		$.smooth = () => {
			if (sampleCount !== 4) {
				sampleCount = 4;
				triPipeline = null;
				linePipeline = null;
				if (msaaColorTexture) { msaaColorTexture.destroy(); msaaColorTexture = null; }
				if (depthTexture) { depthTexture.destroy(); depthTexture = null; }
			}
		};

		$.noSmooth = () => {
			if (sampleCount !== 1) {
				sampleCount = 1;
				triPipeline = null;
				linePipeline = null;
				if (msaaColorTexture) { msaaColorTexture.destroy(); msaaColorTexture = null; }
				if (depthTexture) { depthTexture.destroy(); depthTexture = null; }
			}
		};

		$._createCanvas = function (w, h, opt = {}) {
			if (opt.antialias === false || opt.sampleCount === 1) {
				sampleCount = 1;
			} else {
				sampleCount = opt.sampleCount || 4;
			}
			if (!navigator.gpu) return c;
			const format = navigator.gpu.getPreferredCanvasFormat();

			const setup = () => {
				const isNativeOffscreen = typeof globalThis !== 'undefined' && globalThis.__mystral && $._isGraphics;
				// console.log(`[q5-webgpu-3d.js:429] setup: isNativeOffscreen=${isNativeOffscreen} (globalThis.__mystral=${typeof globalThis !== 'undefined' ? globalThis.__mystral : 'undefined'}, $._isGraphics=${$._isGraphics})`);
				if (!isNativeOffscreen && typeof c.getContext === 'function') {
					try {
						ctx = q.ctx = q.drawingContext = c.getContext('webgpu');
						// console.log(`[q5-webgpu-3d.js:433] c.getContext('webgpu') executed: ctx=${ctx ? 'GPUCanvasContext' : 'null'}`);
						if (ctx) {
							ctx.configure({
								device: Q5.device,
								format: format,
								alphaMode: 'premultiplied'
							});
						}
					} catch (e) {
						console.error(`[q5-webgpu-3d.js:441] context configure error:`, e);
					}
				} else {
					// console.log(`[q5-webgpu-3d.js:444] Skipped c.getContext('webgpu') for native offscreen targetTexture`);
				}
				ensureTextures();
				initPipelines();
			};

			if (Q5.device) {
				setup();
			} else if (typeof Q5.initWebGPU === 'function') {
				Q5.initWebGPU().then((supported) => {
					if (supported && Q5.device) {
						setup();
					}
				});
			}

			return c;
		};

		$._resizeCanvas = (w, h) => {
			$._setCanvasSize(w, h);
			ensureTextures();
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

		function pushVertex(arr, p, n, uv, c) {
			const u = uv ? uv[0] : 0;
			const v = uv ? uv[1] : 0;
			arr.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v, c[0], c[1], c[2], c[3]);
		}

		// Texture Management
		$.texture = (img) => {
			if (!img) {
				$.noTexture();
				return;
			}
			const bg = getOrCreateTextureBindGroup(img);
			if (bg !== activeTextureBindGroup) {
				const currentCount = Math.floor(triVertices.length / FLOATS_PER_VERTEX);
				if (currentCount > lastBatchStart) {
					triBatches.push({
						start: lastBatchStart,
						count: currentCount - lastBatchStart,
						bindGroup: activeTextureBindGroup
					});
					lastBatchStart = currentCount;
				}
				activeTextureBindGroup = bg;
			}
		};

		$.noTexture = () => {
			if (activeTextureBindGroup !== defaultTextureBindGroup) {
				const currentCount = Math.floor(triVertices.length / FLOATS_PER_VERTEX);
				if (currentCount > lastBatchStart) {
					triBatches.push({
						start: lastBatchStart,
						count: currentCount - lastBatchStart,
						bindGroup: activeTextureBindGroup
					});
					lastBatchStart = currentCount;
				}
				activeTextureBindGroup = defaultTextureBindGroup;
			}
		};

		// Primitives
		$.point = (x, y, z = 0) => {
			const pt = transformPoint([x, y, z], modelMatrix);
			const d = (strokeThickness || 1) * 2;
			lineVertices.push(
				pt[0] - d, pt[1], pt[2], 0, 0, 1, 0, 0, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3],
				pt[0] + d, pt[1], pt[2], 0, 0, 1, 0, 0, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3]
			);
		};

		$.line = (x1, y1, z1, x2, y2, z2 = 0) => {
			if (arguments.length === 4) {
				z2 = 0; z1 = 0;
			}
			const p1 = transformPoint([x1, y1, z1], modelMatrix);
			const p2 = transformPoint([x2, y2, z2], modelMatrix);
			lineVertices.push(
				p1[0], p1[1], p1[2], 0, 0, 1, 0, 0, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3],
				p2[0], p2[1], p2[2], 0, 0, 1, 0, 0, currentStroke[0], currentStroke[1], currentStroke[2], currentStroke[3]
			);
		};

		$.plane = (w = 100, h = w) => {
			const hw = w / 2, hh = h / 2;
			const p0 = [-hw, -hh, 0], p1 = [hw, -hh, 0], p2 = [hw, hh, 0], p3 = [-hw, hh, 0];
			const tp0 = transformPoint(p0, modelMatrix);
			const tp1 = transformPoint(p1, modelMatrix);
			const tp2 = transformPoint(p2, modelMatrix);
			const tp3 = transformPoint(p3, modelMatrix);
			const tn = transformNormal([0, 0, 1], modelMatrix);

			if (hasFill) {
				pushVertex(triVertices, tp0, tn, [0, 0], currentFill);
				pushVertex(triVertices, tp1, tn, [1, 0], currentFill);
				pushVertex(triVertices, tp2, tn, [1, 1], currentFill);

				pushVertex(triVertices, tp0, tn, [0, 0], currentFill);
				pushVertex(triVertices, tp2, tn, [1, 1], currentFill);
				pushVertex(triVertices, tp3, tn, [0, 1], currentFill);
			}
			if (hasStroke) {
				pushVertex(lineVertices, tp0, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp1, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp1, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp2, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp2, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp3, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp3, [0,0,1], [0,0], currentStroke);
				pushVertex(lineVertices, tp0, [0,0,1], [0,0], currentStroke);
			}
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
					pushVertex(triVertices, tp0, tn, [0, 0], currentFill);
					pushVertex(triVertices, tp1, tn, [1, 0], currentFill);
					pushVertex(triVertices, tp2, tn, [1, 1], currentFill);

					pushVertex(triVertices, tp0, tn, [0, 0], currentFill);
					pushVertex(triVertices, tp2, tn, [1, 1], currentFill);
					pushVertex(triVertices, tp3, tn, [0, 1], currentFill);
				}
				if (hasStroke) {
					pushVertex(lineVertices, tp0, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp1, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp1, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp2, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp2, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp3, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp3, [0,0,1], [0,0], currentStroke);
					pushVertex(lineVertices, tp0, [0,0,1], [0,0], currentStroke);
				}
			}
		};

		$.sphere = (r = 50, detailX = 16, detailY = 12) => {
			for (let i = 0; i < detailY; i++) {
				const v0 = i / detailY;
				const v1 = (i + 1) / detailY;
				const lat0 = Math.PI * (-0.5 + v0);
				const z0 = Math.sin(lat0);
				const zr0 = Math.cos(lat0);

				const lat1 = Math.PI * (-0.5 + v1);
				const z1 = Math.sin(lat1);
				const zr1 = Math.cos(lat1);

				for (let j = 0; j < detailX; j++) {
					const u0 = j / detailX;
					const u1 = (j + 1) / detailX;
					const lng0 = 2 * Math.PI * u0;
					const x0 = Math.cos(lng0), y0 = Math.sin(lng0);
					const lng1 = 2 * Math.PI * u1;
					const x1 = Math.cos(lng1), y1 = Math.sin(lng1);

					const p1 = [x0 * zr0 * r, y0 * zr0 * r, z0 * r];
					const p2 = [x1 * zr0 * r, y1 * zr0 * r, z0 * r];
					const p3 = [x1 * zr1 * r, y1 * zr1 * r, z1 * r];
					const p4 = [x0 * zr1 * r, y0 * zr1 * r, z1 * r];

					const tp1 = transformPoint(p1, modelMatrix);
					const tp2 = transformPoint(p2, modelMatrix);
					const tp3 = transformPoint(p3, modelMatrix);
					const tp4 = transformPoint(p4, modelMatrix);

					const tn1 = transformNormal([x0 * zr0, y0 * zr0, z0], modelMatrix);
					const tn2 = transformNormal([x1 * zr0, y1 * zr0, z0], modelMatrix);
					const tn3 = transformNormal([x1 * zr1, y1 * zr1, z1], modelMatrix);
					const tn4 = transformNormal([x0 * zr1, y0 * zr1, z1], modelMatrix);

					if (hasFill) {
						pushVertex(triVertices, tp1, tn1, [u0, v0], currentFill);
						pushVertex(triVertices, tp2, tn2, [u1, v0], currentFill);
						pushVertex(triVertices, tp3, tn3, [u1, v1], currentFill);

						pushVertex(triVertices, tp1, tn1, [u0, v0], currentFill);
						pushVertex(triVertices, tp3, tn3, [u1, v1], currentFill);
						pushVertex(triVertices, tp4, tn4, [u0, v1], currentFill);
					}
				}
			}
		};

		$.cylinder = (r = 50, h = 100, detailX = 24) => {
			const hh = h / 2;
			for (let i = 0; i < detailX; i++) {
				const u0 = i / detailX;
				const u1 = (i + 1) / detailX;
				const a0 = 2 * Math.PI * u0;
				const a1 = 2 * Math.PI * u1;
				const x0 = Math.cos(a0), z0 = Math.sin(a0);
				const x1 = Math.cos(a1), z1 = Math.sin(a1);

				const p0 = [x0 * r, -hh, z0 * r], p1 = [x1 * r, -hh, z1 * r];
				const p2 = [x1 * r,  hh, z1 * r], p3 = [x0 * r,  hh, z0 * r];

				const tp0 = transformPoint(p0, modelMatrix), tp1 = transformPoint(p1, modelMatrix);
				const tp2 = transformPoint(p2, modelMatrix), tp3 = transformPoint(p3, modelMatrix);

				const tn0 = transformNormal([x0, 0, z0], modelMatrix);
				const tn1 = transformNormal([x1, 0, z1], modelMatrix);

				if (hasFill) {
					// Side
					pushVertex(triVertices, tp0, tn0, [u0, 0], currentFill);
					pushVertex(triVertices, tp1, tn1, [u1, 0], currentFill);
					pushVertex(triVertices, tp2, tn1, [u1, 1], currentFill);

					pushVertex(triVertices, tp0, tn0, [u0, 0], currentFill);
					pushVertex(triVertices, tp2, tn1, [u1, 1], currentFill);
					pushVertex(triVertices, tp3, tn0, [u0, 1], currentFill);

					// Top & Bottom caps
					const topCenter = transformPoint([0, hh, 0], modelMatrix);
					const botCenter = transformPoint([0, -hh, 0], modelMatrix);
					const topNorm = transformNormal([0, 1, 0], modelMatrix);
					const botNorm = transformNormal([0, -1, 0], modelMatrix);

					pushVertex(triVertices, topCenter, topNorm, [0.5, 0.5], currentFill);
					pushVertex(triVertices, tp3, topNorm, [x0 * 0.5 + 0.5, z0 * 0.5 + 0.5], currentFill);
					pushVertex(triVertices, tp2, topNorm, [x1 * 0.5 + 0.5, z1 * 0.5 + 0.5], currentFill);

					pushVertex(triVertices, botCenter, botNorm, [0.5, 0.5], currentFill);
					pushVertex(triVertices, tp1, botNorm, [x1 * 0.5 + 0.5, z1 * 0.5 + 0.5], currentFill);
					pushVertex(triVertices, tp0, botNorm, [x0 * 0.5 + 0.5, z0 * 0.5 + 0.5], currentFill);
				}
			}
		};

		$.cone = (r = 50, h = 100, detailX = 24) => {
			const hh = h / 2;
			for (let i = 0; i < detailX; i++) {
				const u0 = i / detailX;
				const u1 = (i + 1) / detailX;
				const a0 = 2 * Math.PI * u0;
				const a1 = 2 * Math.PI * u1;
				const x0 = Math.cos(a0), z0 = Math.sin(a0);
				const x1 = Math.cos(a1), z1 = Math.sin(a1);

				const tip = transformPoint([0, hh, 0], modelMatrix);
				const p0 = transformPoint([x0 * r, -hh, z0 * r], modelMatrix);
				const p1 = transformPoint([x1 * r, -hh, z1 * r], modelMatrix);

				const n0 = transformNormal([x0, r / h, z0], modelMatrix);
				const n1 = transformNormal([x1, r / h, z1], modelMatrix);

				if (hasFill) {
					pushVertex(triVertices, tip, n0, [(u0 + u1) * 0.5, 1], currentFill);
					pushVertex(triVertices, p0, n0, [u0, 0], currentFill);
					pushVertex(triVertices, p1, n1, [u1, 0], currentFill);

					const botCenter = transformPoint([0, -hh, 0], modelMatrix);
					const botNorm = transformNormal([0, -1, 0], modelMatrix);
					pushVertex(triVertices, botCenter, botNorm, [0.5, 0.5], currentFill);
					pushVertex(triVertices, p1, botNorm, [x1 * 0.5 + 0.5, z1 * 0.5 + 0.5], currentFill);
					pushVertex(triVertices, p0, botNorm, [x0 * 0.5 + 0.5, z0 * 0.5 + 0.5], currentFill);
				}
			}
		};

		$.torus = (r1 = 50, r2 = 15, detailX = 24, detailY = 16) => {
			for (let i = 0; i < detailY; i++) {
				const v0 = i / detailY;
				const v1 = (i + 1) / detailY;
				const a0 = 2 * Math.PI * v0;
				const a1 = 2 * Math.PI * v1;

				for (let j = 0; j < detailX; j++) {
					const u0 = j / detailX;
					const u1 = (j + 1) / detailX;
					const b0 = 2 * Math.PI * u0;
					const b1 = 2 * Math.PI * u1;

					const getPos = (u, v) => [
						(r1 + r2 * Math.cos(v)) * Math.cos(u),
						r2 * Math.sin(v),
						(r1 + r2 * Math.cos(v)) * Math.sin(u)
					];
					const getNorm = (u, v) => [
						Math.cos(v) * Math.cos(u),
						Math.sin(v),
						Math.cos(v) * Math.sin(u)
					];

					const tp0 = transformPoint(getPos(b0, a0), modelMatrix);
					const tp1 = transformPoint(getPos(b1, a0), modelMatrix);
					const tp2 = transformPoint(getPos(b1, a1), modelMatrix);
					const tp3 = transformPoint(getPos(b0, a1), modelMatrix);

					const tn0 = transformNormal(getNorm(b0, a0), modelMatrix);
					const tn1 = transformNormal(getNorm(b1, a0), modelMatrix);
					const tn2 = transformNormal(getNorm(b1, a1), modelMatrix);
					const tn3 = transformNormal(getNorm(b0, a1), modelMatrix);

					if (hasFill) {
						pushVertex(triVertices, tp0, tn0, [u0, v0], currentFill);
						pushVertex(triVertices, tp1, tn1, [u1, v0], currentFill);
						pushVertex(triVertices, tp2, tn2, [u1, v1], currentFill);

						pushVertex(triVertices, tp0, tn0, [u0, v0], currentFill);
						pushVertex(triVertices, tp2, tn2, [u1, v1], currentFill);
						pushVertex(triVertices, tp3, tn3, [u0, v1], currentFill);
					}
				}
			}
		};

		// Custom Shape Building (beginShape / vertex / endShape)
		Q5.POINTS = $.POINTS = 'POINTS';
		Q5.LINES = $.LINES = 'LINES';
		Q5.TRIANGLES = $.TRIANGLES = 'TRIANGLES';
		Q5.TRIANGLE_STRIP = $.TRIANGLE_STRIP = 'TRIANGLE_STRIP';
		Q5.TRIANGLE_FAN = $.TRIANGLE_FAN = 'TRIANGLE_FAN';
		Q5.QUADS = $.QUADS = 'QUADS';
		if (typeof globalThis !== 'undefined') {
			globalThis.POINTS ??= 'POINTS';
			globalThis.LINES ??= 'LINES';
			globalThis.TRIANGLES ??= 'TRIANGLES';
			globalThis.TRIANGLE_STRIP ??= 'TRIANGLE_STRIP';
			globalThis.TRIANGLE_FAN ??= 'TRIANGLE_FAN';
			globalThis.QUADS ??= 'QUADS';
		}

		let currentNormal = [0, 0, 1];
		let currentUV = [0, 0];
		let shapeMode = null;
		let shapeVertices = [];

		$.normal = (x, y, z) => {
			if (Array.isArray(x)) {
				currentNormal = [x[0], x[1], x[2]];
			} else {
				currentNormal = [x, y, z];
			}
		};

		$.beginShape = (mode = 'triangles') => {
			shapeMode = typeof mode === 'string' ? mode.toUpperCase() : 'TRIANGLES';
			shapeVertices = [];
		};

		$.vertex = (x, y, z = 0, u = 0, v = 0) => {
			let pos, uv;
			if (arguments.length >= 5) {
				pos = [x, y, z];
				uv = [u, v];
			} else if (arguments.length === 4) {
				pos = [x, y, 0];
				uv = [z, u];
			} else if (arguments.length === 3) {
				pos = [x, y, z];
				uv = [currentUV[0], currentUV[1]];
			} else {
				pos = [x, y, 0];
				uv = [currentUV[0], currentUV[1]];
			}

			const tp = transformPoint(pos, modelMatrix);
			const tn = transformNormal(currentNormal, modelMatrix);
			shapeVertices.push({
				pos: tp,
				norm: tn,
				uv: uv,
				fill: currentFill.slice(),
				stroke: currentStroke.slice()
			});
		};

		$.endShape = (close = false) => {
			const n = shapeVertices.length;
			if (n === 0) return;

			const mode = shapeMode || 'TRIANGLES';

			if (mode === 'POINTS') {
				for (let i = 0; i < n; i++) {
					const v = shapeVertices[i];
					const d = (strokeThickness || 1) * 2;
					lineVertices.push(
						v.pos[0] - d, v.pos[1], v.pos[2], 0, 0, 1, v.uv[0], v.uv[1], v.stroke[0], v.stroke[1], v.stroke[2], v.stroke[3],
						v.pos[0] + d, v.pos[1], v.pos[2], 0, 0, 1, v.uv[0], v.uv[1], v.stroke[0], v.stroke[1], v.stroke[2], v.stroke[3]
					);
				}
			} else if (mode === 'LINES') {
				for (let i = 0; i + 1 < n; i += 2) {
					const v1 = shapeVertices[i], v2 = shapeVertices[i + 1];
					pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
					pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
				}
			} else if (mode === 'LINE_STRIP') {
				for (let i = 0; i + 1 < n; i++) {
					const v1 = shapeVertices[i], v2 = shapeVertices[i + 1];
					pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
					pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
				}
				if (close && n > 2) {
					const v1 = shapeVertices[n - 1], v2 = shapeVertices[0];
					pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
					pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
				}
			} else if (mode === 'TRIANGLE_STRIP') {
				for (let i = 0; i + 2 < n; i++) {
					const v1 = shapeVertices[i];
					const v2 = (i % 2 === 0) ? shapeVertices[i + 1] : shapeVertices[i + 2];
					const v3 = (i % 2 === 0) ? shapeVertices[i + 2] : shapeVertices[i + 1];
					if (hasFill) {
						pushVertex(triVertices, v1.pos, v1.norm, v1.uv, v1.fill);
						pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);
						pushVertex(triVertices, v3.pos, v3.norm, v3.uv, v3.fill);
					}
				}
			} else if (mode === 'TRIANGLE_FAN') {
				const v0 = shapeVertices[0];
				for (let i = 1; i + 1 < n; i++) {
					const v1 = shapeVertices[i], v2 = shapeVertices[i + 1];
					if (hasFill) {
						pushVertex(triVertices, v0.pos, v0.norm, v0.uv, v0.fill);
						pushVertex(triVertices, v1.pos, v1.norm, v1.uv, v1.fill);
						pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);
					}
				}
			} else if (mode === 'QUADS') {
				for (let i = 0; i + 3 < n; i += 4) {
					const v0 = shapeVertices[i], v1 = shapeVertices[i + 1], v2 = shapeVertices[i + 2], v3 = shapeVertices[i + 3];
					if (hasFill) {
						pushVertex(triVertices, v0.pos, v0.norm, v0.uv, v0.fill);
						pushVertex(triVertices, v1.pos, v1.norm, v1.uv, v1.fill);
						pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);

						pushVertex(triVertices, v0.pos, v0.norm, v0.uv, v0.fill);
						pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);
						pushVertex(triVertices, v3.pos, v3.norm, v3.uv, v3.fill);
					}
					if (hasStroke) {
						pushVertex(lineVertices, v0.pos, [0,0,1], v0.uv, v0.stroke);
						pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
						pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
						pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
						pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
						pushVertex(lineVertices, v3.pos, [0,0,1], v3.uv, v3.stroke);
						pushVertex(lineVertices, v3.pos, [0,0,1], v3.uv, v3.stroke);
						pushVertex(lineVertices, v0.pos, [0,0,1], v0.uv, v0.stroke);
					}
				}
			} else {
				// TRIANGLES default
				if (n === 3 || mode === 'TRIANGLES') {
					for (let i = 0; i + 2 < n; i += 3) {
						const v0 = shapeVertices[i], v1 = shapeVertices[i + 1], v2 = shapeVertices[i + 2];
						if (hasFill) {
							pushVertex(triVertices, v0.pos, v0.norm, v0.uv, v0.fill);
							pushVertex(triVertices, v1.pos, v1.norm, v1.uv, v1.fill);
							pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);
						}
						if (hasStroke) {
							pushVertex(lineVertices, v0.pos, [0,0,1], v0.uv, v0.stroke);
							pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
							pushVertex(lineVertices, v1.pos, [0,0,1], v1.uv, v1.stroke);
							pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
							pushVertex(lineVertices, v2.pos, [0,0,1], v2.uv, v2.stroke);
							pushVertex(lineVertices, v0.pos, [0,0,1], v0.uv, v0.stroke);
						}
					}
				} else {
					const v0 = shapeVertices[0];
					for (let i = 1; i + 1 < n; i++) {
						const v1 = shapeVertices[i], v2 = shapeVertices[i + 1];
						if (hasFill) {
							pushVertex(triVertices, v0.pos, v0.norm, v0.uv, v0.fill);
							pushVertex(triVertices, v1.pos, v1.norm, v1.uv, v1.fill);
							pushVertex(triVertices, v2.pos, v2.norm, v2.uv, v2.fill);
						}
					}
				}
			}
			shapeVertices = [];
		};

		// Dynamic Mesh Class & drawMesh API
		class Mesh {
			constructor(opt = {}) {
				this.positions = opt.positions || null;
				this.normals = opt.normals || null;
				this.uvs = opt.uvs || null;
				this.colors = opt.colors || null;
				this.indices = opt.indices || null;
				this.texture = opt.texture || null;
				if (this.positions && !this.normals) {
					this.computeNormals();
				}
			}

			setPositions(p) { this.positions = p; return this; }
			setNormals(n) { this.normals = n; return this; }
			setUVs(u) { this.uvs = u; return this; }
			setColors(c) { this.colors = c; return this; }
			setIndices(i) { this.indices = i; return this; }
			setTexture(t) { this.texture = t; return this; }

			computeNormals() {
				const pos = this.positions;
				if (!pos) return this;
				const numVerts = Math.floor(pos.length / 3);
				const norm = new Float32Array(numVerts * 3);

				if (this.indices) {
					const idx = this.indices;
					for (let i = 0; i + 2 < idx.length; i += 3) {
						const i0 = idx[i], i1 = idx[i + 1], i2 = idx[i + 2];
						const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
						const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
						const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];

						const abx = bx - ax, aby = by - ay, abz = bz - az;
						const acx = cx - ax, acy = cy - ay, acz = cz - az;

						const nx = aby * acz - abz * acy;
						const ny = abz * acx - abx * acz;
						const nz = abx * acy - aby * acx;

						norm[i0 * 3] += nx; norm[i0 * 3 + 1] += ny; norm[i0 * 3 + 2] += nz;
						norm[i1 * 3] += nx; norm[i1 * 3 + 1] += ny; norm[i1 * 3 + 2] += nz;
						norm[i2 * 3] += nx; norm[i2 * 3 + 1] += ny; norm[i2 * 3 + 2] += nz;
					}
				} else {
					for (let i = 0; i + 2 < numVerts; i += 3) {
						const ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2];
						const bx = pos[(i + 1) * 3], by = pos[(i + 1) * 3 + 1], bz = pos[(i + 1) * 3 + 2];
						const cx = pos[(i + 2) * 3], cy = pos[(i + 2) * 3 + 1], cz = pos[(i + 2) * 3 + 2];

						const abx = bx - ax, aby = by - ay, abz = bz - az;
						const acx = cx - ax, acy = cy - ay, acz = cz - az;

						const nx = aby * acz - abz * acy;
						const ny = abz * acx - abx * acz;
						const nz = abx * acy - aby * acx;

						norm[i * 3] = nx; norm[i * 3 + 1] = ny; norm[i * 3 + 2] = nz;
						norm[(i + 1) * 3] = nx; norm[(i + 1) * 3 + 1] = ny; norm[(i + 1) * 3 + 2] = nz;
						norm[(i + 2) * 3] = nx; norm[(i + 2) * 3 + 1] = ny; norm[(i + 2) * 3 + 2] = nz;
					}
				}

				for (let i = 0; i < numVerts; i++) {
					const x = norm[i * 3], y = norm[i * 3 + 1], z = norm[i * 3 + 2];
					const len = Math.hypot(x, y, z) || 1;
					norm[i * 3] = x / len;
					norm[i * 3 + 1] = y / len;
					norm[i * 3 + 2] = z / len;
				}

				this.normals = norm;
				return this;
			}
		}

		$.createMesh = (opt) => new Mesh(opt);
		$.Mesh = Mesh;

		$.drawMesh = (meshOrOpt) => {
			if (!meshOrOpt) return;
			const pos = meshOrOpt.positions;
			if (!pos || pos.length < 3) return;

			let norm = meshOrOpt.normals;
			if (!norm) {
				if (typeof meshOrOpt.computeNormals === 'function') {
					meshOrOpt.computeNormals();
					norm = meshOrOpt.normals;
				}
			}

			const uvs = meshOrOpt.uvs;
			const col = meshOrOpt.colors;
			const idx = meshOrOpt.indices;

			if (meshOrOpt.texture) {
				$.texture(meshOrOpt.texture);
			}

			const numVerts = Math.floor(pos.length / 3);

			if (idx && idx.length > 0) {
				for (let k = 0; k < idx.length; k++) {
					const i = idx[k];
					const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
					const n = norm ? [norm[i * 3], norm[i * 3 + 1], norm[i * 3 + 2]] : [0, 0, 1];
					const uv = uvs ? [uvs[i * 2], uvs[i * 2 + 1]] : [0, 0];
					const c = col ? [col[i * 4], col[i * 4 + 1], col[i * 4 + 2], col[i * 4 + 3]] : currentFill;

					const tp = transformPoint(p, modelMatrix);
					const tn = transformNormal(n, modelMatrix);
					pushVertex(triVertices, tp, tn, uv, c);
				}
			} else {
				for (let i = 0; i < numVerts; i++) {
					const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
					const n = norm ? [norm[i * 3], norm[i * 3 + 1], norm[i * 3 + 2]] : [0, 0, 1];
					const uv = uvs ? [uvs[i * 2], uvs[i * 2 + 1]] : [0, 0];
					const c = col ? [col[i * 4], col[i * 4 + 1], col[i * 4 + 2], col[i * 4 + 3]] : currentFill;

					const tp = transformPoint(p, modelMatrix);
					const tn = transformNormal(n, modelMatrix);
					pushVertex(triVertices, tp, tn, uv, c);
				}
			}
		};

		$.clear = () => {
			triVertices.length = 0;
			lineVertices.length = 0;
			triBatches.length = 0;
			lastBatchStart = 0;
			activeTextureBindGroup = defaultTextureBindGroup;
		};

		let renderCount = 0;

		// Flush WebGPU render commands
		$._render = () => {
			if (!Q5.device) {
				console.warn('[3D] _render: Q5.device not ready');
				return;
			}
			if (triVertices.length === 0 && lineVertices.length === 0) {
				return;
			}
			if (!triPipeline) initPipelines();
			ensureTextures();

			const device = Q5.device;
			let currentTextureView;
			let targetType = 'none';
			if (ctx) {
				try {
					currentTextureView = ctx.getCurrentTexture().createView();
					targetType = 'swapchain(ctx)';
				} catch (e) {
					if (targetTexture) {
						currentTextureView = targetTexture.createView();
						targetType = 'targetTexture(fallback)';
					} else return;
				}
			} else if (targetTexture) {
				currentTextureView = targetTexture.createView();
				targetType = 'targetTexture';
			} else {
				console.warn('[3D] _render: no texture view available');
				return;
			}

			renderCount++;
			// if (renderCount <= 5) {
			// 	console.log(`[3D] _render #${renderCount}: target=${targetType}, tris=${triVertices.length / FLOATS_PER_VERTEX}, lines=${lineVertices.length / FLOATS_PER_VERTEX}`);
			// }

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

			let colorAttachment;
			if (sampleCount > 1 && msaaColorTexture) {
				colorAttachment = {
					view: msaaColorTexture.createView(),
					resolveTarget: currentTextureView,
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: 'clear',
					storeOp: 'store'
				};
			} else {
				colorAttachment = {
					view: currentTextureView,
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					loadOp: 'clear',
					storeOp: 'store'
				};
			}

			// Command Encoder
			const commandEncoder = device.createCommandEncoder({ label: 'q5_3d_render_encoder' });
			const renderPass = commandEncoder.beginRenderPass({
				colorAttachments: [colorAttachment],
				depthStencilAttachment: {
					view: depthTexture.createView(),
					depthClearValue: 1.0,
					depthLoadOp: 'clear',
					depthStoreOp: 'store'
				}
			});

			// Draw Triangles
			if (triVertices.length > 0) {
				const totalVerts = Math.floor(triVertices.length / FLOATS_PER_VERTEX);
				if (totalVerts > lastBatchStart) {
					triBatches.push({
						start: lastBatchStart,
						count: totalVerts - lastBatchStart,
						bindGroup: activeTextureBindGroup
					});
				}

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

				for (const batch of triBatches) {
					renderPass.setBindGroup(1, batch.bindGroup);
					renderPass.draw(batch.count, 1, batch.start, 0);
				}

				triBatches.length = 0;
				lastBatchStart = 0;
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
				renderPass.setBindGroup(1, defaultTextureBindGroup);
				renderPass.setVertexBuffer(0, lineVertexBuffer);
				renderPass.draw(lineVertices.length / FLOATS_PER_VERTEX);
			}

			renderPass.end();
			device.queue.submit([commandEncoder.finish()]);

			// Reset queues for next frame
			triVertices.length = 0;
			lineVertices.length = 0;
			activeTextureBindGroup = defaultTextureBindGroup;
		};

		// Also execute render on clear or draw completion
		$.flush = $._render;
	};
})();

import * as THREE from 'three';

// Variables globales du Moteur
let engineInitialized = false;
let renderer, scene, camera, material;
const glassElements = [];

// (Optionnel) Pour le débogage dans la console
window.debugGlass = glassElements;

// ============================================================================
// 1. INITIALISATION DU MOTEUR
// ============================================================================
export function initLiquidGlassEngine(backgroundImageUrl) {
    if (engineInitialized) return;
    engineInitialized = true;

    // Création du Grand Canvas Global
    const canvas = document.createElement('canvas');
    canvas.id = 'masterLiquidCanvas';
    Object.assign(canvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '0',
        pointerEvents: 'none'
    });
    document.body.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // 🌟 CORRECTIF "TROU" : Empêche le moteur d'effacer les parents en dessinant les enfants
    renderer.autoClear = false;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        precision highp float;
        varying vec2 vUv;

        uniform vec4 uRect;
        uniform vec2 uWinRes;
        uniform float uRadius;
        uniform float uBezel;
        uniform float uThickness;
        uniform float uIOR;
        uniform float uSpecular;
        uniform float uTint;
        uniform float uBrightness; 
        
        uniform sampler2D uBgTex;
        uniform float uBgAspect;

        float sdRoundedRect(vec2 p, vec2 halfSize, float r) {
            vec2 q = abs(p) - halfSize + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
        }

        float surfaceHeight(float t) {
            float s = 1.0 - t;
            return pow(1.0 - s*s*s*s, 0.25);
        }

        vec3 sampleBg(vec2 uv) {
            float screenAspect = uWinRes.x / uWinRes.y;
            if (uBgAspect > screenAspect) {
                float s = screenAspect / uBgAspect;
                uv.x = (uv.x - 0.5) * s + 0.5;
            } else {
                float s = uBgAspect / screenAspect;
                uv.y = (uv.y - 0.5) * s + 0.5;
            }
            uv.y = 1.0 - uv.y;
            return texture2D(uBgTex, clamp(uv, 0.0, 1.0)).rgb;
        }

        vec3 sampleBgBlurred(vec2 uv, float radius) {
            if (radius < 0.1) return sampleBg(uv);
            vec3 sum = vec3(0.0);
            vec2 px = 1.0 / uWinRes;
            vec2 offsets[8];
            offsets[0] = vec2(-1.0, -1.0); offsets[1] = vec2( 1.0, -1.0);
            offsets[2] = vec2(-1.0,  1.0); offsets[3] = vec2( 1.0,  1.0);
            offsets[4] = vec2( 0.0, -1.0); offsets[5] = vec2( 0.0,  1.0);
            offsets[6] = vec2(-1.0,  0.0); offsets[7] = vec2( 1.0,  0.0);
            for (int i = 0; i < 8; i++) {
                sum += sampleBg(uv + offsets[i] * radius * px * 2.0);
            }
            return sum / 8.0;
        }

        void main() {
            vec2 p = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * vec2(uRect.z, uRect.w);
            vec2 halfSize = vec2(uRect.z, uRect.w) * 0.5;

            float sd = sdRoundedRect(p, halfSize, uRadius);

            // 🌟 ANTIALIASING MATHÉMATIQUE (Lissage parfait des bords)
            float edgeAlpha = smoothstep(1.0, -1.0, sd);

            if (edgeAlpha <= 0.0) {
                gl_FragColor = vec4(0.0); 
                return;
            }

            float distFromEdge = -sd;
            float safeMaxBezel = min(uRadius, min(halfSize.x, halfSize.y)) - 2.0;
            float safeBezel = max(min(uBezel, safeMaxBezel), 1.0); 

            float t = clamp(distFromEdge / safeBezel, 0.0, 1.0);
            float smoother = smoothstep(1.0, 0.95, t);
            float displacement = 0.0;

            if (t < 1.0) {
                float h = surfaceHeight(t);
                float dt = 0.001;
                float dh = (surfaceHeight(min(t + dt, 1.0)) - h) / dt;
                float slopeAngle = atan(dh * (uThickness / safeBezel));
                float sinR = clamp(sin(slopeAngle) / uIOR, -1.0, 1.0);
                displacement = h * uThickness * (tan(slopeAngle) - tan(asin(sinR)));
                displacement *= smoother; 
            }

            vec2 gradRaw = vec2(
                sdRoundedRect(p + vec2(0.5, 0.0), halfSize, uRadius) - sd,
                sdRoundedRect(p + vec2(0.0, 0.5), halfSize, uRadius) - sd
            );
            float gradLen = length(gradRaw);
            vec2 grad = gradLen > 0.0001 ? gradRaw / gradLen : vec2(0.0);

            vec2 screenUV = vec2(
                (uRect.x + vUv.x * uRect.z) / uWinRes.x,
                (uRect.y + (1.0 - vUv.y) * uRect.w) / uWinRes.y
            );

            vec2 refractedUV = screenUV + (-grad * displacement / uWinRes);
            vec3 color = sampleBgBlurred(refractedUV, 1.5); 
            
            color *= uBrightness;

            vec2 lightDir = normalize(vec2(0.5, -0.7));
            float rimDot = abs(dot(grad, lightDir));
            
            float specHighlight = 0.0;
            float innerShadow = 0.0;
            if (t < 1.0) {
                specHighlight = pow(rimDot * (1.0 - smoothstep(0.0, safeBezel * 0.4, distFromEdge)), 1.5) * smoother;
                innerShadow = (1.0 - smoothstep(0.0, safeBezel * 0.6, distFromEdge)) * smoother;
            }

            color += vec3(specHighlight * uSpecular);
            color *= mix(1.0, 0.7, innerShadow * 0.3);

            float innerRim = smoothstep(0.0, 2.0, distFromEdge) * (1.0 - smoothstep(2.0, 5.0, distFromEdge));
            color += vec3(innerRim * 0.15 * uSpecular);

            color = mix(color, vec3(1.0), uTint);

            gl_FragColor = vec4(color, edgeAlpha);
        }
    `;

    material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uWinRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uRect: { value: new THREE.Vector4(0, 0, 0, 0) },
            uRadius: { value: 38.0 },
            uBezel: { value: 38.0 },
            uThickness: { value: 40.0 },
            uIOR: { value: 3.0 },
            uSpecular: { value: 0.4 },
            uTint: { value: -0.1 },
            uBgTex: { value: null },
            uBgAspect: { value: 1.5 },
            uBrightness: { value: 0.7 },
        },
        transparent: true,
        depthTest: false,
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(backgroundImageUrl, (tex) => {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        material.uniforms.uBgTex.value = tex;
        material.uniforms.uBgAspect.value = tex.image.width / tex.image.height;
    });

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        material.uniforms.uWinRes.value.set(window.innerWidth, window.innerHeight);
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    requestAnimationFrame(renderLoop);
}

// ============================================================================
// 2. AJOUTER UN ÉLÉMENT EN VERRE (Avec gestion des intéractions)
// ============================================================================
export function addLiquidGlassElement(targetId, options = {}) {
    const target = document.getElementById(targetId);
    if (!target) {
        console.error(`Cible ${targetId} introuvable.`);
        return;
    }


    const baseOptions = {
        radius: options.radius || 38.0,
        bezel: options.bezel || 38.0,
        thickness: options.thickness || 40.0,
        ior: options.ior || 3.0,
        brightness: options.brightness || 0.7,
        specular: options.specular || 0.4,
        tint: options.tint || -0.1
    };

    const item = {
        element: target,
        base: { ...baseOptions },
        target: { ...baseOptions },
        current: { ...baseOptions },
        interactive: options.interactive || false
    };

    if (item.interactive) {
        target.addEventListener('mouseenter', () => {
            item.target.thickness = item.base.thickness * 2.0; 
            item.target.brightness = item.base.brightness + 0.15;
        });

        target.addEventListener('mouseleave', () => {
            item.target.thickness = item.base.thickness;
            item.target.brightness = item.base.brightness;
            item.target.ior = item.base.ior;
        });

        target.addEventListener('mousedown', () => {
            item.target.thickness = item.base.thickness * 3.5;
            item.target.ior = item.base.ior * 1.5; 
        });

        target.addEventListener('mouseup', () => {
            item.target.thickness = item.base.thickness * 2.0;
            item.target.ior = item.base.ior;
        });
    }

    glassElements.push(item);
}

// ============================================================================
// 3. LA BOUCLE DE RENDU OPTIMISÉE (Auto-nettoyage + Tri intelligent)
// ============================================================================
function renderLoop() {
    requestAnimationFrame(renderLoop);
    if (!renderer || glassElements.length === 0) return;

    // 🌟 GESTION DE LA MÉMOIRE : Supprime les éléments qui ne sont plus sur la page
    for (let i = glassElements.length - 1; i >= 0; i--) {
        if (!document.body.contains(glassElements[i].element)) {
            glassElements.splice(i, 1);
        }
    }

    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    const winH = window.innerHeight;

    // 🌟 TRI INTELLIGENT (ALGORITHME DU PEINTRE)
    // Trie par surface : Les grands fonds d'abord, les petits boutons ensuite !
    const sortedElements = [...glassElements].sort((a, b) => {
        const rectA = a.element.getBoundingClientRect();
        const rectB = b.element.getBoundingClientRect();
        const areaA = rectA.width * rectA.height;
        const areaB = rectB.width * rectB.height;
        return areaB - areaA; 
    });

    // Rendu des éléments triés
    sortedElements.forEach(item => {
        const rect = item.element.getBoundingClientRect();
        
        // Optimisation : On ignore les éléments invisibles ou hors écran
        if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > winH) return;

        // 🌟 L'ANIMATION MAGIQUE (LERP)
        const lerpSpeed = 0.15;
        item.current.thickness += (item.target.thickness - item.current.thickness) * lerpSpeed;
        item.current.brightness += (item.target.brightness - item.current.brightness) * lerpSpeed;
        item.current.ior += (item.target.ior - item.current.ior) * lerpSpeed;

        // Injection des valeurs dans le Shader
        material.uniforms.uRect.value.set(rect.left, rect.top, rect.width, rect.height);
        material.uniforms.uRadius.value = item.current.radius;
        material.uniforms.uBezel.value = item.current.bezel;
        material.uniforms.uThickness.value = item.current.thickness;
        material.uniforms.uIOR.value = item.current.ior;
        material.uniforms.uBrightness.value = item.current.brightness;
        material.uniforms.uSpecular.value = item.current.specular;
        material.uniforms.uTint.value = item.current.tint;

        // "Découpage" de la zone exacte pour cet élément
        const glY = winH - rect.bottom; 
        renderer.setViewport(rect.left, glY, rect.width, rect.height);
        renderer.setScissor(rect.left, glY, rect.width, rect.height);

        renderer.render(scene, camera);
    });
}
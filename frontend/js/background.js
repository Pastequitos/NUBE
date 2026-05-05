import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function initCursorFollower() {
    const NEON_GLOW_SIZE = 0.005;
    const NEON_CORE_SIZE = 0.0015;
    const BLOOM_STRENGTH = 6.0;
    const BLOOM_RADIUS = 1.0;
    const COLOR_IDLE = 0x5865F2; 
    const COLOR_FAST = 0xff0000; 
    const IDLE_SPEED = 0.002; 
    const POINTS_COUNT = 40;
    const LERP_FACTOR = 0.6;
    const CAMERA_Z = 10;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.z = CAMERA_Z;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); 
    renderer.toneMapping = THREE.ReinhardToneMapping; 
    renderer.domElement.id = 'three-canvas';
    document.body.appendChild(renderer.domElement);

    const points = [];
    for (let i = 0; i < POINTS_COUNT; i++) {
        points.push(new THREE.Vector3(0, 0, 0));
    }

    const typedPositions = new Float32Array(POINTS_COUNT * 3);
    const lineGeometry = new LineGeometry();

    const glowMaterial = new LineMaterial({
        color: COLOR_IDLE,
        linewidth: NEON_GLOW_SIZE, 
        transparent: true,
        opacity: 0.8,
    });
    
    const coreMaterial = new LineMaterial({
        color: 0xffffff,     
        linewidth: NEON_CORE_SIZE, 
        transparent: true,
        opacity: 1.0,
    });
    
    const glowLine = new Line2(lineGeometry, glowMaterial);
    const coreLine = new Line2(lineGeometry, coreMaterial);
    scene.add(glowLine);
    scene.add(coreLine);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM_STRENGTH, BLOOM_RADIUS, 0.0);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const colorIdleObj = new THREE.Color(COLOR_IDLE); 
    const colorFastObj = new THREE.Color(COLOR_FAST); 
    let currentColorRatio = 0; 

    let velocityX = 0;
    let velocityY = 0;
    let isIdle = false;
    let idleTimer;
    let ghostX = 0;
    let ghostY = 0;
    let targetX = 0;
    let targetY = 0;

    let viewHalfHeight;
    let viewHalfWidth;
    let circleRadius;

    function updateCameraBounds() {
        const fovRadian = (camera.fov * Math.PI) / 180;
        viewHalfHeight = Math.tan(fovRadian / 2) * camera.position.z;
        viewHalfWidth = viewHalfHeight * camera.aspect;
        circleRadius = Math.min(window.innerWidth, window.innerHeight) * 0.25;
    }
    updateCameraBounds();

    function setTargetFromScreen(clientX, clientY) {
        const ndcX = (clientX / window.innerWidth) * 2 - 1;
        const ndcY = -(clientY / window.innerHeight) * 2 + 1;
        targetX = ndcX * viewHalfWidth;
        targetY = ndcY * viewHalfHeight;
    }

    window.addEventListener('mousemove', (e) => {
        isIdle = false;
        clearTimeout(idleTimer);
        
        setTargetFromScreen(e.clientX, e.clientY);
        ghostX = targetX;
        ghostY = targetY;

        idleTimer = setTimeout(() => {
            isIdle = true;
        }, 2000); 
    });

    function animate() {
        requestAnimationFrame(animate);

        if (isIdle) {
            const time = performance.now() * IDLE_SPEED;
            const circleX = (window.innerWidth / 2) + Math.cos(time) * circleRadius;
            const circleY = (window.innerHeight / 2) + Math.sin(time) * circleRadius;
            
            setTargetFromScreen(circleX, circleY);
            
            ghostX += (targetX - ghostX) * 0.05; 
            ghostY += (targetY - ghostY) * 0.05;
            
            targetX = ghostX;
            targetY = ghostY;
        }
        
        velocityX = (targetX - points[0].x) * LERP_FACTOR;
        velocityY = (targetY - points[0].y) * LERP_FACTOR;

        const speed = Math.hypot(velocityX, velocityY) * 4.0;
        currentColorRatio += (Math.min(speed / 0.8, 1.0) - currentColorRatio) * 0.1;
        glowMaterial.color.lerpColors(colorIdleObj, colorFastObj, currentColorRatio);

        for (let i = POINTS_COUNT - 1; i > 0; i--) {
            points[i].x = points[i - 1].x;
            points[i].y = points[i - 1].y;
        }

        points[0].x += velocityX;
        points[0].y += velocityY;

        for (let i = 0; i < POINTS_COUNT; i++) {
            const i3 = i * 3;
            typedPositions[i3] = points[i].x;
            typedPositions[i3 + 1] = points[i].y;
            typedPositions[i3 + 2] = 0;
        }
        lineGeometry.setPositions(typedPositions);

        composer.render();
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        updateCameraBounds();
        glowMaterial.resolution.set(window.innerWidth, window.innerHeight);
        coreMaterial.resolution.set(window.innerWidth, window.innerHeight);
    });
}
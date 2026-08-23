import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// --- Khởi tạo Scene, Camera, Renderer ---
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffe8e2, 0x26302a, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(2, 4, 5);
scene.add(keyLight);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

// --- Tải mô hình và tạo hệ thống hạt siêu mịn ---
const loader = new GLTFLoader();
const PARTICLE_COUNT = 1200000;
let particleSystem;

loader.load('flower-bouquet/source/flower_bouquet.glb', (gltf) => {
    const vertices = [];
    const colors = [];
    const phases = [];
    const meshes = [];

    // Gom tất cả các khối trong mô hình
    gltf.scene.traverse((child) => {
        if (child.isMesh) meshes.push(child);
    });
    gltf.scene.updateMatrixWorld(true);

    const tempPosition = new THREE.Vector3();
    const innerPosition = new THREE.Vector3();
    const bounds = new THREE.Box3();
    meshes.forEach((mesh) => bounds.union(new THREE.Box3().setFromObject(mesh)));
    const modelCenter = bounds.getCenter(new THREE.Vector3());
    const modelSize = bounds.getSize(new THREE.Vector3());
    const meshWeights = meshes.map((mesh) => {
        const isStem = /stem/i.test(mesh.name);
        const isGreen = /leav|plant|green|foliage/i.test(mesh.name);
        const isRibbon = /ribbon/i.test(mesh.name);
        return isStem ? 0.4 : (isGreen ? 0.28 : (isRibbon ? 0.7 : 2.1));
    });
    const totalWeight = meshWeights.reduce((sum, weight) => sum + weight, 0);

    meshes.forEach((mesh, meshIndex) => {
        const sampler = new MeshSurfaceSampler(mesh).build();
        // Lấy màu gốc của bộ phận đó (ví dụ: cánh hoa, lá cây)
        const isStem = /stem/i.test(mesh.name);
        const isGreen = /leav|plant|green|foliage/i.test(mesh.name);
        const isRibbon = /ribbon/i.test(mesh.name);
        const isPetal = /^petal/i.test(mesh.name);
        const flowerMeshPalette = [0xfffaf5, 0xe9a5ad, 0xffffff, 0xf1b3b5, 0xffe7dd, 0xd9828c];
        const greenPalette = [0xb7c1ad, 0x9cae9d, 0xd0d0bf, 0x829486, 0xc3c8b9];
        const stemPalette = [0x9f5b5d, 0xb87373, 0x7f4b50, 0xc48782];
        const ribbonPalette = [0xffffff, 0xfffaf4, 0xf5eee5, 0xe9e1d8];
        const pointsPerMesh = Math.max(80, Math.floor(PARTICLE_COUNT * meshWeights[meshIndex] / totalWeight));
        const meshBounds = new THREE.Box3().setFromObject(mesh);
        const meshCenter = meshBounds.getCenter(new THREE.Vector3());
        const meshExtent = meshBounds.getSize(new THREE.Vector3());

        for (let i = 0; i < pointsPerMesh; i++) {
            sampler.sample(tempPosition);
            tempPosition.applyMatrix4(mesh.matrixWorld);

            // Lưu tọa độ hạt
            vertices.push(tempPosition.x, tempPosition.y, tempPosition.z);

            // Lưu màu sắc tương ứng với tọa độ đó
            const localX = (tempPosition.x - meshCenter.x) / Math.max(meshExtent.x, 0.001);
            const localY = (tempPosition.y - meshCenter.y) / Math.max(meshExtent.y, 0.001);
            const localZ = (tempPosition.z - meshCenter.z) / Math.max(meshExtent.z, 0.001);
            const petalRadius = Math.sqrt(localX * localX + localY * localY + localZ * localZ);
            const petalAngle = Math.atan2(localY, localX);
            const petalLayer = Math.sin(petalRadius * 18.0 + petalAngle * 2.5 + localZ * 5.0);
            const flowerBase = new THREE.Color(flowerMeshPalette[meshIndex % flowerMeshPalette.length]);
            const petalWhite = new THREE.Color(0xfffaf5);
            const flowerHighlight = isPetal && petalLayer > 0.05;
            const particleColor = flowerHighlight
                ? petalWhite.lerp(flowerBase, Math.random() * 0.28)
                : flowerBase.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.08);
            const palette = isRibbon ? ribbonPalette : (isStem ? stemPalette : greenPalette);
            const finalColor = isRibbon || isStem || isGreen
                ? new THREE.Color(palette[Math.floor(Math.random() * palette.length)])
                : particleColor;
            colors.push(finalColor.r, finalColor.g, finalColor.b);
            phases.push(Math.random() * Math.PI * 2);

            if (isPetal) {
                innerPosition.copy(tempPosition).lerp(modelCenter, 0.1);
                vertices.push(innerPosition.x, innerPosition.y, innerPosition.z);
                colors.push(finalColor.r, finalColor.g, finalColor.b);
                phases.push(Math.random() * Math.PI * 2);
            } else {
                // Fill foliage and accessories without merging separate flower petals.
                innerPosition.copy(tempPosition).lerp(modelCenter, 0.16);
                vertices.push(innerPosition.x, innerPosition.y, innerPosition.z);
                colors.push(finalColor.r, finalColor.g, finalColor.b);
                phases.push(Math.random() * Math.PI * 2);
                innerPosition.copy(tempPosition).lerp(modelCenter, 0.34);
                vertices.push(innerPosition.x, innerPosition.y, innerPosition.z);
                colors.push(finalColor.r, finalColor.g, finalColor.b);
                phases.push(Math.random() * Math.PI * 2);
            }
        }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    const largestDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
    geometry.translate(-modelCenter.x, -modelCenter.y, -modelCenter.z);

    const detailModel = gltf.scene;
    detailModel.position.copy(modelCenter).multiplyScalar(-1);
    detailModel.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        child.material = materials.map((sourceMaterial) => {
            const material = sourceMaterial.clone();
            material.transparent = true;
            material.opacity = 0.88;
            material.depthWrite = false;
            return material;
        });
    });
    scene.add(detailModel);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pointSize: { value: Math.max(largestDimension * 0.005, 0.0018) },
            flowStrength: { value: Math.max(largestDimension * 0.024, 0.001) }
        },
        vertexShader: `
            uniform float time;
            uniform float pointSize;
            uniform float flowStrength;
            attribute float phase;
            varying vec3 vColor;
            void main() {
                vec3 animatedPosition = position;
                float heatWave = time * 1.45 + phase + position.y * 8.0;
                float risingHeat = sin(heatWave) * 0.6 + cos(time * 0.72 + phase * 1.6) * 0.4;
                vec3 radialDirection = normalize(position + vec3(0.0, 0.12, 0.0));
                float solarPulse = max(0.0, sin(time * 1.8 + phase * 1.3 + position.y * 6.0));
                animatedPosition += radialDirection * solarPulse * flowStrength * 0.72;
                animatedPosition.y += risingHeat * flowStrength * 0.9;
                animatedPosition.x += sin(heatWave * 0.8 + position.z * 5.0) * flowStrength * 0.62;
                animatedPosition.x += cos(time * 0.8 + phase + position.y * 10.0) * flowStrength * 0.28;
                animatedPosition.z += cos(heatWave * 0.72 + position.x * 5.0) * flowStrength * 0.58;
                animatedPosition.z += sin(time * 0.65 + phase * 1.4 + position.y * 7.0) * flowStrength * 0.25;
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
                gl_PointSize = clamp(pointSize * (300.0 / -mvPosition.z), 0.9, 3.6);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                float edge = distance(gl_PointCoord, vec2(0.5));
                float alpha = 1.0 - smoothstep(0.22, 0.5, edge);
                gl_FragColor = vec4(vColor * 1.08, alpha * 0.38);
            }
        `,
        vertexColors: true,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
    const fitDistance = largestDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, 0, fitDistance * 1.25);
    camera.near = Math.max(largestDimension / 100, 0.01);
    camera.far = largestDimension * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
});

// --- Vòng lặp Render ---
function animate() {
    requestAnimationFrame(animate);
    if (particleSystem) {
        particleSystem.rotation.y += 0.002;
        particleSystem.material.uniforms.time.value = performance.now() * 0.001;
    }
    controls.update();
    renderer.render(scene, camera);
}
animate();

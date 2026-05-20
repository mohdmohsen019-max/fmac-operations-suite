import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function ThreeScene({ theme = 'landing' }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    
    // Adjust colors based on theme
    let primaryColor = 0xe8002d; // Crimson/Red
    let secondaryColor = 0xffffff;
    
    if (theme === 'logistics') { primaryColor = 0x0ea5e9; secondaryColor = 0x0284c7; }
    if (theme === 'fleet') { primaryColor = 0xf59e0b; secondaryColor = 0xb45309; }

    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 30;
    camera.position.y = 10;
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Objects
    const group = new THREE.Group();
    scene.add(group);

    // 1. Grid
    const gridHelper = new THREE.GridHelper(100, 50, primaryColor, 0x222222);
    gridHelper.position.y = -10;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    group.add(gridHelper);

    // 2. Floating Particles
    const geometry = new THREE.BufferGeometry();
    const particlesCount = 500;
    const posArray = new Float32Array(particlesCount * 3);
    
    for(let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 100;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const material = new THREE.PointsMaterial({
      size: 0.15,
      color: primaryColor,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    const particlesMesh = new THREE.Points(geometry, material);
    group.add(particlesMesh);

    // 3. Central Geometry (Abstract representation of FMAC operations)
    const torusGeometry = new THREE.TorusKnotGeometry(6, 1.5, 200, 32);
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: primaryColor,
      emissiveIntensity: 0.2,
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    group.add(torus);

    // Lighting
    const pointLight = new THREE.PointLight(primaryColor, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;

    const onDocumentMouseMove = (event) => {
      mouseX = (event.clientX - windowHalfX) * 0.05;
      mouseY = (event.clientY - windowHalfY) * 0.05;
    };

    document.addEventListener('mousemove', onDocumentMouseMove);

    // Animation Loop
    const clock = new THREE.Clock();
    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      targetX = mouseX * 0.001;
      targetY = mouseY * 0.001;

      group.rotation.y += 0.002;
      particlesMesh.rotation.y = -elapsedTime * 0.05;
      torus.rotation.x = elapsedTime * 0.2;
      torus.rotation.y = elapsedTime * 0.3;

      // Parallax effect
      camera.position.x += (mouseX * 0.1 - camera.position.x) * 0.05;
      camera.position.y += (-mouseY * 0.1 - camera.position.y + 10) * 0.05;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', onDocumentMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      torusGeometry.dispose();
      torusMaterial.dispose();
      renderer.dispose();
    };
  }, [theme]);

  return (
    <div 
      ref={mountRef} 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, 
        width: '100%', height: '100%', 
        zIndex: 0, 
        pointerEvents: 'none',
        background: 'transparent'
      }} 
    />
  );
}

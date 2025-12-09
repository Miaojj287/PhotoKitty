import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import './App.css';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  Sparkles,
  useTexture
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 (1.jpg 到 52.jpg) ---
const TOTAL_NUMBERED_PHOTOS = 52;
const bodyPhotoPaths = Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `${import.meta.env.BASE_URL}photos/${i + 1}.jpg`);

// --- 视觉配置 ---
const CONFIG = {
  colors: {
    pink: '#ff69b4',
    hotPink: '#ff1493',
    lightPink: '#ffb6c1',
    white: '#ffffff',
    black: '#1a1a1a',
    yellow: '#ffd700',
    blue: '#87cefa',
    borders: ['#ffe6f2', '#fff0f5', '#e6e6fa', '#ffb6c1', '#f0f8ff'],
  },
  counts: {
    total: 400,
  },
  photos: {
    body: bodyPhotoPaths
  }
};

// --- Helper: Geometries ---
const useGeometries = () => {
  return useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 32, 32);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(0.2, 0.2, 2, 16);

    // Heart Shape
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0.25, 0.25);
    heartShape.bezierCurveTo(0.25, 0.25, 0.20, 0, 0, 0);
    heartShape.bezierCurveTo(-0.30, 0, -0.30, 0.35, -0.30, 0.35);
    heartShape.bezierCurveTo(-0.30, 0.55, -0.10, 0.77, 0.25, 0.95);
    heartShape.bezierCurveTo(0.60, 0.77, 0.80, 0.55, 0.80, 0.35);
    heartShape.bezierCurveTo(0.80, 0.35, 0.80, 0, 0.50, 0);
    heartShape.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
    const heart = new THREE.ExtrudeGeometry(heartShape, { depth: 0.2, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.1, bevelThickness: 0.1 });
    heart.center();

    const photoPlane = new THREE.PlaneGeometry(1, 1);
    const photoBorder = new THREE.PlaneGeometry(1.2, 1.5);

    return { sphere, box, cylinder, heart, photoPlane, photoBorder };
  }, []);
};

// --- Helper: Hello Kitty Point Generation ---
type ElementType = 'PHOTO' | 'HEART' | 'BALLOON' | 'GIFT' | 'EYE' | 'NOSE' | 'WHISKER' | 'BOW';

const getHelloKittyData = (index: number) => {
  // Distribute points to ensure features are drawn
  // 0-1: Eyes
  // 2: Nose
  // 3-8: Whiskers
  // 9-35: Bow
  // Rest: Body/Head/Ears

  let type: ElementType = 'PHOTO';
  let pos = new THREE.Vector3();
  let color = CONFIG.colors.white;
  let scale = 1;
  let rotation = new THREE.Euler();

  if (index === 0 || index === 1) {
    // Eyes
    type = 'EYE';
    color = CONFIG.colors.black;
    scale = 0.8;
    pos.set(index === 0 ? -1.5 : 1.5, -0.5, 3.8);
  } else if (index === 2) {
    // Nose
    type = 'NOSE';
    color = CONFIG.colors.yellow;
    scale = 0.6;
    pos.set(0, -1.2, 4);
  } else if (index >= 3 && index <= 8) {
    // Whiskers
    type = 'WHISKER';
    color = CONFIG.colors.black;
    scale = 1;
    const side = index < 6 ? -1 : 1; // Left (-1) or Right (1)
    const row = (index - 3) % 3; // 0 (Top), 1 (Middle), 2 (Bottom)

    // Adjust positions to be on the cheeks
    // Nose is at y=-1.2. Eyes at y=-0.5.
    // Whiskers should be roughly centered around y=-1.2
    const yBase = -0.8;
    const yStep = 0.6;

    const xPos = side * 4.5; // Slightly outside the face (x radius is 4)
    const yPos = yBase - (row * yStep);
    const zPos = 3; // Forward on the face

    pos.set(xPos, yPos, zPos);

    // Rotation
    // Cylinder is Y-up.
    // Right side (1): Rotate Z to -90 deg to point Right.
    // Left side (-1): Rotate Z to +90 deg to point Left.

    const tilt = 0.15;
    const rowTilt = row === 0 ? tilt : row === 1 ? 0 : -tilt;

    if (side === 1) {
      rotation.z = -Math.PI / 2 + rowTilt;
    } else {
      rotation.z = Math.PI / 2 - rowTilt;
    }

    rotation.y = 0;
    rotation.x = 0;
  } else if (index >= 9 && index <= 35) {
    // Bow (Pink Hearts)
    type = 'BOW';
    color = CONFIG.colors.hotPink;
    scale = 0.8 + Math.random() * 0.4;

    // Bow shape logic
    const part = Math.random();
    let center, radius, scaleX = 1, scaleY = 1;
    if (part < 0.2) { center = new THREE.Vector3(0, 0, 0); radius = 0.5; }
    else if (part < 0.6) { center = new THREE.Vector3(-1.2, 0, 0); radius = 0.8; scaleY = 1.2; }
    else { center = new THREE.Vector3(1.2, 0, 0); radius = 0.8; scaleY = 1.2; }

    const u = Math.random(); const v = Math.random();
    const theta = 2 * Math.PI * u; const phi = Math.acos(2 * v - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta) * scaleX;
    const y = radius * Math.sin(phi) * Math.sin(theta) * scaleY;
    const z = radius * Math.cos(phi) * 0.5;

    pos.set(x, y, z).add(center);
    pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.5);
    pos.add(new THREE.Vector3(3, 2.5, 2.5));
  } else {
    // Body/Head/Ears
    const r = Math.random();

    // Decide Element Type for Body/Head
    const typeR = Math.random();
    // Middle ground: 50% Photos, 25% Balloons, 15% Hearts, 10% Gifts
    if (typeR < 0.5) type = 'PHOTO';
    else if (typeR < 0.75) type = 'BALLOON';
    else if (typeR < 0.9) type = 'HEART';
    else type = 'GIFT';

    if (type === 'HEART' || type === 'GIFT') {
      color = Math.random() > 0.5 ? CONFIG.colors.white : CONFIG.colors.lightPink;
    } else {
      color = CONFIG.colors.white;
    }

    if (r < 0.65) { // Head (Thick Shell)
      // Generate points on a "thick surface" to look solid but keep inside empty
      const u = Math.random(); const v = Math.random();
      const theta = 2 * Math.PI * u; const phi = Math.acos(2 * v - 1);

      // Radius varies slightly to create "thickness" (3.5 to 4.0)
      // This fills gaps without filling the core
      const rBase = 3.5 + Math.random() * 0.5;

      pos.set(rBase * Math.sin(phi) * Math.cos(theta), (rBase * 0.75) * Math.sin(phi) * Math.sin(theta), (rBase * 0.75) * Math.cos(phi));
    } else if (r < 0.85) { // Ears
      const isLeft = Math.random() > 0.5;
      const u = Math.random(); const v = Math.random();
      const theta = 2 * Math.PI * u; const phi = Math.acos(2 * v - 1);
      const radius = 1.2;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      const offset = new THREE.Vector3(isLeft ? -3.5 : 3.5, 3, 0);
      const rotationZ = isLeft ? 0.5 : -0.5;
      pos.set(x, y, z).applyAxisAngle(new THREE.Vector3(0, 0, 1), rotationZ).add(offset);
    } else { // Body (Small cone base)
      const u = Math.random(); const v = Math.random();
      const theta = 2 * Math.PI * u;
      const h = -4 + v * 3; // -4 to -1
      const r = 2.5 * (1 - (h + 4) / 4) + 1.5;
      pos.set(r * Math.cos(theta), h, r * Math.sin(theta));

      // Outfit color (Blue/Red usually, let's go Pink/Blue)
      if (type !== 'PHOTO') color = Math.random() > 0.5 ? CONFIG.colors.blue : CONFIG.colors.pink;
    }
  }

  return { type, pos, color, scale, rotation };
};



import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// --- Component: Particle Text ---
const ParticleText = ({ text, position, scale = 1, state }: { text: string, position: [number, number, number], scale?: number, state: 'CHAOS' | 'FORMED' }) => {
  const [particles, setParticles] = useState<{ targetPos: THREE.Vector3, chaosPos: THREE.Vector3, size: number, speed: number }[]>([]);
  const mesh = useRef<THREE.Points>(null);

  useEffect(() => {
    const loader = new FontLoader();
    loader.load(`${import.meta.env.BASE_URL}fonts/helvetiker_regular.typeface.json`, (font) => {
      const geometry = new TextGeometry(text, {
        font: font,
        size: 3,
        height: 0.2,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.05,
        bevelOffset: 0,
        bevelSegments: 5,
      });

      geometry.center();

      // Sample points using MeshSurfaceSampler
      const count = 8000; // Increased density
      const tempParticles = [];

      // Create a dummy mesh for sampling
      const material = new THREE.MeshBasicMaterial();
      const sampleMesh = new THREE.Mesh(geometry, material);
      const sampler = new MeshSurfaceSampler(sampleMesh).build();

      const _position = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        sampler.sample(_position);
        const targetPos = _position.clone();

        const chaosPos = new THREE.Vector3(
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50
        );

        // Random speed (0.01 to 0.1) for organic dispersion without delay
        const speed = 0.01 + Math.random() * 0.09;

        tempParticles.push({ targetPos, chaosPos, size: Math.random() * 0.15 + 0.05, speed });
      }
      setParticles(tempParticles);
    });
  }, [text]);

  useFrame((stateObj, delta) => {
    if (!mesh.current || particles.length === 0) return;

    const time = stateObj.clock.elapsedTime;
    const isFormed = state === 'FORMED';
    const positions = mesh.current.geometry.attributes.position.array as Float32Array;

    particles.forEach((p, i) => {
      const currentPos = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      let target;

      if (isFormed) {
        target = p.targetPos;
      } else {
        // Chaos motion
        target = p.chaosPos.clone();
        target.y += Math.sin(time + i) * 2;
      }

      // Lerp with delta time - same as Kitty's logic
      currentPos.lerp(target, delta * (isFormed ? 1.5 : 0.5));

      positions[i * 3] = currentPos.x;
      positions[i * 3 + 1] = currentPos.y;
      positions[i * 3 + 2] = currentPos.z;
    });

    mesh.current.geometry.attributes.position.needsUpdate = true;
  });

  if (particles.length === 0) return null;

  const positions = new Float32Array(particles.length * 3);
  // Initialize positions
  particles.forEach((p, i) => {
    positions[i * 3] = p.chaosPos.x;
    positions[i * 3 + 1] = p.chaosPos.y;
    positions[i * 3 + 2] = p.chaosPos.z;
  });

  return (
    <points ref={mesh} position={position} scale={[scale, scale, scale]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.2}
        color="#d10056" // Darker Pink
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        sizeAttenuation={true}
        depthWrite={false}
      />
    </points>
  );
};

// --- Component: Birthday Message (Advanced) ---
const BirthdayMessage = () => {
  // Always keep formed state, ignore gesture input
  return (
    <group>
      <ParticleText text="Happy Birthday" position={[0, 2, 0]} state="FORMED" />
      <ParticleText text="Clarke!" position={[0, -2, 0]} scale={1.5} state="FORMED" />
    </group>
  );
};

// --- Component: Composition Elements ---
const CompositionElements = ({ state, galleryMode, currentPhotoIndex }: { state: 'CHAOS' | 'FORMED', galleryMode: boolean, currentPhotoIndex: number }) => {
  const textures = useTexture(CONFIG.photos.body);
  const count = CONFIG.counts.total;
  const groupRef = useRef<THREE.Group>(null);
  const geoms = useGeometries();

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const { type, pos: targetPos, color, scale, rotation } = getHelloKittyData(i);

      const chaosPos = new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
      const chaosRotation = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      return {
        type, targetPos, chaosPos, color, scale, targetRotation: rotation,
        currentPos: chaosPos.clone(),
        chaosRotation,
        textureIndex: i % textures.length,
        rotationSpeed: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5 }
      };
    });
  }, [textures, count]);

  // Get unique photo indices for gallery (one per texture, max 52)
  // IMPORTANT: Must use data's type, not getHelloKittyData which has random type
  const uniquePhotoIndices = useMemo(() => {
    const seenTextures = new Set<number>();
    const indices: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].type === 'PHOTO') {
        const textureIndex = data[i].textureIndex;
        if (!seenTextures.has(textureIndex)) {
          seenTextures.add(textureIndex);
          indices.push(i);
        }
      }
    }
    return indices;
  }, [data]);

  // Calculate gallery positions for photos with proper spacing
  const getGalleryPosition = (photoIdx: number, totalPhotos: number, focusedIndex: number) => {
    const radius = 20; // Larger radius for better spacing
    // Calculate angle offset so focused photo is at front (z positive)
    const angleOffset = (focusedIndex / totalPhotos) * Math.PI * 2;
    const angle = (photoIdx / totalPhotos) * Math.PI * 2 - angleOffset;
    return new THREE.Vector3(
      Math.sin(angle) * radius,
      0,
      Math.cos(angle) * radius
    );
  };

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';

    groupRef.current.children.forEach((group, i) => {
      const objData = data[i];
      let target: THREE.Vector3;

      // Check if this particle is a unique photo for gallery
      const isUniqueGalleryPhoto = galleryMode && uniquePhotoIndices.includes(i);

      if (isUniqueGalleryPhoto) {
        // Gallery mode: unique photos go to circular gallery positions
        const photoIndexInGallery = uniquePhotoIndices.indexOf(i);
        target = getGalleryPosition(photoIndexInGallery, uniquePhotoIndices.length, currentPhotoIndex);
      } else if (isFormed) {
        target = objData.targetPos;
      } else {
        target = objData.chaosPos;
      }

      // Lerp position with smooth transition
      const lerpSpeed = galleryMode ? 2.0 : (isFormed ? 1.5 : 0.5);
      objData.currentPos.lerp(target, delta * lerpSpeed);
      group.position.copy(objData.currentPos);

      // Rotation logic
      if (isUniqueGalleryPhoto) {
        // Face outward from center in gallery mode (add PI rotation)
        group.lookAt(0, 0, 0);
        group.rotateY(Math.PI); // Face outward, not inward
      } else if (isFormed) {
        if (objData.type === 'PHOTO') {
          group.lookAt(0, 0, 0); group.rotateY(Math.PI);
        } else if (objData.type === 'WHISKER') {
          group.rotation.set(objData.targetRotation.x, objData.targetRotation.y, objData.targetRotation.z);
        } else {
          // Others just face forward or random
          group.rotation.set(0, 0, 0);
        }
      } else {
        group.rotation.x += delta * objData.rotationSpeed.x;
        group.rotation.y += delta * objData.rotationSpeed.y;
        group.rotation.z += delta * objData.rotationSpeed.z;
      }

      // Visibility in gallery mode: 
      // - Show only unique photos in gallery
      // - Hide duplicates and non-photo elements
      if (galleryMode) {
        if (isUniqueGalleryPhoto) {
          group.visible = true;
        } else {
          group.visible = false;
        }
      } else {
        group.visible = true;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <group key={i} scale={galleryMode && obj.type === 'PHOTO' ? [2, 2, 2] : [obj.scale, obj.scale, obj.scale]} rotation={state === 'CHAOS' ? obj.chaosRotation : [0, 0, 0]}>

          {obj.type === 'PHOTO' && (
            <group>
              <mesh geometry={geoms.photoPlane} position={[0, 0, 0.01]}>
                <meshStandardMaterial map={textures[obj.textureIndex]} />
              </mesh>
              <mesh geometry={geoms.photoBorder} position={[0, -0.15, 0]}>
                <meshStandardMaterial color={CONFIG.colors.white} />
              </mesh>
              {/* Backside */}
              <mesh geometry={geoms.photoBorder} position={[0, -0.15, -0.01]} rotation={[0, Math.PI, 0]}>
                <meshStandardMaterial color={CONFIG.colors.lightPink} />
              </mesh>
            </group>
          )}

          {obj.type === 'HEART' && (
            <mesh geometry={geoms.heart} rotation={[Math.PI, 0, 0]}>
              <meshStandardMaterial color={obj.color} roughness={0.2} metalness={0.1} />
            </mesh>
          )}

          {obj.type === 'BOW' && (
            <mesh geometry={geoms.heart} rotation={[Math.PI, 0, 0]}>
              <meshStandardMaterial color={obj.color} roughness={0.2} metalness={0.1} />
            </mesh>
          )}

          {obj.type === 'BALLOON' && (
            <mesh geometry={geoms.sphere} scale={[0.5, 0.5, 0.5]}>
              <meshStandardMaterial color={obj.color} roughness={0.1} metalness={0.2} />
            </mesh>
          )}

          {obj.type === 'GIFT' && (
            <mesh geometry={geoms.box} scale={[0.6, 0.6, 0.6]}>
              <meshStandardMaterial color={obj.color} roughness={0.5} />
            </mesh>
          )}

          {obj.type === 'EYE' && (
            <mesh geometry={geoms.sphere} scale={[0.4, 0.6, 0.2]}>
              <meshStandardMaterial color={obj.color} roughness={0} metalness={0.5} />
            </mesh>
          )}

          {obj.type === 'NOSE' && (
            <mesh geometry={geoms.sphere} scale={[0.4, 0.3, 0.2]}>
              <meshStandardMaterial color={obj.color} roughness={0.2} metalness={0.2} />
            </mesh>
          )}

          {obj.type === 'WHISKER' && (
            <mesh geometry={geoms.cylinder} scale={[0.3, 1, 0.3]}>
              <meshStandardMaterial color={obj.color} />
            </mesh>
          )}

        </group>
      ))}
    </group>
  );
};

// --- Main Scene Experience ---
const Experience = ({ sceneState, rotationSpeed, birthdayMode, galleryMode, currentPhotoIndex }: { sceneState: 'CHAOS' | 'FORMED', rotationSpeed: number, birthdayMode: boolean, galleryMode: boolean, currentPhotoIndex: number }) => {
  const controlsRef = useRef<any>(null);

  useFrame(() => {
    if (controlsRef.current && !birthdayMode && !galleryMode) {
      controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotationSpeed);
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 40]} fov={45} />
      <OrbitControls ref={controlsRef} enablePan={false} enableZoom={true} minDistance={20} maxDistance={80} autoRotate={rotationSpeed === 0 && !birthdayMode && !galleryMode} autoRotateSpeed={0.5} />

      {/* Pinkish Environment */}
      <color attach="background" args={['#ffe6f2']} />
      <Environment preset="sunset" background={false} />

      <ambientLight intensity={0.8} color="#ffffff" />
      <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ffb6c1" />

      <group position={[0, 0, 0]}>
        {!birthdayMode && (
          <Suspense fallback={null}>
            <CompositionElements state={sceneState} galleryMode={galleryMode} currentPhotoIndex={currentPhotoIndex} />
          </Suspense>
        )}
        {birthdayMode && <BirthdayMessage />}

        <Sparkles count={300} scale={40} size={6} speed={0.4} opacity={0.6} color="#ff69b4" />
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.9} intensity={0.5} radius={0.4} mipmapBlur />
        <Vignette eskil={false} offset={0.1} darkness={0.4} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GestureController = ({ onGesture, onMove, onStatus, debugMode }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastGesture = useRef<string | null>(null);
  const gestureCount = useRef(0);
  const currentState = useRef<'CHAOS' | 'FORMED' | null>(null);

  useEffect(() => {
    let gestureRecognizer: GestureRecognizer;
    let requestRef: number;

    const setup = async () => {
      onStatus("DOWNLOADING AI...");
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        onStatus("REQUESTING CAMERA...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            onStatus("AI READY: SHOW HAND");
            predictWebcam();
          }
        } else {
          onStatus("ERROR: CAMERA PERMISSION DENIED");
        }
      } catch (err: any) {
        onStatus(`ERROR: ${err.message || 'MODEL FAILED'}`);
      }
    };

    const predictWebcam = () => {
      if (gestureRecognizer && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0) {
          const results = gestureRecognizer.recognizeForVideo(videoRef.current, Date.now());
          const ctx = canvasRef.current.getContext("2d");
          if (ctx && debugMode) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
            if (results.landmarks) for (const landmarks of results.landmarks) {
              const drawingUtils = new DrawingUtils(ctx);
              drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#FFD700", lineWidth: 2 });
              drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
            }
          } else if (ctx && !debugMode) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          if (results.gestures.length > 0) {
            const name = results.gestures[0][0].categoryName; const score = results.gestures[0][0].score;

            // Debounce Logic
            if (score > 0.5) {
              if (name === lastGesture.current) {
                gestureCount.current++;
              } else {
                lastGesture.current = name;
                gestureCount.current = 1;
              }

              // Require 5 consecutive frames of the same gesture
              if (gestureCount.current > 5) {
                let targetState: 'CHAOS' | 'FORMED' | null = null;
                if (name === "Open_Palm") targetState = "CHAOS";
                if (name === "Closed_Fist") targetState = "FORMED";

                // Only trigger state change if it's different from current state
                if (targetState && targetState !== currentState.current) {
                  currentState.current = targetState;
                  onGesture(targetState);
                  if (debugMode) onStatus(`DETECTED: ${name} -> ${targetState}`);
                }
              }
            } else {
              // Low score, reset count but keep last gesture to avoid flickering? 
              // Better to reset if confidence drops.
              gestureCount.current = 0;
              lastGesture.current = null;
            }

            if (results.landmarks.length > 0) {
              const speed = (0.5 - results.landmarks[0][0].x) * 0.15;
              onMove(Math.abs(speed) > 0.01 ? speed : 0);
            }
          } else {
            // No hand detected
            gestureCount.current = 0;
            lastGesture.current = null;
            onMove(0);
            if (debugMode) onStatus("AI READY: NO HAND");
          }
        }
        requestRef = requestAnimationFrame(predictWebcam);
      }
    };
    setup();
    return () => cancelAnimationFrame(requestRef);
  }, [onGesture, onMove, onStatus, debugMode]);

  return (
    <>
      <video ref={videoRef} style={{ opacity: debugMode ? 0.6 : 0, position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', zIndex: debugMode ? 100 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', height: debugMode ? 'auto' : '1px', zIndex: debugMode ? 101 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
    </>
  );
};

// --- App Entry ---
export default function PhotoKittyApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [birthdayMode, setBirthdayMode] = useState(false);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [galleryMode, setGalleryMode] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Total photos for gallery navigation (52 unique photos)
  const totalGalleryPhotos = TOTAL_NUMBERED_PHOTOS;

  const handleGalleryToggle = () => {
    if (!galleryMode) {
      // Entering gallery mode - only allowed in FORMED state
      if (sceneState === 'FORMED') {
        setGalleryMode(true);
        setCurrentPhotoIndex(0);
      }
    } else {
      // Exiting gallery mode
      setGalleryMode(false);
    }
  };

  const handlePrevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + totalGalleryPhotos) % totalGalleryPhotos);
  };

  const handleNextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % totalGalleryPhotos);
  };

  // Check existing photos on mount
  useEffect(() => {
    let loadedCount = 0;
    const checkPhoto = (index: number) => {
      return new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = `${import.meta.env.BASE_URL}photos/${index}.jpg`;
      });
    };

    const checkAllPhotos = async () => {
      for (let i = 1; i <= TOTAL_NUMBERED_PHOTOS; i++) {
        const exists = await checkPhoto(i);
        if (exists) loadedCount++;
      }
      setPhotoCount(loadedCount);
    };

    checkAllPhotos();
  }, []);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = TOTAL_NUMBERED_PHOTOS - photoCount;
    if (remainingSlots <= 0) {
      alert(`已达到照片上限 ${TOTAL_NUMBERED_PHOTOS} 张！`);
      return;
    }

    const filesToUpload = Math.min(files.length, remainingSlots);

    // In a real application, you would upload these files to a server
    // For now, we'll just show a message
    alert(`准备上传 ${filesToUpload} 张照片\n请将照片命名为 ${photoCount + 1}.jpg 到 ${photoCount + filesToUpload}.jpg\n并放入 public/photos/ 文件夹`);

    // Update count (in real app, this would happen after successful upload)
    setPhotoCount(prev => Math.min(prev + filesToUpload, TOTAL_NUMBERED_PHOTOS));

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-container">

      {/* Header Title */}
      <div className="header-left">
        <h1 className="title">PhotoKitty 3D</h1>
        {!galleryMode && (
          <button
            onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')}
            className="btn btn-primary"
          >
            {sceneState === 'CHAOS' ? '🐱 Formed' : '✨ Disperse'}
          </button>
        )}
        {/* Gallery button: show when FORMED and not in birthday mode, OR when in gallery mode */}
        {((sceneState === 'FORMED' && !birthdayMode) || galleryMode) && (
          <button
            onClick={handleGalleryToggle}
            className={`btn ${galleryMode ? 'btn-secondary active' : 'btn-primary'}`}
          >
            {galleryMode ? '🐱 Exit Gallery' : '🖼️ Gallery'}
          </button>
        )}
      </div>

      {/* Birthday Button */}
      <div className="header-right">
        <button
          onClick={() => setBirthdayMode(!birthdayMode)}
          className={`btn btn-secondary ${birthdayMode ? 'active' : ''}`}
        >
          {birthdayMode ? '🎂 Back to Kitty' : '🎂 Happy Birthday'}
        </button>
      </div>

      {/* Upload Photo Button - Bottom Left */}
      <div className="bottom-left">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-primary"
          style={{ padding: '12px 20px', gap: '8px' }}
        >
          📸 Upload Photo
          <span style={{
            backgroundColor: 'rgba(255,255,255,0.3)',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.85rem'
          }}>
            {photoCount}/{TOTAL_NUMBERED_PHOTOS}
          </span>
        </button>
      </div>

      {/* Debug & AI Status - Only show in Kitty mode */}
      {!birthdayMode && (
        <>
          <div className="bottom-right">
            <div className="ai-status" style={{
              color: aiStatus.includes('ERROR') ? '#FF0000' : '#666',
              fontSize: '0.8rem',
              letterSpacing: '1px'
            }}>
              {aiStatus}
            </div>
            <button
              onClick={() => setDebugMode(!debugMode)}
              className="debug-btn"
              style={{
                backgroundColor: debugMode ? '#FFD700' : 'rgba(255, 20, 147, 0.8)',
                color: debugMode ? '#000' : '#fff'
              }}
            >
              {debugMode ? '✕' : '🛠'}
            </button>
          </div>
        </>
      )}

      {/* Gallery Navigation */}
      {galleryMode && (
        <div className="gallery-nav">
          <button onClick={handlePrevPhoto} className="gallery-arrow-btn">
            ←
          </button>
          <span className="gallery-counter">
            {currentPhotoIndex + 1} / {totalGalleryPhotos}
          </span>
          <button onClick={handleNextPhoto} className="gallery-arrow-btn">
            →
          </button>
        </div>
      )}

      {/* 3D Canvas */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} shadows>
          <Experience sceneState={sceneState} rotationSpeed={rotationSpeed} birthdayMode={birthdayMode} galleryMode={galleryMode} currentPhotoIndex={currentPhotoIndex} />
        </Canvas>
      </div>

      {/* Gesture Controller - Only active in Kitty mode, not in Gallery mode */}
      {!birthdayMode && !galleryMode && (
        <GestureController onGesture={setSceneState} onMove={setRotationSpeed} onStatus={setAiStatus} debugMode={debugMode} />
      )}
    </div>
  );
}
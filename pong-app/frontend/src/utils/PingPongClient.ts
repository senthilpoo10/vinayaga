import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { NavigateFunction } from 'react-router-dom';

type StatusChangeCallback = (status: 'waiting' | 'in-progress' | 'finished') => void;


export default class PingPongClient {
  private groundEmission = 0.5;
  private groundColor = 0xffffff;

  private currentRotationY = 0;
  private currentLookTarget = new THREE.Vector3(0, 0, 0);

  private container: HTMLDivElement;
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;

  private lineMaterial: THREE.LineBasicMaterial;
  private gridLines: THREE.Group;

  private paddleGeo = new THREE.BoxGeometry(1.5, 0.4, 3);
  private leftMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x331111 });
  private rightMat = new THREE.MeshStandardMaterial({ color: 0x6b8cff, emissive: 0x112233 });

  private leftPaddle: THREE.Mesh;
  private rightPaddle: THREE.Mesh;

  private ballGeo = new THREE.SphereGeometry(0.45, 32, 32);
  private ballMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.8,
  });
  private ball: THREE.Mesh;
  private ballVel = new THREE.Vector3(6.0, 0, 3.5);
  private latestBallZ: number;
  private latestBallX: number;

  private bounds = { x: 9.6, z: 5.6 };
  private keys = { w: false, s: false, ArrowUp: false, ArrowDown: false };

  private lastFrame: DOMHighResTimeStamp;

  private hud: HTMLDivElement;
  private scoreDisplay: HTMLDivElement;
  private restartButton: HTMLButtonElement;
  private timerDisplay: HTMLDivElement;

  private socket: Socket | null = null;
  private gameId: string;
  private playerSide: "left" | "right" | null = null;
  private mode: "local" | "remote" | undefined;
  private status: "waiting" | "in-progress" | "finished" | "paused" = "waiting";
  private updated: boolean;
  private navigate: NavigateFunction;

  private onStatusChange?: StatusChangeCallback;

  constructor(containerId: string | HTMLElement, gameId: string, mode: "local" | "remote", navigate: NavigateFunction, name: string | null, onStatusChange?: StatusChangeCallback) {
    if (typeof containerId === 'string') {
      const el = document.getElementById(containerId);
      if (!el) throw new Error(`Container with id "${containerId}" not found`);
      this.container = el as HTMLDivElement;
    } else if (containerId instanceof HTMLElement) {
      this.container = containerId as HTMLDivElement;
    } else {
      throw new Error('Invalid container argument');
    }

    this.gameId = gameId;
    this.mode = mode;
    this.updated = false;

    this.navigate = navigate;

    this.onStatusChange = onStatusChange;

    this.animate = this.animate.bind(this);

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleResize = this.handleResize.bind(this);

    // Add event listeners with bound handlers
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 20, 10);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffeebb, 0x080820, 0.9);
    this.scene.add(hemi);
    const p1 = new THREE.PointLight(0xff4d4d, 1.2, 50);
    p1.position.set(10, 8, 6);
    this.scene.add(p1);
    const p2 = new THREE.PointLight(0x66ccff, 1.0, 50);
    p2.position.set(-10, 8, -6);
    this.scene.add(p2);

    // Ground grid
    this.lineMaterial = new THREE.LineBasicMaterial({ color: this.groundColor, transparent: true, opacity: this.groundEmission });
    this.gridLines = new THREE.Group();
    for (let i = -10; i <= 10; i++) {
      const geometryH = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-10, 0, i * 0.6),
        new THREE.Vector3(10, 0, i * 0.6),
      ]);
      const lineH = new THREE.Line(geometryH, this.lineMaterial);
      this.gridLines.add(lineH);

      const geometryV = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i, 0, -6),
        new THREE.Vector3(i, 0, 6),
      ]);
      const lineV = new THREE.Line(geometryV, this.lineMaterial);
      this.gridLines.add(lineV);
    }

    this.gridLines.position.y = 0.26;
    this.scene.add(this.gridLines);

    // Paddles
    this.leftPaddle = new THREE.Mesh(this.paddleGeo, this.leftMat);
    this.rightPaddle = new THREE.Mesh(this.paddleGeo, this.rightMat);
    this.leftPaddle.position.set(-8.2, 0.5, 0);
    this.rightPaddle.position.set(8.2, 0.5, 0);
    this.scene.add(this.leftPaddle, this.rightPaddle);

    // Ball
    this.ball = new THREE.Mesh(this.ballGeo, this.ballMat);
    this.ball.position.set(0, 0.6, 0);
    this.scene.add(this.ball);
    this.latestBallX = 0;
    this.latestBallZ = 0;

    // HUD
    this.hud = document.createElement('div');
    this.hud.className = 'overlay';
    this.hud.innerHTML = 'W/S: left paddle &nbsp; ArrowUp/Down: right paddle &nbsp; Esc: pause';
    document.body.appendChild(this.hud);

    // Score Display
    this.scoreDisplay = document.createElement('div');
    Object.assign(this.scoreDisplay.style, {
      position: 'absolute',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      fontSize: '24px',
      fontFamily: 'monospace',
      userSelect: 'none',
    });
    document.body.appendChild(this.scoreDisplay);

    // Restart Button
    this.restartButton = document.createElement('button');
    this.restartButton.textContent = 'Restart';
    Object.assign(this.restartButton.style, {
      position: 'absolute',
      top: '50px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 18px',
      fontSize: '18px',
      marginTop: '15px',
      cursor: 'pointer',
      display: 'none',
    });
    document.body.appendChild(this.restartButton);
    this.restartButton.addEventListener('click', () => this.socket?.emit("restart"));

    // Timer Display
    this.timerDisplay = document.createElement('div');
    Object.assign(this.timerDisplay.style, {
      position: 'absolute',
      top: '40px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'yellow',
      fontSize: '20px',
      fontFamily: 'monospace',
    });
    document.body.appendChild(this.timerDisplay);

    this.lastFrame = performance.now();
    this.connect(name);
    this.animate();    
  }

  private connect(name: string | null){
    this.socket = io("/pong", {
        path: '/socket.io',
        transports: ['websocket'],
        secure: true
    });

    this.socket.on('connect', () => {
        console.log('Connected to server:', this.socket?.id);

        if (!name)
          name = prompt("Enter name for player1:", "Guest");
        let player2: string | null = null;
        if (this.mode === "local")
          player2 = prompt("Enter name for player2:", "Guest");
        this.socket?.emit('join_game_room', this.gameId, name, player2, (callback: { error: string }) => {
          if (callback.error) {
            alert(callback.error);          
            this.navigate("/lobby");
          }
        });   
        // On connect, always waiting
        if (this.onStatusChange) this.onStatusChange("waiting");      
    });

    this.socket.on('playerSide', (side) => {
        this.playerSide = side;
    });

    this.socket.on('stateUpdate', (state, start: string | null) => {
        if (this.mode === "remote" && this.playerSide === "left") {
          this.rightPaddle.position.setZ(state.rightPaddle.z);
          if (start) this.leftPaddle.position.setZ(state.leftPaddle.z);
        }
        else if (this.mode === "remote" && this.playerSide === "right") {
          this.leftPaddle.position.setZ(state.leftPaddle.z);
          if (start) this.rightPaddle.position.setZ(state.rightPaddle.z);
        }
        this.latestBallX = state.ball.x;
        this.latestBallZ = state.ball.z;
        this.updated = true;
        this.ballVel.setX(state.ball.vx);
        this.ballVel.setZ(state.ball.vz);
        if (this.ball.material.color !== state.ball.color){
          this.ball.material.color.set(state.ball.color);
          this.ball.material.emissive.set(state.ball.color);
        }
        if (this.scoreDisplay.textContent !== state.scoreDisplay)
          this.scoreDisplay.textContent = state.scoreDisplay;
        this.timerDisplay.textContent = state.timerDisplay;
        this.status = state.status;
                // Call status change callback when status transitions
        if (this.onStatusChange) {
          if (state.status === "in-progress") this.onStatusChange("in-progress");
          else if (state.status === "finished" || state.status === "paused") this.onStatusChange("finished");
          else if (state.status === "waiting") this.onStatusChange("waiting");
        }
        if (state.status === "finished" || state.status === "paused")
          this.restartButton.style.display = "block";
        else
          this.restartButton.style.display = "none";
    });

    this.socket.on('waiting', () => {
        this.scoreDisplay.textContent = 'Waiting for opponent...';
        this.restartButton.style.display = "none";
        this.status = "waiting";
        if (this.onStatusChange) this.onStatusChange("waiting");
    });
}

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape")
      this.socket?.emit("pause");
    else if (e.key in this.keys) this.keys[e.key as keyof typeof this.keys] = true;
    // if (e.key in this.keys) {
    //   this.socket?.emit('keyDown', e.key, this.playerSide);
    // }
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (e.key in this.keys) this.keys[e.key as keyof typeof this.keys] = false;
    // if (e.key in this.keys) {
    //   this.socket?.emit('keyUp', e.key, this.playerSide);
    // }
  }

  private handleResize() {
    this.onResize();
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    // Remove renderer DOM element
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Remove HUD, Score Display, Timer Display, Restart Button from DOM
    [this.hud, this.scoreDisplay, this.timerDisplay, this.restartButton].forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);

    // Dispose three.js renderer
    this.renderer.dispose();

    // Disconnect the socket
    if (this.socket) {
      this.socket.off();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private animate() {
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    // Move paddles
    if (this.status != "paused" && this.status != "finished") {
      if (this.mode === "local") {
        if (this.keys.w) this.leftPaddle.position.z -= 12 * dt;
        if (this.keys.s) this.leftPaddle.position.z += 12 * dt;
        if (this.keys.ArrowUp) this.rightPaddle.position.z -= 12 * dt;
        if (this.keys.ArrowDown) this.rightPaddle.position.z += 12 * dt;
        this.socket?.emit("move", "left", this.leftPaddle.position.z);
        this.socket?.emit("move", "right", this.rightPaddle.position.z);            
      }
      else {
        if (this.playerSide === "left") {
          if (this.keys.w || this.keys.ArrowUp)
            this.leftPaddle.position.z -= 12 * dt;
          if (this.keys.s || this.keys.ArrowDown)
            this.leftPaddle.position.z += 12 * dt;
          this.socket?.emit("move", this.playerSide, this.leftPaddle.position.z);
        }
        else if (this.playerSide === "right") {
          if (this.keys.w || this.keys.ArrowUp)
            this.rightPaddle.position.z -= 12 * dt;
          if (this.keys.s || this.keys.ArrowDown)
            this.rightPaddle.position.z += 12 * dt;
          this.socket?.emit("move", this.playerSide, this.rightPaddle.position.z);       
        }
      }
    }
    // Clamp paddles
    this.leftPaddle.position.z = THREE.MathUtils.clamp(this.leftPaddle.position.z, -this.bounds.z, this.bounds.z);
    this.rightPaddle.position.z = THREE.MathUtils.clamp(this.rightPaddle.position.z, -this.bounds.z, this.bounds.z);

    // Predict ball movement
    if (this.status === "in-progress")
      this.ball.position.addScaledVector(this.ballVel, dt);
    if (this.updated){
      const errX = this.latestBallX - this.ball.position.x;
      const errZ = this.latestBallZ - this.ball.position.z;
      // if ball position differs too much from server, snap position instantly
      if (Math.abs(errX) > 0.5 || Math.abs(errZ) > 0.5) {
        this.ball.position.x = this.latestBallX;
        this.ball.position.z = this.latestBallZ;
      } else {
        // apply a small correction toward server state
        this.ball.position.x += errX * 0.1; // 0.1 = smoothing factor, tweakable
        this.ball.position.z += errZ * 0.1;
        this.updated = false;
      }
    }
    // Camera rotation based on ball
    const targetRotationY = THREE.MathUtils.clamp(this.ball.position.z / this.bounds.z, -0.9, 0.9);
    const smoothingFactor = 0.1;
    this.currentRotationY = THREE.MathUtils.lerp(this.currentRotationY, targetRotationY, smoothingFactor);
    this.camera.rotation.y = this.currentRotationY;

    // Camera look target lerp
    const targetLookTarget = new THREE.Vector3(this.ball.position.x * 0.1, this.ball.position.y, this.ball.position.z * 0.2);
    this.currentLookTarget.lerp(targetLookTarget, smoothingFactor);
    this.camera.lookAt(this.currentLookTarget);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}

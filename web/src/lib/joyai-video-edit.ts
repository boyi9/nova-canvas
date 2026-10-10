// Nova画 - JoyAI-Video-Edit 客户端
// 实时流式视频编辑：WebSocket 双向通信

export interface JoyAIConfig {
  serverUrl: string;           // WebSocket 服务器地址，如 ws://localhost:8080
  width?: number;              // 输出宽度 (默认 840)
  height?: number;             // 输出高度 (默认 480)
  fps?: number;                // 输出帧率 (默认 24)
  instruction?: string;        // 编辑指令
  referenceImage?: string;     // 参考图片 dataURL (RV2V 模式)
}

export interface EditInstructionContext {
  instruction: string;         // 当前指令
  timestamp: number;           // 时间戳
  frameRange?: [number, number]; // 应用的帧范围
  promptHistory?: string[];    // 之前的指令历史（用于上下文）
}

export interface EditSnapshot {
  id: string;
  frames: JoyAIFrame[];
  instruction: string;
  timestamp: number;
  videoState?: Blob;           // 可选：当前视频状态快照
}

export interface JoyAIFrame {
  dataUrl: string;             // 编辑后的帧 dataURL
  timestamp: number;           // 时间戳
  frameIndex: number;          // 帧序号
}

export interface JoyAIStatus {
  connected: boolean;
  streaming: boolean;
  error?: string;
}

export type JoyAIEventCallback = (frame: JoyAIFrame) => void;
export type JoyAIStatusCallback = (status: JoyAIStatus) => void;
export type JoyAIErrorCallback = (error: Error) => void;

export class JoyAIClient {
  private ws: WebSocket | null = null;
  private config: JoyAIConfig;
  private onFrameCallbacks: JoyAIEventCallback[] = [];
  private onStatusCallbacks: JoyAIStatusCallback[] = [];
  private onErrorCallbacks: JoyAIErrorCallback[] = [];
  private frameBuffer: JoyAIFrame[] = [];
  private sourceVideo: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private isStreaming = false;
  private instructionHistory: EditInstructionContext[] = [];
  private snapshots: EditSnapshot[] = [];

  constructor(config: JoyAIConfig) {
    this.config = {
      width: 840,
      height: 480,
      fps: 24,
      ...config,
    };
  }

  /** 连接到 JoyAI-Video-Edit 服务器 */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl.replace(/^http/, 'ws'));
        
        this.ws.binaryType = 'arraybuffer';
        
        this.ws.onopen = () => {
          this.emitStatus({ connected: true, streaming: false });
          // 发送配置
          this.sendConfig();
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };
        
        this.ws.onerror = (error) => {
          this.emitError(new Error('WebSocket 连接错误'));
        };
        
        this.ws.onclose = () => {
          this.emitStatus({ connected: false, streaming: false });
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /** 发送配置给服务器 */
  private sendConfig(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.ws.send(JSON.stringify({
      type: 'config',
      width: this.config.width,
      height: this.config.height,
      fps: this.config.fps,
      instruction: this.config.instruction,
      reference_image: this.config.referenceImage,
    }));
  }

  /** 处理服务器消息 */
  private handleMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        this.handleTextMessage(msg);
      } catch {
        // 忽略非 JSON 消息
      }
    } else if (event.data instanceof ArrayBuffer) {
      // 二进制帧数据
      this.handleBinaryFrame(event.data);
    } else if (event.data instanceof Blob) {
      event.data.arrayBuffer().then(buf => this.handleBinaryFrame(buf));
    }
  }

  private handleTextMessage(msg: any): void {
    switch (msg.type) {
      case 'status':
        this.emitStatus({ connected: true, streaming: msg.streaming });
        break;
      case 'error':
        this.emitError(new Error(msg.message || '服务器错误'));
        break;
      case 'frame_info':
        // 帧元信息，可用于进度显示
        break;
    }
  }

  private handleBinaryFrame(data: ArrayBuffer): void {
    // 将二进制数据转为 dataURL
    const uint8 = new Uint8Array(data);
    const base64 = btoa(String.fromCharCode(...uint8));
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    const frame: JoyAIFrame = {
      dataUrl,
      timestamp: Date.now(),
      frameIndex: this.frameBuffer.length,
    };
    
    this.frameBuffer.push(frame);
    this.emitFrame(frame);
  }

  /** 开始流式编辑 - 需要提供源视频 */
  async startStreaming(sourceVideo: HTMLVideoElement): Promise<void> {
    if (this.isStreaming) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('未连接到服务器');
    }
    
    this.sourceVideo = sourceVideo;
    this.isStreaming = true;
    this.emitStatus({ connected: true, streaming: true });
    
    // 发送开始流式编辑指令
    this.ws.send(JSON.stringify({ type: 'start_streaming' }));
    
    // 启动帧推送循环
    this.pushFrames();
  }

  /** 推送视频帧到服务器 */
  private pushFrames(): void {
    if (!this.isStreaming || !this.sourceVideo) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = this.config.width!;
    canvas.height = this.config.height!;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const pushFrame = () => {
      if (!this.isStreaming || !this.sourceVideo || this.sourceVideo.paused || this.sourceVideo.ended) {
        this.stopStreaming();
        return;
      }
      
      // 绘制当前帧
      ctx.drawImage(this.sourceVideo, 0, 0, canvas.width, canvas.height);
      
      // 转为 JPEG 并发送
      canvas.toBlob((blob) => {
        if (blob && this.ws && this.ws.readyState === WebSocket.OPEN) {
          blob.arrayBuffer().then(buf => {
            this.ws!.send(buf);
          });
        }
        
        // 下一帧
        this.animationFrameId = requestAnimationFrame(pushFrame);
      }, 'image/jpeg', 0.8);
    };
    
    pushFrame();
  }

  /** 停止流式编辑 */
  stopStreaming(): void {
    this.isStreaming = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop_streaming' }));
    }
    
    this.emitStatus({ connected: true, streaming: false });
  }

  /** 更新编辑指令（支持上下文历史） */
  setInstruction(instruction: string): void {
    this.config.instruction = instruction;
    
    // 记录指令历史
    this.instructionHistory.push({
      instruction,
      timestamp: Date.now(),
      promptHistory: this.instructionHistory.map(h => h.instruction),
    });
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 发送指令时带上历史上下文
      this.ws.send(JSON.stringify({
        type: 'instruction',
        instruction,
        context: this.instructionHistory.map(h => h.instruction),
      }));
    }
  }

  /** 获取指令历史 */
  getInstructionHistory(): EditInstructionContext[] {
    return [...this.instructionHistory];
  }

  /** 清空指令历史 */
  clearInstructionHistory(): void {
    this.instructionHistory = [];
  }

  /** 创建编辑快照 */
  createSnapshot(instruction: string): EditSnapshot {
    const snapshot: EditSnapshot = {
      id: `snap-${Date.now()}`,
      frames: [...this.frameBuffer],
      instruction,
      timestamp: Date.now(),
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /** 获取所有快照 */
  getSnapshots(): EditSnapshot[] {
    return [...this.snapshots];
  }

  /** 从快照恢复 */
  restoreSnapshot(snapshotId: string): boolean {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return false;
    
    this.frameBuffer = [...snapshot.frames];
    // 重新播放帧
    this.frameBuffer.forEach(frame => this.emitFrame(frame));
    return true;
  }

  /** 删除快照 */
  deleteSnapshot(snapshotId: string): void {
    this.snapshots = this.snapshots.filter(s => s.id !== snapshotId);
  }

  /** 清空所有快照 */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /** 设置参考图片 (RV2V 模式) */
  setReferenceImage(dataUrl: string): void {
    this.config.referenceImage = dataUrl;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'reference_image', image: dataUrl }));
    }
  }

  /** 获取已编辑的帧 */
  getFrames(): JoyAIFrame[] {
    return [...this.frameBuffer];
  }

  /** 导出编辑后的视频 */
  async exportVideo(options?: { mimeType?: string; quality?: number }): Promise<Blob> {
    if (this.frameBuffer.length === 0) {
      throw new Error('没有可导出的帧');
    }
    
    // 使用 MediaRecorder 录制
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = this.config.width!;
      canvas.height = this.config.height!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 不可用'));
      
      const stream = canvas.captureStream(this.config.fps!);
      const recorder = new MediaRecorder(stream, {
        mimeType: options?.mimeType || 'video/webm',
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: options?.mimeType || 'video/webm' }));
      recorder.onerror = reject;
      
      recorder.start();
      
      let frameIndex = 0;
      const renderFrame = () => {
        if (frameIndex >= this.frameBuffer.length) {
          recorder.stop();
          return;
        }
        
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          frameIndex++;
          setTimeout(renderFrame, 1000 / this.config.fps!);
        };
        img.src = this.frameBuffer[frameIndex].dataUrl;
      };
      
      renderFrame();
    });
  }

  /** 断开连接 */
  disconnect(): void {
    this.stopStreaming();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.frameBuffer = [];
  }

  // 事件回调
  onFrame(cb: JoyAIEventCallback): () => void {
    this.onFrameCallbacks.push(cb);
    return () => { this.onFrameCallbacks = this.onFrameCallbacks.filter(f => f !== cb); };
  }
  
  onStatus(cb: JoyAIStatusCallback): () => void {
    this.onStatusCallbacks.push(cb);
    return () => { this.onStatusCallbacks = this.onStatusCallbacks.filter(f => f !== cb); };
  }
  
  onError(cb: JoyAIErrorCallback): () => void {
    this.onErrorCallbacks.push(cb);
    return () => { this.onErrorCallbacks = this.onErrorCallbacks.filter(f => f !== cb); };
  }

  private emitFrame(frame: JoyAIFrame): void {
    this.onFrameCallbacks.forEach(cb => cb(frame));
  }
  
  private emitStatus(status: JoyAIStatus): void {
    this.onStatusCallbacks.forEach(cb => cb(status));
  }
  
  private emitError(error: Error): void {
    this.onErrorCallbacks.forEach(cb => cb(error));
  }
}

/** 创建客户端实例的工厂函数 */
export function createJoyAIClient(config: JoyAIConfig): JoyAIClient {
  return new JoyAIClient(config);
}

/** 预设编辑指令模板 */
export const JOYAI_INSTRUCTION_TEMPLATES = {
  styleTransfer: {
    'cartoon': 'Turn the video into cartoon style',
    'watercolor': 'Turn the video into watercolor painting style',
    'anime': 'Convert to anime cel animation style',
    'oil-painting': 'Oil painting style, classical art',
    'sketch': 'Pencil sketch, hand-drawn',
    'cyberpunk': 'Cyberpunk neon aesthetic',
    'vintage': 'Vintage film, grain, warm tones',
  },
  subjectEdit: {
    'change-outfit': 'Change the person\'s outfit to {outfit}',
    'change-hairstyle': 'Change hairstyle to {style}',
    'add-accessories': 'Add {accessories} to the person',
    'replace-person': 'Replace the person with {character}',
    'change-expression': 'Change facial expression to {emotion}',
  },
  backgroundEdit: {
    'replace-bg': 'Replace background with {scene}',
    'blur-bg': 'Blur the background, keep subject sharp',
    'remove-bg': 'Remove background, make transparent',
    'studio-bg': 'Professional studio background',
    'outdoor-bg': 'Outdoor natural environment',
  },
  motionEdit: {
    'slow-motion': 'Slow motion, smooth movement',
    'fast-motion': 'Fast forward, speed up',
    'freeze': 'Freeze frame at current moment',
    'loop': 'Seamless loop',
    'reverse': 'Reverse playback',
  },
  referenceGuided: {
    'rv2v-outfit': 'Put the outfit from reference image on the person in video',
    'rv2v-style': 'Apply the style from reference image to the video',
    'rv2v-subject': 'Replace the subject with the one from reference image',
  },
} as const;

export default {
  JoyAIClient,
  createJoyAIClient,
  JOYAI_INSTRUCTION_TEMPLATES,
};
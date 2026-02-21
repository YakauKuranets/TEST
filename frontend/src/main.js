import { Orchestrator } from "./orchestrator.js";
import { createPlaylistBlueprint } from "./blueprints/playlist.js";
import { createPlayerBlueprint } from "./blueprints/player.js";
import { createAiBlueprint } from "./blueprints/ai.js";
import { createTimelineBlueprint } from "./blueprints/timeline.js";
import { createQualityBlueprint } from "./blueprints/quality.js";
import { createStabilizationBlueprint } from "./blueprints/stabilization.js";
import { createColorGradingBlueprint } from "./blueprints/colorGrading.js";
import { createKeyframesBlueprint } from "./blueprints/keyframes.js";
import { createForensicBlueprint } from "./blueprints/forensic.js";
import { createEnterpriseBlueprint } from "./blueprints/enterprise.js";
import { createMotionBlueprint } from "./blueprints/motion.js";
import { createPhotoBlueprint } from "./blueprints/photo.js";
import { createCompareBlueprint } from "./blueprints/compare.js";
import { createHypothesisBlueprint } from "./blueprints/hypothesis.js";
import { createScreenshotBlueprint } from "./blueprints/screenshot.js";
import { createClipBlueprint } from "./blueprints/clip.js";
import { createAdvancedTimelineBlueprint } from "./blueprints/advancedTimeline.js";
import { createMotionTrackingAndEffectsBlueprint } from "./blueprints/motionTrackingAndEffects.js";
import { createAiHubBlueprint } from "./blueprints/aiHub.js";

// Helper: safe getElementById (returns element or null without crash)
const $id = (id) => document.getElementById(id);

const state = {
  viewMode: 'video',
  currentVideoFile: null,
  zoomLevel: 1.0,
  logEntries: [],
  modelsStatus: {},
  isSegmenting: false,
  activeObject: null,
  autoZoom: false,
  isStabilizing: false
};

// ═══ ALL 150+ ELEMENTS ═══
const elements = {
  // Core viewer
  video: $id('video'),
  canvas: $id('pro-canvas'),
  aiOverlay: $id('ai-overlay'),
  photoCanvas: $id('photo-canvas'),
  compareCanvas: $id('compare-canvas'),
  captureCanvas: $id('capture'),
  viewerSurface: $id('viewer-surface'),
  motionIndicator: $id('motion-indicator'),

  // Sidebar
  playlist: $id('playlist'),
  fileInput: $id('file-input'),

  // Toolbar — video
  frameBack: $id('frame-back'),
  frameForward: $id('frame-forward'),
  screenshotButton: $id('screenshot'),
  propagateBtn: $id('ai-propagate-btn'),
  enhanceBtn: $id('photo-blend'),
  trackStartBtn: $id('ai-track-start'),

  // Toolbar — photo
  photoSourceInput: $id('photo-source-input'),
  photoBlendButton: $id('photo-recon'),
  photoDownloadButton: $id('photo-download'),
  photoStatus: $id('photo-status'),

  // Clip
  markInButton: $id('mark-in'),
  markOutButton: $id('mark-out'),
  clipInValue: $id('clip-in-value'),
  clipOutValue: $id('clip-out-value'),
  exportClipButton: $id('export-clip'),

  // Settings
  settingsBtn: $id('workspace-settings-btn'),
  settingsModal: $id('settings-modal'),

  // Timeline
  timeline: $id('timeline'),
  timelineCurrent: $id('timeline-current'),
  timelineDuration: $id('timeline-duration'),
  timelineMarkers: $id('timeline-markers'),
  timelineZoomIn: $id('timeline-zoom-in'),
  timelineZoomOut: $id('timeline-zoom-out'),
  timelineZoomValue: $id('timeline-zoom-value'),
  speedInput: $id('speed'),

  // Quality
  exposureInput: $id('exposure'),
  contrastInput: $id('contrast'), // mapped from 'contrast' id
  clarityInput: $id('clarity'),
  sharpnessInput: $id('sharpness'),
  temperatureInput: $id('temperature'),
  denoiseProfile: $id('denoise-profile'),
  denoiseInput: $id('denoise-input'),
  enhanceInput: $id('enhance-input'),
  upscaleFactor: $id('upscale-factor'),
  upscaleToggle: $id('upscale-toggle'),
  grayscaleToggle: $id('grayscale-toggle'),
  lowlightBoostToggle: $id('lowlight-boost-toggle'),
  bypassFiltersToggle: $id('bypass-filters-toggle'),
  temporalDenoiseToggle: $id('temporal-denoise-toggle'),
  temporalDenoiseButton: $id('temporal-denoise-btn'),
  temporalWindowInput: $id('temporal-window-input'),
  temporalPreview: $id('temporal-preview'),
  presetDetailButton: $id('preset-detail'),
  presetLowlightButton: $id('preset-lowlight'),
  presetNightButton: $id('preset-night'),
  presetUltraLowlightButton: $id('preset-ultra-lowlight'),
  resetFiltersButton: $id('reset-filters'),

  // Motion detection
  motionStart: $id('motion-start'),
  motionStop: $id('motion-stop'),
  fpsPicker: $id('fps-picker'),
  motionSensitivity: $id('motion-sensitivity'),
  motionSensitivityValue: $id('motion-sensitivity-value'),
  motionCooldown: $id('motion-cooldown'),
  motionCooldownValue: $id('motion-cooldown-value'),

  // Stabilization
  stabilizationToggle: $id('stabilization-toggle'),
  stabilizationAutoToggle: $id('stabilization-auto-toggle'),
  stabilizationStrength: $id('stabilization-strength'),
  stabilizationSmoothing: $id('stabilization-smoothing'),
  stabilizationOffsetX: $id('stabilization-offset-x'),
  stabilizationOffsetY: $id('stabilization-offset-y'),
  stabilizationProfileLight: $id('stabilization-profile-light'),
  stabilizationProfileMedium: $id('stabilization-profile-medium'),
  stabilizationProfileStrong: $id('stabilization-profile-strong'),

  // AI panel
  aiFaceDetectButton: $id('ai-face-detect'),
  aiObjectDetectButton: $id('ai-object-detect'),
  aiFaceList: $id('ai-face-list'),
  aiObjectList: $id('ai-object-list'),
  aiFaceMarkerToggle: $id('ai-face-marker-toggle'),
  aiObjectMarkerToggle: $id('ai-object-marker-toggle'),
  aiStatus: $id('ai-status'),
  aiTrackStartButton: $id('ai-track-start-btn'),
  aiTrackStopButton: $id('ai-track-stop-btn'),
  aiSrFactor: $id('ai-sr-factor'),
  aiSrApplyButton: $id('ai-sr-apply'),
  aiSrResetButton: $id('ai-sr-reset'),
  aiSceneThreshold: $id('ai-scene-threshold'),
  aiScenesDetectButton: $id('ai-scenes-detect'),
  aiScenesClearButton: $id('ai-scenes-clear'),
  aiSceneList: $id('ai-scene-list'),
  aiProviderSelect: $id('ai-provider-select'),
  aiCapabilityCheckButton: $id('ai-capability-check'),
  aiCapabilityStatus: $id('ai-capability-status'),

  // Blur fix + ELA + Auto-analyze (new killer features)
  blurFixBtn: $id('ai-blur-fix-btn'),
  blurFixSlider: $id('blur-fix-intensity'),
  elaBtn: $id('ai-ela-btn'),
  autoAnalyzeBtn: $id('ai-auto-analyze-btn'),
  autoMetrics: $id('ai-auto-metrics'),

  // Forensic case
  caseId: $id('case-id'),
  caseOwner: $id('case-owner'),
  caseStatus: $id('case-status'),
  caseTags: $id('case-tags'),
  caseSummary: $id('case-summary'),
  caseSaveButton: $id('case-save'),
  caseLoadButton: $id('case-load'),
  caseDeleteButton: $id('case-delete'),
  caseSearch: $id('case-search'),
  caseClearSearchButton: $id('case-clear-search'),
  caseImportInput: $id('case-import-input'),
  caseImportLibraryButton: $id('case-import-library'),
  caseExportLibraryButton: $id('case-export-library'),

  // Markers
  markerType: $id('marker-type'),
  markerNote: $id('marker-note'),
  addMarkerButton: $id('add-marker'),
  exportMarkersButton: $id('export-markers'),
  previewReportButton: $id('preview-report'),
  exportReportButton: $id('export-report'),

  // Hypothesis
  hypothesisGenerateButton: $id('hypothesis-generate'),
  hypothesisStatus: $id('hypothesis-status'),
  hypothesisList: $id('hypothesis-list'),
  hypothesisExportButton: $id('hypothesis-export'),

  // Compare
  compareLeftInput: $id('compare-left-input'),
  compareRightInput: $id('compare-right-input'),
  compareSplitInput: $id('compare-split-input'),
  compareSplitValue: $id('compare-split-value'),
  compareRenderButton: $id('compare-render-btn'),
  compareStatus: $id('compare-status'),

  // Logs
  exportLogButton: $id('export-log'),
  logEntryButton: $id('log-entry-btn'),

  // Enterprise (settings modal)
  loginEmail: $id('login-email'),
  loginPassword: $id('login-password'),
  loginButton: $id('login-btn'),
  logoutButton: $id('logout-btn'),
  loginStatus: $id('login-status'),
  gpuStatusButton: $id('gpu-status-btn'),
  gpuStatusPanel: $id('gpu-status-panel'),
  queueFfmpegJobButton: $id('queue-ffmpeg-job'),
  exportFfmpegJobButton: $id('export-ffmpeg-job'),
  downloadFfmpegJobButton: $id('download-ffmpeg-job'),
  ffmpegJobPreview: $id('ffmpeg-job-preview'),
  pipelinePauseButton: $id('pipeline-pause'),
  pipelineResumeButton: $id('pipeline-resume'),
  pipelineRetryFailedButton: $id('pipeline-retry-failed'),
  pipelineClearTerminalButton: $id('pipeline-clear-terminal'),
  teamIdInput: $id('team-id-input'),
  teamNameInput: $id('team-name-input'),
  teamDescInput: $id('team-desc-input'),
  teamCreateButton: $id('team-create'),
  teamUserIdInput: $id('team-user-id-input'),
  teamAddUserButton: $id('team-add-user'),
  teamsRefreshButton: $id('teams-refresh'),
  teamsPanel: $id('teams-panel'),
  auditActionFilter: $id('audit-action-filter'),
  auditLimitInput: $id('audit-limit-input'),
  auditRefreshButton: $id('audit-refresh'),
  auditExportCsvButton: $id('audit-export-csv'),
  auditTableBody: $id('audit-table-body'),
  usersRefreshButton: $id('users-refresh'),
  usersTableBody: $id('users-table-body'),
  dashboardRefreshButton: $id('dashboard-refresh'),
  dashboardPanel: $id('dashboard-panel'),
  timeseriesRefreshButton: $id('timeseries-refresh'),
  timeseriesPanel: $id('timeseries-panel'),
};

const PORT = () => window.API_PORT || 8000;
const API = (path) => `http://127.0.0.1:${PORT()}${path}`;

const actions = {
  recordLog: (type, message) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${type}] ${message}`);
    const logList = $id('log-list');
    if (logList) {
      const li = document.createElement('li');
      li.className = `log-item log-${type}`;
      li.innerHTML = `<span class="log-time">${time}</span> <span class="log-msg">${message}</span>`;
      logList.prepend(li);
    }
  },

  // ═══ AI-ZOOM & STABILIZATION ═══
  toggleAutoZoom: () => {
    state.autoZoom = !state.autoZoom;
    actions.recordLog('ai', `AI-Zoom: ${state.autoZoom ? "ON" : "OFF"}`);
    if (state.autoZoom && state.activeObject) actions.applySmartCrop();
    else if (elements.canvas) elements.canvas.style.transform = 'scale(1) translate(0,0)';
  },

  applySmartCrop: () => {
    if (!state.activeObject?.bbox || !elements.video) return;
    const b = state.activeObject.bbox;
    const vW = elements.video.videoWidth, vH = elements.video.videoHeight;
    const zoom = Math.min(vW / b[2], vH / b[3]) * 0.5;
    const oX = (vW / 2) - (b[0] + b[2] / 2), oY = (vH / 2) - (b[1] + b[3] / 2);
    if (elements.canvas) {
      elements.canvas.style.transition = "transform 0.3s cubic-bezier(0.4,0,0.2,1)";
      elements.canvas.style.transform = `scale(${zoom}) translate(${oX}px,${oY}px)`;
    }
  },

  // ═══ TEMPORAL ENHANCE ═══
  runTemporalEnhance: async () => {
    if (!state.currentVideoFile) return alert("Выберите видео");
    actions.recordLog('ai', 'Temporal Enhance...');
    try {
      const resp = await fetch(API('/api/ai/forensic/temporal-enhance'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: state.currentVideoFile.path, timestamp: elements.video?.currentTime || 0, window_size: 7 })
      });
      const data = await resp.json();
      if (data.status === 'done') actions.recordLog('ai-success', 'Кадр восстановлен');
    } catch (err) { actions.recordLog('ai-error', err.message); }
  },

  // ═══ SAM 2 ═══
  toggleSmartSegmentation: () => {
    state.isSegmenting = !state.isSegmenting;
    if (elements.canvas) elements.canvas.style.cursor = state.isSegmenting ? 'crosshair' : 'default';
    if (elements.aiOverlay) { const ctx = elements.aiOverlay.getContext('2d'); ctx.clearRect(0, 0, elements.aiOverlay.width, elements.aiOverlay.height); }
  },

  handleCanvasClick: async (event) => {
    if (!state.isSegmenting || !state.currentVideoFile) return;
    const rect = elements.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (elements.video.videoWidth / rect.width);
    const y = (event.clientY - rect.top) * (elements.video.videoHeight / rect.height);
    try {
      const resp = await fetch(API('/api/ai/sam2/segment'), {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ file_path: state.currentVideoFile.path, points: [[x, y]], labels: [1], frame_time: elements.video.currentTime })
      });
      const data = await resp.json();
      if (data.status === 'done' && data.result?.bbox) {
        actions.drawObjectUI(data.result.bbox);
        state.activeObject = data.result;
        if (elements.propagateBtn) elements.propagateBtn.style.display = 'block';
        if (state.autoZoom) actions.applySmartCrop();
        state.isSegmenting = false;
        elements.canvas.style.cursor = 'default';
      }
    } catch (err) { console.error(err); }
  },

  drawObjectUI: (bbox) => {
    if (!elements.aiOverlay) return;
    const ctx = elements.aiOverlay.getContext('2d');
    ctx.clearRect(0, 0, elements.aiOverlay.width, elements.aiOverlay.height);
    ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3]);
    ctx.fillStyle = 'rgba(0,255,0,0.1)';
    ctx.fillRect(bbox[0], bbox[1], bbox[2], bbox[3]);
  },

  propagateTracking: async () => {
    if (!state.currentVideoFile || !state.activeObject) return;
    actions.recordLog('ai', 'Сквозной трекинг...');
    try { await fetch(API('/api/ai/sam2/propagate'), { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ file_path: state.currentVideoFile.path, start_frame_time: elements.video?.currentTime || 0 }) }); } catch (err) { console.error(err); }
  },

  // ═══ MOTION BLUR FIX (Killer Feature #1) ═══
  runMotionBlurFix: async () => {
    actions.recordLog('ai', 'Deconvolution: убираю смаз...');
    const intensity = elements.blurFixSlider?.value || 50;
    try {
      const canvas = elements.canvas;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      fd.append('intensity', intensity);
      const resp = await fetch(API('/api/ai/forensic/deblur'), { method: 'POST', body: fd });
      if (resp.ok) {
        const resultBlob = await resp.blob();
        const img = new Image();
        img.onload = () => { const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); actions.recordLog('ai-success', `Смаз убран (intensity=${intensity})`); URL.revokeObjectURL(img.src); };
        img.src = URL.createObjectURL(resultBlob);
      } else { actions.recordLog('ai-error', await resp.text()); }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  },

  // ═══ ELA: Error Level Analysis (Killer Feature #2) ═══
  runELA: async () => {
    actions.recordLog('ai', 'ELA: Анализ подлинности...');
    try {
      const canvas = elements.canvas;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/api/ai/forensic/ela'), { method: 'POST', body: fd });
      if (resp.ok) {
        const resultBlob = await resp.blob();
        const img = new Image();
        img.onload = () => {
          // Draw ELA heatmap as overlay
          if (elements.aiOverlay) {
            const ctx = elements.aiOverlay.getContext('2d');
            elements.aiOverlay.width = canvas.width;
            elements.aiOverlay.height = canvas.height;
            ctx.globalAlpha = 0.6;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;
          }
          actions.recordLog('ai-success', 'ELA: Тепловая карта наложена. Яркие области = возможная подделка');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(resultBlob);
      } else { actions.recordLog('ai-error', await resp.text()); }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  },

  // ═══ AUTO-ANALYZE: Image Metrics Agent (Killer Feature #3) ═══
  runAutoAnalyze: async () => {
    actions.recordLog('ai', 'Авто-диагностика кадра...');
    try {
      const canvas = elements.canvas;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/api/ai/forensic/auto-analyze'), { method: 'POST', body: fd });
      const data = await resp.json();
      if (data.status === 'done') {
        const m = data.result;
        const text = `Шум: ${m.noise_level.toFixed(1)} (${m.noise_label})\nРезкость: ${m.blur_score.toFixed(1)} (${m.blur_label})\nЯркость: ${m.brightness.toFixed(1)} (${m.brightness_label})\n\nРекомендация: ${m.recommendation}`;
        if (elements.autoMetrics) elements.autoMetrics.textContent = text;
        actions.recordLog('ai-success', `Диагностика: ${m.recommendation}`);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  },

  // ═══ SYSTEM ═══
  refreshModelsStatus: async () => {
    try {
      const resp = await fetch(API('/api/system/models-status'));
      const data = await resp.json();
      if (data.status === 'done') state.modelsStatus = data.result;
    } catch { console.warn("API Offline"); }
  },

  toggleSettings: (show) => {
    if (elements.settingsModal) {
      elements.settingsModal.style.display = show ? 'flex' : 'none';
      if (show) actions.refreshModelsStatus();
    }
  },

  // ═══ UTILITY ACTIONS (used by blueprints) ═══

  downloadJson: (data, prefix = 'export') => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${prefix}-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  },

  showToast: (message, type = 'info') => {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  formatTime: (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00.000';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  },

  hashFile: async (file) => {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  fetchModels: async () => {
    try {
      const resp = await fetch(API('/ai/models'));
      return await resp.json();
    } catch { return { models: {} }; }
  },

  // Timeline / Player
  refreshTimeline: () => {
    if (!elements.video || !elements.timeline) return;
    elements.timeline.max = elements.video.duration || 0;
    elements.timeline.value = elements.video.currentTime || 0;
    if (elements.timelineCurrent) elements.timelineCurrent.textContent = actions.formatTime(elements.video.currentTime);
    if (elements.timelineDuration) elements.timelineDuration.textContent = actions.formatTime(elements.video.duration);
  },

  updateSpeed: (val) => {
    if (elements.video) elements.video.playbackRate = parseFloat(val) || 1;
  },

  updateZoom: (delta) => {
    state.zoomLevel = Math.max(0.25, Math.min(8, state.zoomLevel + delta));
    if (elements.canvas) elements.canvas.style.transform = `scale(${state.zoomLevel})`;
  },

  resetZoom: () => {
    state.zoomLevel = 1;
    if (elements.canvas) elements.canvas.style.transform = 'scale(1)';
  },

  // ═══ CASE LIBRARY (forensic) ═══

  saveCaseLibrary: () => {
    try { localStorage.setItem('playe_cases', JSON.stringify(state.caseLibrary || [])); } catch {}
  },

  loadCaseLibrary: () => {
    try { state.caseLibrary = JSON.parse(localStorage.getItem('playe_cases') || '[]'); } catch { state.caseLibrary = []; }
    return state.caseLibrary;
  },

  saveCurrentCase: () => {
    const c = {
      id: elements.caseId?.value || `CASE-${Date.now()}`,
      owner: elements.caseOwner?.value || '',
      status: elements.caseStatus?.value || 'active',
      tags: elements.caseTags?.value || '',
      summary: elements.caseSummary?.value || '',
      markers: state.markers || [],
      savedAt: new Date().toISOString()
    };
    if (!state.caseLibrary) actions.loadCaseLibrary();
    const idx = state.caseLibrary.findIndex(x => x.id === c.id);
    if (idx >= 0) state.caseLibrary[idx] = c; else state.caseLibrary.push(c);
    actions.saveCaseLibrary();
    actions.recordLog('case', `Дело ${c.id} сохранено`);
    actions.showToast(`Дело ${c.id} сохранено`, 'success');
  },

  loadCaseFromLibrary: (caseId) => {
    if (!state.caseLibrary) actions.loadCaseLibrary();
    const c = state.caseLibrary.find(x => x.id === caseId);
    if (!c) return;
    if (elements.caseId) elements.caseId.value = c.id;
    if (elements.caseOwner) elements.caseOwner.value = c.owner;
    if (elements.caseStatus) elements.caseStatus.value = c.status;
    if (elements.caseTags) elements.caseTags.value = c.tags;
    if (elements.caseSummary) elements.caseSummary.value = c.summary;
    state.markers = c.markers || [];
    actions.recordLog('case', `Дело ${c.id} загружено`);
  },

  deleteCaseFromLibrary: (caseId) => {
    if (!state.caseLibrary) actions.loadCaseLibrary();
    state.caseLibrary = state.caseLibrary.filter(x => x.id !== caseId);
    actions.saveCaseLibrary();
    actions.recordLog('case', `Дело ${caseId} удалено`);
  },

  refreshCaseLibraryOptions: () => {
    if (!state.caseLibrary) actions.loadCaseLibrary();
    // Used by forensic blueprint to populate search/load UI
  },

  // ═══ MARKERS ═══

  appendMarkerEntry: (marker) => {
    if (!state.markers) state.markers = [];
    state.markers.push({ ...marker, time: new Date().toISOString() });
    actions.recordLog('marker', `Маркер: ${marker.type} — ${marker.note}`);
  },

  // ═══ PIPELINE (enterprise) ═══

  buildFfmpegJobDraft: () => {
    return { input: state.currentVideoFile?.path || '', filters: [], output: `output-${Date.now()}.mp4` };
  },

  enqueuePipelineJob: (job) => {
    if (!state.pipelineJobs) state.pipelineJobs = [];
    state.pipelineJobs.push({ ...job, status: 'queued', id: `job-${Date.now()}` });
    actions.renderPipelineJobs();
  },

  renderPipelineJobs: () => {
    if (elements.ffmpegJobPreview) {
      elements.ffmpegJobPreview.textContent = JSON.stringify(state.pipelineJobs || [], null, 2);
    }
  },

  pausePipelineQueue: () => { state.pipelinePaused = true; actions.recordLog('pipeline', 'Queue paused'); },
  resumePipelineQueue: () => { state.pipelinePaused = false; actions.recordLog('pipeline', 'Queue resumed'); },
  retryFailedPipelineJobs: () => {
    (state.pipelineJobs || []).forEach(j => { if (j.status === 'failed') j.status = 'queued'; });
    actions.renderPipelineJobs();
    actions.recordLog('pipeline', 'Retrying failed jobs');
  },
  clearTerminalPipelineJobs: () => {
    state.pipelineJobs = (state.pipelineJobs || []).filter(j => j.status !== 'done' && j.status !== 'failed');
    actions.renderPipelineJobs();
  }
};

// ═══ ORCHESTRATOR: Register ALL 18 blueprints ═══
const orchestrator = new Orchestrator({ elements, state, actions });

const blueprints = [
  createPlaylistBlueprint(), createPlayerBlueprint(), createAiBlueprint(),
  createTimelineBlueprint(), createQualityBlueprint(), createStabilizationBlueprint(),
  createColorGradingBlueprint(), createKeyframesBlueprint(), createForensicBlueprint(),
  createEnterpriseBlueprint(), createMotionBlueprint(), createPhotoBlueprint(),
  createCompareBlueprint(), createHypothesisBlueprint(), createScreenshotBlueprint(),
  createClipBlueprint(), createAdvancedTimelineBlueprint(), createMotionTrackingAndEffectsBlueprint(),
  createAiHubBlueprint()
];

blueprints.forEach(bp => {
  try { orchestrator.register(bp); } catch (err) { console.warn(`[Skip] ${bp?.name || '?'}: ${err.message}`); }
});

window.addEventListener('DOMContentLoaded', () => {
  orchestrator.start();

  // Core event bindings
  elements.canvas?.addEventListener('mousedown', (e) => actions.handleCanvasClick(e));
  $id('ai-segment-btn')?.addEventListener('click', () => actions.toggleSmartSegmentation());
  $id('ai-propagate-btn')?.addEventListener('click', () => actions.propagateTracking());
  $id('photo-blend')?.addEventListener('click', () => actions.runTemporalEnhance());
  elements.trackStartBtn?.addEventListener('click', () => actions.toggleAutoZoom());

  // Killer features
  elements.blurFixBtn?.addEventListener('click', () => actions.runMotionBlurFix());
  elements.elaBtn?.addEventListener('click', () => actions.runELA());
  elements.autoAnalyzeBtn?.addEventListener('click', () => actions.runAutoAnalyze());

  // Settings
  elements.settingsBtn?.addEventListener('click', () => actions.toggleSettings(true));
  $id('settings-modal-close')?.addEventListener('click', () => actions.toggleSettings(false));

  // ═══ LAUNCHER LOGIC ═══
  const launcherScreen = $id('launcher-screen');
  const workspaceScreen = $id('workspace-screen');
  const statusDot = $id('launcher-status-dot');
  const statusText = $id('launcher-status-text');

  const switchToWorkspace = (mode) => {
    state.viewMode = mode;
    if (launcherScreen) launcherScreen.style.display = 'none';
    if (workspaceScreen) workspaceScreen.style.display = 'block';

    // Toggle toolbars
    const videoToolbar = $id('video-toolbar');
    const photoToolbar = $id('photo-toolbar');
    const title = $id('workspace-title');
    if (mode === 'video') {
      if (videoToolbar) videoToolbar.style.display = 'flex';
      if (photoToolbar) photoToolbar.style.display = 'none';
      if (title) title.textContent = 'Видеоанализ';
      $id('mode-video-button')?.classList.add('active');
      $id('mode-photo-button')?.classList.remove('active');
    } else {
      if (videoToolbar) videoToolbar.style.display = 'none';
      if (photoToolbar) photoToolbar.style.display = 'flex';
      if (title) title.textContent = 'Реконструкция';
      $id('mode-video-button')?.classList.remove('active');
      $id('mode-photo-button')?.classList.add('active');
    }
    actions.recordLog('system', `Режим: ${mode}`);
  };

  $id('launch-video')?.addEventListener('click', () => switchToWorkspace('video'));
  $id('launch-photo')?.addEventListener('click', () => switchToWorkspace('photo'));
  $id('back-to-menu')?.addEventListener('click', () => {
    if (launcherScreen) launcherScreen.style.display = 'flex';
    if (workspaceScreen) workspaceScreen.style.display = 'none';
  });

  // Mode switcher inside workspace
  $id('mode-video-button')?.addEventListener('click', () => switchToWorkspace('video'));
  $id('mode-photo-button')?.addEventListener('click', () => switchToWorkspace('photo'));

  // Backend health check
  const checkBackend = async () => {
    try {
      const resp = await fetch(API('/health'), { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        if (statusDot) statusDot.classList.add('online');
        if (statusText) statusText.textContent = 'Backend Online';
      }
    } catch {
      if (statusDot) statusDot.classList.remove('online');
      if (statusText) statusText.textContent = 'Offline';
    }
  };
  checkBackend();
  setInterval(checkBackend, 10000);

  // Tabs
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tabTarget;
      document.querySelectorAll(`.${target}`).forEach(p => p.classList.add('active'));
    });
  });

  actions.refreshModelsStatus();
  console.log("PLAYE Studio Pro: 19 modules loaded, 3 killer features active");

  // ═══ ENGINE WIRING: Connect UI elements to blueprint engines ═══

  // Stabilization UI → state.stabilizationAPI
  const wireStabilization = () => {
    const api = () => state.stabilizationAPI;

    elements.stabilizationToggle?.addEventListener('change', (e) => {
      api()?.setEnabled(e.target.checked);
      actions.recordLog('stabilization', `Стабилизация: ${e.target.checked ? 'ON' : 'OFF'}`);
    });

    elements.stabilizationAutoToggle?.addEventListener('change', (e) => {
      if (e.target.checked && api()) {
        api().analyze(elements.video, { totalFrames: Math.floor((elements.video?.duration || 0) * 30) });
      }
    });

    elements.stabilizationStrength?.addEventListener('input', (e) => {
      if (api()?.params) api().params({ strength: parseInt(e.target.value) });
    });

    elements.stabilizationSmoothing?.addEventListener('input', (e) => {
      if (api()?.params) api().params({ smoothness: parseInt(e.target.value) });
    });

    elements.stabilizationOffsetX?.addEventListener('input', (e) => {
      if (api()?.params) api().params({ offsetX: parseInt(e.target.value) });
    });

    elements.stabilizationOffsetY?.addEventListener('input', (e) => {
      if (api()?.params) api().params({ offsetY: parseInt(e.target.value) });
    });

    const profileButtons = [
      { el: elements.stabilizationProfileLight, mode: 'smooth' },
      { el: elements.stabilizationProfileMedium, mode: 'no_motion' },
      { el: elements.stabilizationProfileStrong, mode: 'perspective' }
    ];
    profileButtons.forEach(({ el, mode }) => {
      el?.addEventListener('click', () => {
        api()?.setMode(mode);
        actions.recordLog('stabilization', `Режим: ${mode}`);
      });
    });
  };
  wireStabilization();

  // ColorGrading wiring — exposure/contrast/etc sliders already in quality blueprint
  // The colorGrading engine provides apply() for canvas pipeline integration
  // It auto-hooks into the quality renderFrame pipeline via state.colorGradingAPI.apply()

  // Super Resolution button in AI tab
  $id('ai-sr-apply')?.addEventListener('click', async () => {
    const factor = elements.aiSrFactor?.value || '2';
    actions.recordLog('ai', `Super Resolution ${factor}x...`);
    try {
      const canvas = elements.canvas;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      fd.append('factor', factor);
      const resp = await fetch(API('/ai/upscale'), { method: 'POST', body: fd });
      if (resp.ok) {
        const resultBlob = await resp.blob();
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          actions.recordLog('ai-success', `Upscale ${factor}x: ${img.width}×${img.height}`);
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(resultBlob);
      } else {
        actions.recordLog('ai-error', `Upscale failed: ${resp.status}`);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  });

  // Face Enhance (from AI routes)
  const runFaceEnhance = async () => {
    actions.recordLog('ai', 'Face Enhance: RestoreFormer...');
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/ai/face-enhance'), { method: 'POST', body: fd });
      if (resp.ok) {
        const rb = await resp.blob();
        const img = new Image();
        img.onload = () => {
          elements.canvas.getContext('2d').drawImage(img, 0, 0, elements.canvas.width, elements.canvas.height);
          actions.recordLog('ai-success', 'Лицо восстановлено');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(rb);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // Denoise (from AI routes)
  const runDenoise = async () => {
    const strength = elements.denoiseInput?.value || 50;
    actions.recordLog('ai', `AI Denoise (strength=${strength})...`);
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      fd.append('strength', strength);
      const resp = await fetch(API('/ai/denoise'), { method: 'POST', body: fd });
      if (resp.ok) {
        const rb = await resp.blob();
        const img = new Image();
        img.onload = () => {
          elements.canvas.getContext('2d').drawImage(img, 0, 0, elements.canvas.width, elements.canvas.height);
          actions.recordLog('ai-success', 'Denoise применён');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(rb);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // OCR
  const runOCR = async () => {
    actions.recordLog('ai', 'OCR: распознавание текста...');
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/ai/ocr'), { method: 'POST', body: fd });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.text || data.result?.text || 'Текст не найден';
        actions.recordLog('ai-success', `OCR: ${text.substring(0, 100)}`);
        actions.showToast(`OCR: ${text.substring(0, 80)}`, 'success');
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // Colorize
  const runColorize = async () => {
    actions.recordLog('ai', 'Colorize...');
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/ai/colorize'), { method: 'POST', body: fd });
      if (resp.ok) {
        const rb = await resp.blob();
        const img = new Image();
        img.onload = () => {
          elements.canvas.getContext('2d').drawImage(img, 0, 0, elements.canvas.width, elements.canvas.height);
          actions.recordLog('ai-success', 'Колоризация завершена');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(rb);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // Depth estimation
  const runDepth = async () => {
    actions.recordLog('ai', 'Depth estimation...');
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      const resp = await fetch(API('/ai/depth'), { method: 'POST', body: fd });
      if (resp.ok) {
        const rb = await resp.blob();
        const img = new Image();
        img.onload = () => {
          if (elements.aiOverlay) {
            const ctx = elements.aiOverlay.getContext('2d');
            elements.aiOverlay.width = elements.canvas.width;
            elements.aiOverlay.height = elements.canvas.height;
            ctx.globalAlpha = 0.5;
            ctx.drawImage(img, 0, 0, elements.canvas.width, elements.canvas.height);
            ctx.globalAlpha = 1.0;
          }
          actions.recordLog('ai-success', 'Depth map наложена');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(rb);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // Inpaint
  const runInpaint = async () => {
    actions.recordLog('ai', 'AI Inpaint...');
    try {
      const blob = await new Promise(r => elements.canvas.toBlob(r, 'image/png'));
      const fd = new FormData();
      fd.append('file', blob, 'frame.png');
      // mask from ai overlay
      if (elements.aiOverlay) {
        const maskBlob = await new Promise(r => elements.aiOverlay.toBlob(r, 'image/png'));
        fd.append('mask', maskBlob, 'mask.png');
      }
      const resp = await fetch(API('/ai/inpaint'), { method: 'POST', body: fd });
      if (resp.ok) {
        const rb = await resp.blob();
        const img = new Image();
        img.onload = () => {
          elements.canvas.getContext('2d').drawImage(img, 0, 0, elements.canvas.width, elements.canvas.height);
          actions.recordLog('ai-success', 'Inpaint завершён');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(rb);
      }
    } catch (err) { actions.recordLog('ai-error', err.message); }
  };

  // Expose all AI actions globally for potential UI use
  actions.runFaceEnhance = runFaceEnhance;
  actions.runDenoise = runDenoise;
  actions.runOCR = runOCR;
  actions.runColorize = runColorize;
  actions.runDepth = runDepth;
  actions.runInpaint = runInpaint;
});

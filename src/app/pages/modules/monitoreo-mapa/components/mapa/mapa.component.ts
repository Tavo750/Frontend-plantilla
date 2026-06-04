import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef,
  HostListener, ChangeDetectorRef, NgZone
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { SimulacionPeriodoService } from '../../services/simulacion-periodo.service';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface AeropuertoMapa extends Aeropuerto {
  x: number;
  y: number;
  storagePct: number;
}

interface VueloAnimacion {
  codigoVuelo:   string;
  origen:        string;
  destino:       string;
  horaSalidaMs:  number;
  horaLlegadaMs: number;
  totalMaletas:  number;
}

interface PlanoEnMapa {
  vuelo:  VueloAnimacion;
  x:      number;
  y:      number;
  angulo: number;
}

interface ArcoVuelo {
  d:     string;
  vuelo: VueloAnimacion;
}

type EstadoMonitoreo = 'cargando' | 'procesando' | 'animando' | 'agotado';

// ── Componente ───────────────────────────────────────────────────────────────

@Component({
  selector:    'app-mapa',
  standalone:  false,
  templateUrl: './mapa.component.html',
  styleUrl:    './mapa.component.css'
})
export class MapaComponent implements OnInit, OnDestroy {

  // ── Aeropuertos ──────────────────────────────────────────────
  aeropuertos:          Aeropuerto[]      = [];
  aeropuertosFiltrados: AeropuertoMapa[]  = [];
  private aeropuertosMapa: AeropuertoMapa[] = [];
  aeropuertoSvgMap = new Map<string, { x: number; y: number }>();
  private maxCapacidad = 1;
  continenteSeleccionado: string | null = null;
  continentes: string[] = [];

  // ── ViewChild ────────────────────────────────────────────────
  @ViewChild('mapContainerEl') mapContainerEl!: ElementRef<HTMLDivElement>;
  private renderBounds = { left: 0, top: 0, imgW: 0, imgH: 0, cw: 0, ch: 0 };

  // ── Constantes SVG (equirectangular Simplemaps) ──────────────
  readonly SVG_W   = 2000;
  readonly SVG_H   = 857;
  readonly LAT_MAX = 84;
  readonly LAT_MIN = -70.3;
  readonly LNG_MIN = -180;
  readonly LNG_MAX = 180;
  readonly worldMapUrl = '/world.svg';

  // ── Parámetros de planificación (leídos del back, internos) ──
  K  = 60;  // velocidad de animación (seg simulados / seg real)
  Sa = 5;   // intervalo entre ejecuciones del algoritmo (min reales)

  // ── Estado del monitoreo ─────────────────────────────────────
  estadoMonitoreo: EstadoMonitoreo = 'cargando';
  ventanaActualInicio: Date | null = null;
  numeroCiclo = 0;
  procesandoEnBackground = false;

  // ── Carga inicial ─────────────────────────────────────────────
  private cargasCompletas = 0;
  error = false;

  // ── Cuenta regresiva ─────────────────────────────────────────
  cuentaRegresivaSeg = 0;
  private countdownInterval: any = null;

  // ── Polling y sincronización con el backend ───────────────────
  private pollingInterval: any = null;
  private readonly POLLING_MS = 5000;
  // Ciclo cuyo resultado ya procesamos; evita replicar la misma animación
  private ultimoCicloVisto = 0;
  // Resultado disponible pero esperando que el countdown llegue a 0 (1er ciclo)
  private resultadoPendiente: any = null;

  // ── Animación de vuelos ──────────────────────────────────────
  vuelosAnimacion: VueloAnimacion[] = [];
  planosEnMapa:    PlanoEnMapa[]    = [];
  arcosVuelo:      ArcoVuelo[]      = [];
  simTimeMs = 0;
  private animStartReal = 0;
  private animStartSim  = 0;
  private animInterval: any = null;
  private readonly TICK_MS = 80;

  // ── Estadísticas del último ciclo ────────────────────────────
  statsTotalEnvios  = 0;
  statsAsignados    = 0;
  statsNoAsignados  = 0;

  // ── Zoom / Pan ───────────────────────────────────────────────
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  private isDragging    = false;
  private dragStartX    = 0;
  private dragStartY    = 0;

  // ── Fullscreen ───────────────────────────────────────────────
  isFullscreen = false;

  // ── Tooltip de vuelo (hover sobre avión) ────────────────────
  tooltip: { visible: boolean; x: number; y: number; lines: string[] } =
    { visible: false, x: 0, y: 0, lines: [] };

  constructor(
    private readonly aeropuertoService:       AeropuertoService,
    private readonly simulacionPeriodoService: SimulacionPeriodoService,
    private readonly messageService:           MessageService,
    private readonly cdr:                      ChangeDetectorRef,
    private readonly ngZone:                   NgZone
  ) {}

  ngOnInit(): void {
    this.simulacionPeriodoService.getConfigMonitoreo().subscribe({
      next: (resp: any) => {
        const d = resp.data ?? {};
        this.K  = d['K']  ?? 60;
        this.Sa = d['Sa'] ?? 5;
        this.onCargaCompleta();
      },
      error: () => { this.onCargaCompleta(); }
    });
    this.cargarAeropuertos();
  }

  ngOnDestroy(): void {
    // Limpia timers locales; la simulación continúa en el servidor
    if (this.pollingInterval)   { clearInterval(this.pollingInterval);   this.pollingInterval   = null; }
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    this.limpiarAnimacion();
  }

  @HostListener('window:resize')
  onResize(): void { this.medirYEnriquecer(); }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!document.fullscreenElement;
    if (!this.isFullscreen) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    setTimeout(() => { this.medirYEnriquecer(); this.cdr.detectChanges(); }, 100);
  }

  onMapLoaded(): void { this.medirYEnriquecer(); }

  // ── INICIO AUTOMÁTICO ────────────────────────────────────────

  private onCargaCompleta(): void {
    this.cargasCompletas++;
    if (this.cargasCompletas < 2) return;
    this.arrancarMonitoreo();
  }

  /**
   * Lógica de arranque con tres caminos mutuamente excluyentes:
   *
   *  A) Ya se mostró el primer resultado en alguna visita anterior
   *     → Restaurar mapa desde caché. SIN POST, SIN countdown.
   *
   *  B) El POST ya fue enviado pero el resultado aún no llegó (estamos en countdown)
   *     → Retomar countdown consultando el tiempo restante al back. SIN POST.
   *
   *  C) Primera vez que se entra al módulo en esta sesión
   *     → Enviar POST UNA SOLA VEZ y arrancar countdown.
   */
  private arrancarMonitoreo(): void {
    const svc = this.simulacionPeriodoService;

    // ── CASO A: resultado ya visto antes → mapa directo, sin nada más ──
    if (svc.primerResultadoMostrado) {
      const res   = svc.ultimoResultadoCacheado;
      const ciclo = svc.ultimoCicloCacheado;
      this.ultimoCicloVisto = ciclo;
      this.numeroCiclo      = ciclo;
      const vi = res?.['ventanaInicio'] ? new Date(res['ventanaInicio']) : new Date();
      this.procesarResultadoVentana(res, vi);
      this.iniciarPolling(); // seguir escuchando nuevos ciclos
      this.cdr.detectChanges();
      return;
    }

    // ── CASO B: POST enviado pero todavía esperando resultado ──
    if (svc.monitoreoIniciado) {
      // Obtener tiempo restante del backend para sincronizar countdown
      svc.getEstado().subscribe({
        next: (resp: any) => {
          const est          = resp.data ?? {};
          const tiempoRestMs = est['tiempoRestanteCicloMs'] ?? 0;
          if (est['K'])  this.K  = est['K'];
          if (est['SA']) this.Sa = est['SA'];
          this.estadoMonitoreo    = 'procesando';
          this.cuentaRegresivaSeg = tiempoRestMs > 0
            ? Math.ceil(tiempoRestMs / 1000)
            : this.cuentaRegresivaSeg || this.Sa * 60;
          this.iniciarCountdownTick();
          this.iniciarPolling();
          this.cdr.detectChanges();
        },
        error: () => {
          // Si falla el GET, mantener el countdown que teníamos
          this.estadoMonitoreo = 'procesando';
          if (this.cuentaRegresivaSeg <= 0) this.cuentaRegresivaSeg = this.Sa * 60;
          this.iniciarCountdownTick();
          this.iniciarPolling();
          this.cdr.detectChanges();
        }
      });
      return;
    }

    // ── CASO C: primera vez — enviar POST y arrancar countdown ──
    svc.marcarIniciado();
    this.estadoMonitoreo    = 'procesando';
    this.cuentaRegresivaSeg = this.Sa * 60;

    svc.iniciarMonitoreo().subscribe({
      next:  () => {},
      error: () => {}
    });

    this.iniciarCountdownTick();
    this.iniciarPolling();
    this.cdr.detectChanges();
  }

  // ── POLLING (GET /estado cada 5 s) ───────────────────────────

  private iniciarPolling(): void {
    if (this.pollingInterval) return; // no duplicar si ya corre
    this.pollingInterval = setInterval(() => {
      this.simulacionPeriodoService.getEstado().subscribe({
        next: (resp: any) => this.procesarEstadoBackend(resp.data ?? {}),
        error: () => {}
      });
    }, this.POLLING_MS);
  }

  /**
   * Procesa cada respuesta del polling.
   *
   * Reglas clave:
   *  1. NUNCA resetea el countdown hacia arriba (eso causaba el loop infinito).
   *  2. Detecta resultado nuevo tanto en LISTO como en PROCESANDO
   *     (cuando el backend pasó de LISTO a PROCESANDO antes del próximo poll).
   *  3. Una vez en 'animando', nunca vuelve a 'procesando' (el contador no reaparece).
   */
  private procesarEstadoBackend(est: any): void {
    const fase: string         = est['fase']    ?? 'INACTIVO';
    const cicloBack: number    = est['ciclo']   ?? 0;
    const ultimoResultado: any = est['ultimoResultado'];

    if (est['K'])  this.K  = est['K'];
    if (est['SA']) this.Sa = est['SA'];
    if (est['ventanaActual']) this.ventanaActualInicio = new Date(est['ventanaActual']);

    // Actualizar número de ciclo visible
    this.numeroCiclo = cicloBack;

    // Marcar procesamiento en background (solo badge pequeño, no reinicia el contador)
    if ((fase === 'PROCESANDO' || fase === 'INICIANDO') && this.estadoMonitoreo === 'animando') {
      this.procesandoEnBackground = true;
    }

    // Limpiar badge cuando el ciclo terminó
    if (fase === 'LISTO') {
      this.procesandoEnBackground = false;
    }

    // ── Detección de resultado nuevo ──────────────────────────
    // Funciona tanto si el backend está en LISTO como si ya pasó a PROCESANDO
    // (el ciclo anterior lleva su resultado como ultimoResultado).
    const tieneVuelos = Array.isArray(ultimoResultado?.['vuelos'])
                        && (ultimoResultado['vuelos'] as any[]).length > 0;

    if (cicloBack > this.ultimoCicloVisto && tieneVuelos) {
      if (this.estadoMonitoreo === 'animando') {
        // Ciclos posteriores: actualizar mapa y caché directamente, sin contador
        this.ultimoCicloVisto = cicloBack;
        this.numeroCiclo      = cicloBack;
        this.simulacionPeriodoService.actualizarResultadoCacheado(ultimoResultado, cicloBack);
        const vi = ultimoResultado['ventanaInicio']
          ? new Date(ultimoResultado['ventanaInicio']) : new Date();
        setTimeout(() => this.procesarResultadoVentana(ultimoResultado, vi), 300);
      } else {
        // Primer ciclo: guardar y esperar a que el countdown llegue a 0
        this.resultadoPendiente = ultimoResultado;
      }
    }

    this.cdr.detectChanges();
  }

  // ── COUNTDOWN TICK (1 seg) ───────────────────────────────────

  private iniciarCountdownTick(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => {
      if (this.cuentaRegresivaSeg > 0) {
        this.cuentaRegresivaSeg--;
      }

      // Cuando llega a 0 y hay resultado: mostrar el mapa UNA SOLA VEZ
      if (this.cuentaRegresivaSeg <= 0
          && this.resultadoPendiente != null
          && this.estadoMonitoreo !== 'animando') {
        const data = this.resultadoPendiente;
        const vi   = data['ventanaInicio'] ? new Date(data['ventanaInicio']) : new Date();
        this.ultimoCicloVisto   = this.numeroCiclo;
        this.resultadoPendiente = null;
        this.aplicarResultado(data, vi);
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  // ── APLICAR RESULTADO AL MAPA ────────────────────────────────

  /**
   * Punto central donde se aplica cualquier resultado al mapa.
   * Siempre actualiza el caché del servicio singleton.
   */
  private aplicarResultado(data: any, ventanaInicio: Date): void {
    this.simulacionPeriodoService.marcarResultadoMostrado(data, this.numeroCiclo);
    this.procesarResultadoVentana(data, ventanaInicio);
  }

  private procesarResultadoVentana(data: any, ventanaInicio: Date): void {
    this.statsAsignados   = data['asignados']  ?? 0;
    this.statsNoAsignados = data['noAsignados'] ?? 0;
    this.statsTotalEnvios = this.statsAsignados + this.statsNoAsignados;
    this.procesandoEnBackground = false;

    const vuelosRaw: any[] = data['vuelos'] ?? [];
    this.vuelosAnimacion = vuelosRaw.map((v: any) => ({
      codigoVuelo:   v['codigoVuelo'],
      origen:        v['origen'],
      destino:       v['destino'],
      horaSalidaMs:  new Date(v['horaSalida']).getTime(),
      horaLlegadaMs: new Date(v['horaLlegada']).getTime(),
      totalMaletas:  v['totalMaletas'] ?? 0
    }));

    this.animStartReal   = Date.now();
    this.animStartSim    = ventanaInicio.getTime();
    this.simTimeMs       = this.animStartSim;
    this.estadoMonitoreo = 'animando';

    this.iniciarAnimacion();
    this.cdr.detectChanges();
  }

  // ── ANIMACIÓN ────────────────────────────────────────────────

  private iniciarAnimacion(): void {
    if (this.animInterval) { clearInterval(this.animInterval); this.animInterval = null; }

    this.ngZone.runOutsideAngular(() => {
      this.animInterval = setInterval(() => {
        const realElapsed = Date.now() - this.animStartReal;
        this.simTimeMs = this.animStartSim + realElapsed * this.K;
        this.actualizarPosicionAviones();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  private actualizarPosicionAviones(): void {
    const now = this.simTimeMs;
    const enVuelo = this.vuelosAnimacion.filter(
      v => now >= v.horaSalidaMs && now < v.horaLlegadaMs
    );

    this.arcosVuelo = enVuelo
      .map(v => {
        const o = this.aeropuertoSvgMap.get(v.origen);
        const d = this.aeropuertoSvgMap.get(v.destino);
        if (!o || !d) return null;
        return { d: this.calcArco(o.x, o.y, d.x, d.y), vuelo: v };
      })
      .filter((x): x is ArcoVuelo => x !== null);

    this.planosEnMapa = enVuelo
      .map(v => {
        const t = (now - v.horaSalidaMs) / (v.horaLlegadaMs - v.horaSalidaMs);
        const o = this.aeropuertoSvgMap.get(v.origen);
        const d = this.aeropuertoSvgMap.get(v.destino);
        if (!o || !d) return null;
        const cp  = this.ctrlPoint(o.x, o.y, d.x, d.y);
        const pos = this.bezierPt(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        const tan = this.bezierTan(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        return {
          vuelo:  v,
          x:      pos.x,
          y:      pos.y,
          angulo: Math.atan2(tan.dy, tan.dx) * 180 / Math.PI + 90
        };
      })
      .filter((x): x is PlanoEnMapa => x !== null);
  }

  private limpiarAnimacion(): void {
    if (this.animInterval) { clearInterval(this.animInterval); this.animInterval = null; }
    this.vuelosAnimacion = [];
    this.planosEnMapa    = [];
    this.arcosVuelo      = [];
  }

  // ── GETTERS PARA TEMPLATE ────────────────────────────────────

  get cuentaRegresivaLabel(): string {
    const seg = Math.max(0, this.cuentaRegresivaSeg);
    const m = Math.floor(seg / 60).toString().padStart(2, '0');
    const s = (seg % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  get ventanaLabel(): string {
    if (!this.ventanaActualInicio) return '';
    return new Date(this.ventanaActualInicio).toLocaleString('es-PE', {
      weekday: 'short', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  get horaSimuladaLabel(): string {
    const ms = (this.estadoMonitoreo === 'animando' && this.simTimeMs)
      ? this.simTimeMs
      : (this.ventanaActualInicio?.getTime() ?? 0);
    if (!ms) return '--:--';
    return new Date(ms).toLocaleString('es-PE', {
      weekday: 'short', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  get planosActivos(): number { return this.planosEnMapa.length; }

  // ── ZOOM / PAN ───────────────────────────────────────────────

  get transformStyle(): string {
    if (this.zoomLevel === 1 && this.panX === 0 && this.panY === 0) return 'none';
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }

  get cursorStyle(): string {
    if (this.zoomLevel <= 1) return 'default';
    return this.isDragging ? 'grabbing' : 'grab';
  }

  onMapWheel(event: WheelEvent): void {
    if (!this.isFullscreen) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.15 : 0.15;
    this.zoomLevel = Math.max(1, Math.min(6, this.zoomLevel + delta));
    if (this.zoomLevel <= 1) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    else this.clampPan();
    this.cdr.detectChanges();
  }

  onMapMouseDown(event: MouseEvent): void {
    if (this.zoomLevel <= 1) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.panX;
    this.dragStartY = event.clientY - this.panY;
    event.preventDefault();
  }

  onMapMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.panX = event.clientX - this.dragStartX;
    this.panY = event.clientY - this.dragStartY;
    this.clampPan();
    this.cdr.detectChanges();
  }

  onMapMouseUp(): void { this.isDragging = false; }

  zoomIn():    void { this.zoomLevel = Math.min(6, this.zoomLevel + 0.5); this.clampPan(); this.cdr.detectChanges(); }
  zoomOut():   void { this.zoomLevel = Math.max(1, this.zoomLevel - 0.5); if (this.zoomLevel <= 1) { this.panX = 0; this.panY = 0; } else this.clampPan(); this.cdr.detectChanges(); }
  resetZoom(): void { this.zoomLevel = 1; this.panX = 0; this.panY = 0; this.cdr.detectChanges(); }

  private clampPan(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = (w / 2) * (this.zoomLevel - 1);
    const maxY = (h / 2) * (this.zoomLevel - 1);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  // ── FULLSCREEN ───────────────────────────────────────────────

  toggleFullscreen(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  // ── TOOLTIP (hover avión) ────────────────────────────────────

  onPlaneHover(event: MouseEvent, p: PlanoEnMapa): void {
    const rect = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX = rect ? event.clientX - rect.left : event.offsetX;
    const relY = rect ? event.clientY - rect.top  : event.offsetY;
    const flip = rect ? relX > rect.width - 220 : false;
    this.tooltip = {
      visible: true,
      x: flip ? relX - 220 : relX + 14,
      y: relY + 14,
      lines: [
        `✈ Vuelo ${p.vuelo.codigoVuelo}`,
        `${p.vuelo.origen} → ${p.vuelo.destino}`,
        `${p.vuelo.totalMaletas} maletas`,
        `Llegada: ${new Date(p.vuelo.horaLlegadaMs).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
      ]
    };
  }

  onHoverEnd(): void { this.tooltip.visible = false; }

  // ── AEROPUERTOS ──────────────────────────────────────────────

  cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (response) => {
        this.aeropuertos = response.data ?? [];
        this.continentes = [...new Set(this.aeropuertos.map(a => a.continente))].sort();

        this.aeropuertoSvgMap.clear();
        this.aeropuertos.forEach(a => {
          const lat = this.parseDMS(a.latitud);
          const lon = this.parseDMS(a.longitud);
          this.aeropuertoSvgMap.set(a.codigoOaci, { x: this.lonToX(lon), y: this.latToY(lat) });
        });

        this.cdr.detectChanges();
        setTimeout(() => {
          this.medirYEnriquecer();
          this.cdr.detectChanges();
        }, 50);

        this.onCargaCompleta();
      },
      error: () => {
        this.error = true;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar los aeropuertos.' });
        this.onCargaCompleta();
      }
    });
  }

  // ── PROYECCIÓN SVG ───────────────────────────────────────────

  lonToX(lon: number): number {
    return ((lon + 180) / 360) * this.SVG_W;
  }
  latToY(lat: number): number {
    return ((this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN)) * this.SVG_H;
  }

  // ── BEZIER ───────────────────────────────────────────────────

  private ctrlPoint(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1,       dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const c = Math.min(len * 0.22, 120);
    return { x: mx + (-dy / len) * c, y: my + (dx / len) * c };
  }

  private calcArco(x1: number, y1: number, x2: number, y2: number): string {
    const cp = this.ctrlPoint(x1, y1, x2, y2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  private bezierPt(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1 - t;
    return { x: u*u*x1 + 2*u*t*cx + t*t*x2, y: u*u*y1 + 2*u*t*cy + t*t*y2 };
  }

  private bezierTan(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1 - t;
    return { dx: 2*u*(cx-x1) + 2*t*(x2-cx), dy: 2*u*(cy-y1) + 2*t*(y2-cy) };
  }

  // ── HELPERS ──────────────────────────────────────────────────

  private formatDateTime(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // ── POSICIONAMIENTO CSS aeropuertos ──────────────────────────

  private medirYEnriquecer(): void {
    this.medirContenedor();
    this.enriquecerTodosAeropuertos();
  }

  private medirContenedor(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    const iRatio = this.SVG_W / this.SVG_H;
    const cRatio = cw / ch;
    let imgW: number, imgH: number;
    if (cRatio > iRatio) { imgH = ch; imgW = imgH * iRatio; }
    else                 { imgW = cw; imgH = imgW / iRatio; }
    this.renderBounds = { left: (cw-imgW)/2, top: (ch-imgH)/2, imgW, imgH, cw, ch };
  }

  private calcPosicion(latStr: string, lngStr: string): { x: number; y: number } {
    const lat = this.parseDMS(latStr);
    const lng = this.parseDMS(lngStr);
    const fx = (lng - this.LNG_MIN) / (this.LNG_MAX - this.LNG_MIN);
    const fy = (this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN);
    if (!this.renderBounds.cw) return { x: fx * 100, y: fy * 100 };
    const px = this.renderBounds.left + fx * this.renderBounds.imgW;
    const py = this.renderBounds.top  + fy * this.renderBounds.imgH;
    return { x: (px / this.renderBounds.cw) * 100, y: (py / this.renderBounds.ch) * 100 };
  }

  private enriquecerTodosAeropuertos(): void {
    if (!this.aeropuertos.length) return;
    this.maxCapacidad = Math.max(...this.aeropuertos.map(a => a.capacidad), 1);
    this.aeropuertosMapa = this.aeropuertos.map(a => this.enriquecerAeropuerto(a));
    const base = this.continenteSeleccionado
      ? this.aeropuertosMapa.filter(a => a.continente === this.continenteSeleccionado)
      : this.aeropuertosMapa;
    this.aeropuertosFiltrados = [...base];
  }

  private enriquecerAeropuerto(a: Aeropuerto): AeropuertoMapa {
    const pos = this.calcPosicion(a.latitud, a.longitud);
    return { ...a, x: pos.x, y: pos.y, storagePct: Math.round((a.capacidad / this.maxCapacidad) * 100) };
  }

  parseDMS(dms: string): number {
    const match = dms.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return parseFloat(dms) || 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir === 'S' || dir === 's' || dir === 'W' || dir === 'w') decimal = -decimal;
    return decimal;
  }

  // ── FILTROS ──────────────────────────────────────────────────

  onContinenteChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.filtrarPorContinente(val || null);
  }

  filtrarPorContinente(continente: string | null): void {
    this.continenteSeleccionado = continente;
    this.aeropuertosFiltrados = continente
      ? this.aeropuertosMapa.filter(a => a.continente === continente)
      : [...this.aeropuertosMapa];
  }

  filtrarTabla(event: Event): void {
    const texto = (event.target as HTMLInputElement).value.toLowerCase();
    const base = this.continenteSeleccionado
      ? this.aeropuertosMapa.filter(a => a.continente === this.continenteSeleccionado)
      : this.aeropuertosMapa;
    this.aeropuertosFiltrados = base.filter(a =>
      a.codigoOaci.toLowerCase().includes(texto) ||
      a.ciudad.toLowerCase().includes(texto)     ||
      a.pais.toLowerCase().includes(texto)       ||
      a.codigo.toLowerCase().includes(texto)
    );
  }

  // ── UTILIDADES ───────────────────────────────────────────────

  getActivoClass(activo: boolean): string { return activo ? 'badge-activo' : 'badge-inactivo'; }
  getActivosCount(): number { return this.aeropuertosFiltrados.filter(a => a.activo).length; }

  // TrackBy
  trackPlano(_: number, p: PlanoEnMapa):     string { return p.vuelo.codigoVuelo; }
  trackArco (_: number, a: ArcoVuelo):       string { return a.vuelo.codigoVuelo; }
  trackAero (_: number, a: Aeropuerto):      string { return a.codigoOaci; }
}

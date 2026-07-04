import {
  Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, NgZone,
  ViewChild, ElementRef, HostListener, Renderer2
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { SimulacionService, EventoSimulacion, ResumenSimulacion } from '../../../../../core/services/simulacion.service';
import { AeropuertoService } from '../../../../../core/services/aeropuerto.service';
import { SimulacionSesionService } from '../../services/simulacion-sesion.service';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface AeropuertoPosicion {
  codigoOaci: string;
  ciudad: string;
  pais: string;
  continente: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  capacidad: number;
}

export interface VueloSimulacion {
  codigoVuelo: string;
  origen: string;
  destino: string;
  horaSalida: Date;
  horaLlegada: Date;
  totalMaletas: number;
  envios: { idEnvio: number; cantidad: number; cumpleSla?: boolean; fechaRegistroMs?: number; fechaLimiteMs?: number }[];
}

export interface ArcoVuelo {
  d: string;
  dRemaining: string;
  estado: 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO';
  vuelo: VueloSimulacion;
}

export interface PlanoEnMapa {
  vuelo: VueloSimulacion;
  x: number;
  y: number;
  angulo: number;
  progreso: number;
}

interface EventoReciente {
  mensaje: string;
  hora: Date;
  tipo: 'despegue' | 'aterrizaje';
}

export interface ResumenAeropuertoItem {
  codigoOaci: string;
  asignados: number;
  noAsignados: number;
}

// ── Componente ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-simulacion',
  standalone: false,
  templateUrl: './simulacion.component.html',
  styleUrl: './simulacion.component.css'
})
export class SimulacionComponent implements OnInit, OnDestroy, AfterViewInit {

  // ── Formulario ─────────────────────────────────────────────
  fechaInicio: Date = new Date('2026-01-01T00:00:00');
  fechaMinima: Date = new Date('2026-01-01T00:00:00');
  fechaMaxima: Date = new Date('2027-12-31T00:00:00');
  horaInicio: string = '00:00';
  dias = 5;

  // ── Estado UI ──────────────────────────────────────────────
  estado: 'idle' | 'importando' | 'cargando' | 'streaming' | 'listo' = 'idle';
  mostrarConfig = true;
  vueloSeleccionado: VueloSimulacion | null = null;
  diasEsperados = 5;
  diasRecibidos = 0;
  mensajeProgreso = '';

  // ── Datos ──────────────────────────────────────────────────
  resumen: ResumenSimulacion | null = null;
  aeropuertos: AeropuertoPosicion[] = [];
  aeropuertoMap = new Map<string, AeropuertoPosicion>();
  vuelos: VueloSimulacion[] = [];
  vueloMap  = new Map<string, VueloSimulacion>();
  arcosVuelo: ArcoVuelo[] = [];
  planosEnMapa: PlanoEnMapa[] = [];
  maletasEnAeropuerto = new Map<string, number>();

  // ── Eventos recientes ──────────────────────────────────────
  eventosRecientes: EventoReciente[] = [];
  private estadosAnteriores = new Map<string, string>();

  // ── Búsqueda ───────────────────────────────────────────────
  busqueda = '';
  vuelosBuscados: VueloSimulacion[] = [];

  // ── Resumen por aeropuerto ──────────────────────────────────
  resumenesAeropuerto = new Map<string, ResumenAeropuertoItem>();
  busquedaAeropuerto = '';
  private primerosVuelosRecibidos = false;

  // ── Gestión de vuelos (cancelar / reactivar) ────────────────
  vuelosCancelados   = new Set<string>();
  vueloParaCancelar: VueloSimulacion | null = null;
  mostrarConfirmCancelar = false;
  busquedaGestion    = '';
  cancelando         = false;
  cancelacionExitosa = false;
  codigoVueloCancelado = '';

  // ── Tooltip flotante ───────────────────────────────────────
  tooltip: { visible: boolean; x: number; y: number; lines: string[] } = {
    visible: false, x: 0, y: 0, lines: []
  };

  // ── SVG: viewBox del world.svg (equirectangular Simplemaps) ─
  readonly SVG_W   = 2000;
  readonly SVG_H   = 857;
  readonly LAT_MAX = 84;
  readonly LAT_MIN = -62.6;
  readonly MAP_X_OFFSET = -18;
  readonly MAP_Y_OFFSET = 10;
  // ── Control de tiempo ──────────────────────────────────────
  tiempoInicioMs = 0;
  tiempoFinMs    = 0;
  tiempoActualMs = 0;
  reproduciendo  = false;
  mostrarSidebar = false;
  startTimeReal  = 0;

  /** Milisegundos entre ticks de animación — 4 fps: aviones fluidos sin costo excesivo */
  private readonly TICK_MS  = 250;
  private readonly HORA_MS  = 3_600_000;
  /** Horas de simulación por tick — K=120 a 4fps: 120×0.25s/3600 (misma velocidad total) */
  private readonly AVANCE_H = 0.0083333;
  /** Ticks entre actualizaciones pesadas (semáforos, almacenes, paneles) = 1 s */
  private readonly TICKS_PESADO = 4;
  private tickCount = 0;

  private intervalId: any = null;
  private ws: WebSocket | null = null;
  private ciclosCompletados = 0;

  // ── Panel ──────────────────────────────────────────────────
  activeTab: 'vuelos' | 'almacenes' | 'envios' = 'vuelos';
  filtroVueloCodigo = '';
  filtroEstadoVuelo = '';
  sortVuelo = 'salida';
  filtroAlmacenCodigo = '';
  sortAlmacen = 'ocupacion';
  semaforoAlmacenFiltro: string | null = null;
  filtroEnvioOrigen = '';
  filtroEnvioDestino = '';
  readonly UMBRAL_AMBAR = 60;
  readonly UMBRAL_ROJO  = 85;
  cancelacionesEnMapa = new Map<string, { d: string; ox: number; oy: number; horaLlegadaMs: number }>();

  // ── Filtro de aeropuerto en mapa ───────────────────────────
  aeropuertoFiltroMapa: string | null = null;

  // ── Filtro de vuelo en mapa ────────────────────────────────
  filtroVueloMapa: string | null = null;

  // ── Filtro semáforo panel vuelos ──────────────────────────
  filtroSemVuelo = '';

  // ── Vista del panel vuelos (Todos / Salida / Llegada) ─────
  vistaVuelo: 'todos' | 'salida' | 'llegada' = 'todos';

  // ── Replanificación tras cancelar vuelo ────────────────────
  replanificando = false;

  // ── Tracking de envíos ─────────────────────────────────────
  busquedaEnvio = '';
  envioSeleccionadoId: number | null = null;
  trackingSel: any = null;
  sortEnvio: 'recientes' | 'antiguos' | 'carga' = 'recientes';

  // ── Header movible (drag) ──────────────────────────────────
  headerX: number | null = null;
  headerY: number | null = null;
  private draggingHeader = false;
  private dragOffX = 0;
  private dragOffY = 0;

  // ── Tiempo transcurrido (real y simulado) ──────────────────
  /** Wall-clock del arranque de la simulación (para "tiempo real transcurrido") */
  simInicioRealMs = 0;

  get transcurridoSimDisplay(): string {
    const ms = Math.max(0, this.tiempoActualMs - this.tiempoInicioMs);
    const dias = Math.floor(ms / 86_400_000);
    const hh = Math.floor((ms % 86_400_000) / 3_600_000).toString().padStart(2, '0');
    const mm = Math.floor((ms % 3_600_000) / 60_000).toString().padStart(2, '0');
    return `${dias} días ${hh}:${mm}`;
  }

  get transcurridoRealDisplay(): string {
    if (!this.simInicioRealMs) return '00:00:00';
    const s = Math.max(0, Math.floor((Date.now() - this.simInicioRealMs) / 1000));
    const hh = Math.floor(s / 3600).toString().padStart(2, '0');
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  // ── Barra de filtros superior ───────────────────────────────
  filtroBarraCodigo    = '';
  filtroBarraOrigen    = '';
  filtroBarraDestino   = '';
  filtroBarraContinente = '';
  filtroBarraPais      = '';
  mostrarBarraFiltros  = false;
  mostrarBarsSuperiores = true;

  // ── Stop / pausa de simulación ────────────────────────────
  simulacionPausada = false;

  // ── Búfer de datos planificados (anti-micropausas) ─────────
  /** Fin de la última ventana planificada recibida del backend (ms época UTC) */
  ventanaFinMs = 0;
  /** true cuando el reloj alcanzó el fin del búfer y espera el próximo UPDATE */
  esperandoDatos = false;

  /** Desde cuándo cada maleta está físicamente en el aeropuerto de origen de cada
   *  tramo: registro para el tramo 1, llegada del tramo anterior para escalas.
   *  Clave: `idEnvio|codigoVuelo`. Se recalcula solo al recibir datos nuevos. */
  private disponibleDesde = new Map<string, number>();

  // ── Header auto-ocultar al usar el mapa ──────────────────
  simHeaderOculto = false;
  private headerHideTimer: any = null;

  // ── Panel eventos colapsable ───────────────────────────────
  eventosExpanded = false;

  // ── Cancelación: contexto de vuelo ya en tránsito ──────────
  vueloYaEnVuelo = false;

  // ── Colapso ────────────────────────────────────────────────
  modoColapso             = false;
  colapsoDetectado        = false;
  fechaColapsoMs          = 0;
  fechaColapsoEstimadaMs  = 0;
  duracionHastaColapsoMin = 0;
  pctNoAsignados          = 0;
  colapsoMotivo           = '';
  totalCiclos             = 12;

  // ── Zoom / Pan ─────────────────────────────────────────────
  isFullscreen = false;
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  @ViewChild('mapContainerEl') mapContainerEl!: ElementRef<HTMLDivElement>;

  constructor(
    private readonly simulacionService: SimulacionService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly sesion: SimulacionSesionService,
    private readonly renderer: Renderer2,
    private readonly hostEl: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void  {
    this.renderer.addClass(document.body, 'sim-fullscreen');
    this.cargarAeropuertos();
    this.cargarFechaMinima();
  }
  ngOnDestroy(): void {
    this.renderer.removeClass(document.body, 'sim-fullscreen');
    document.removeEventListener('mousemove', this.docMouseMove);
    document.removeEventListener('mouseup', this.docMouseUp);
    this.hostEl.nativeElement.removeEventListener('wheel', this.hostWheel);
    if (this.headerHideTimer) { clearTimeout(this.headerHideTimer); this.headerHideTimer = null; }
    if (this.estado === 'listo' || this.estado === 'streaming') {
      this.sesion.guardar({
        vuelos: this.vuelos,
        arcosVuelo: this.arcosVuelo,
        tiempoInicioMs: this.tiempoInicioMs,
        tiempoFinMs: this.tiempoFinMs,
        tiempoActualMs: this.tiempoActualMs,
        resumen: this.resumen,
        resumenesAeropuerto: this.resumenesAeropuerto,
        cancelacionesEnMapa: this.cancelacionesEnMapa,
        vuelosCancelados: this.vuelosCancelados,
        modoColapso: this.modoColapso,
        colapsoDetectado: this.colapsoDetectado,
        fechaColapsoMs: this.fechaColapsoMs,
        fechaColapsoEstimadaMs: this.fechaColapsoEstimadaMs,
        colapsoMotivo: this.colapsoMotivo,
        duracionHastaColapsoMin: this.duracionHastaColapsoMin,
        pctNoAsignados: this.pctNoAsignados,
        simulacionPausada: this.simulacionPausada,
        transcurridoRealMs: this.simInicioRealMs ? Date.now() - this.simInicioRealMs : 0,
      });
    }
    this.detener();
    this.cerrarWs();
  }

  private cargarFechaMinima(): void {
    // Habilitar el selector desde la PRIMERA fecha con pedidos en la BD
    this.simulacionService.obtenerRangoDatos().subscribe({
      next: (rango) => {
        this.fechaMinima = rango.desde;
        this.fechaMaxima = rango.hasta;
        this.fechaInicio = new Date(rango.desde);
        this.cdr.detectChanges();
      }
    });
  }

  @HostListener('window:resize') onResize(): void {}

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!document.fullscreenElement;
    if (!this.isFullscreen) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    this.cdr.detectChanges();
  }

  // ── CARGA DE AEROPUERTOS ────────────────────────────────────

  private cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: resp => {
        this.aeropuertos = [];
        this.aeropuertoMap.clear();
        (resp.data ?? []).forEach(a => {
          const lat = this.parseDMS(a.latitud);
          const lon = this.parseDMS(a.longitud);
          const pos: AeropuertoPosicion = {
            codigoOaci: a.codigoOaci, ciudad: a.ciudad,
            pais: a.pais ?? '', continente: a.continente ?? '',
            lat, lon,
            x: this.lonToX(lon) + this.MAP_X_OFFSET + this.getAirportXOffset(a.codigoOaci),
            y: this.latToY(lat) + this.MAP_Y_OFFSET,
            capacidad: a.capacidad
          };
          this.aeropuertos.push(pos);
          this.aeropuertoMap.set(a.codigoOaci, pos);
        });
        this.cdr.detectChanges();
        if (this.sesion.tieneSesion) { this.restaurarSesion(); }
      }
    });
  }

//ajustar ubicaciones aeropuerto
private getAirportXOffset(codigoOaci: string): number {
  const ajustes: Record<string, number> = {
    SCEL: 15, // Santiago de Chile: mover a la derecha
    SABE: 12, // Buenos Aires: separar un poco de Montevideo
    SUAA: 18  // Montevideo: mover un poco a la derecha
  };

  return ajustes[codigoOaci] ?? 0;
}


//


  private restaurarSesion(): void {
    const snap = this.sesion.obtener();
    if (!snap) return;
    this.vuelos = snap.vuelos ?? [];
    this.vueloMap.clear();
    this.vuelos.forEach((v: VueloSimulacion) => this.vueloMap.set(v.codigoVuelo, v));
    this.arcosVuelo = snap.arcosVuelo ?? [];
    this.tiempoInicioMs = snap.tiempoInicioMs ?? 0;
    this.tiempoFinMs = snap.tiempoFinMs ?? 0;
    this.tiempoActualMs = snap.tiempoActualMs ?? 0;
    this.resumen = snap.resumen ?? null;
    this.resumenesAeropuerto = snap.resumenesAeropuerto ?? new Map();
    this.cancelacionesEnMapa = snap.cancelacionesEnMapa ?? new Map();
    this.vuelosCancelados = snap.vuelosCancelados ?? new Set();
    this.modoColapso = snap.modoColapso ?? false;
    this.colapsoDetectado = snap.colapsoDetectado ?? false;
    this.fechaColapsoMs = snap.fechaColapsoMs ?? 0;
    this.fechaColapsoEstimadaMs = snap.fechaColapsoEstimadaMs ?? 0;
    this.colapsoMotivo = snap.colapsoMotivo ?? '';
    this.duracionHastaColapsoMin = snap.duracionHastaColapsoMin ?? 0;
    this.pctNoAsignados = snap.pctNoAsignados ?? 0;
    this.simulacionPausada = snap.simulacionPausada ?? false;
    this.simInicioRealMs = Date.now() - (snap.transcurridoRealMs ?? 0);
    this.estado = 'listo';
    this.mostrarConfig = false;
    this.recomputarDisponibilidadAlmacen();
    this.actualizarEstado();
    if (!this.simulacionPausada && this.tiempoActualMs < this.tiempoFinMs) {
      this.iniciar();
    }
    this.cdr.detectChanges();
  }

  // ── SIMULACIÓN ─────────────────────────────────────────────

  ejecutarSimulacion(): void {
    this.detener();
    this.cerrarWs();
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.disponibleDesde.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.diasRecibidos = 0; this.diasEsperados = this.dias;
    this.ciclosCompletados = 0;
    this.tiempoInicioMs = 0; this.tiempoFinMs = 0; this.tiempoActualMs = 0;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosBuscados = []; this.busqueda = '';
    this.resumenesAeropuerto.clear();
    this.busquedaAeropuerto = '';
    this.primerosVuelosRecibidos = false;
    this.vuelosCancelados.clear();
    this.vueloParaCancelar = null;
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.codigoVueloCancelado = '';
    this.busquedaGestion = '';
    this.cancelando = false;

    // Reset colapso
    this.modoColapso = false;
    this.colapsoDetectado = false;
    this.fechaColapsoMs = 0;
    this.fechaColapsoEstimadaMs = 0;
    this.duracionHastaColapsoMin = 0;
    this.pctNoAsignados = 0;
    this.totalCiclos = 12;
    this.simulacionPausada = false;
    this.filtroVueloMapa = null;
    this.vistaVuelo = 'todos';
    this.busquedaEnvio = '';
    this.envioSeleccionadoId = null;
    this.trackingSel = null;
    this.replanificando = false;
    this.ventanaFinMs = 0;
    this.esperandoDatos = false;

    this.estado = 'cargando';
    this.mostrarConfig = false;
    this.mensajeProgreso = 'Conectando con el servidor de simulación...';
    this.cdr.detectChanges();

    this.conectarWebSocket();
  }

  private conectarWebSocket(): void {
    this.cerrarWs();
    const wsUrl = this.simulacionService.getWsUrl();

    this.ngZone.runOutsideAngular(() => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const startMsg = {
          type: 'START',
          fechaInicio: this.formatFecha(this.fechaInicio),
          horaInicio: this.horaInicio || '00:00',
          K: 120,
          maxMaletasSC: 5000
        };
        this.ws!.send(JSON.stringify(startMsg));
        this.ngZone.run(() => {
          this.estado = 'streaming';
          this.mensajeProgreso = 'Conectado · calculando estado inicial...';
          this.cdr.detectChanges();
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.ngZone.run(() => {
          try {
            const msg = JSON.parse(event.data);
            this.manejarMensajeWs(msg);
          } catch (e) {
            console.error('Error parsing WS simulacion', e);
          }
        });
      };

      this.ws.onerror = () => {
        this.ngZone.run(() => {
          if (this.estado !== 'listo' && this.estado !== 'idle') {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.messageService.add({
              severity: 'error', summary: 'Error WebSocket',
              detail: 'La conexión con el servidor de simulación se interrumpió.'
            });
            this.cdr.detectChanges();
          }
        });
      };

      this.ws.onclose = () => {
        this.ngZone.run(() => {
          if (this.estado === 'streaming' || this.estado === 'cargando') {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.cdr.detectChanges();
          }
        });
      };
    });
  }

  private manejarMensajeWs(msg: any): void {
    switch (msg.type) {
      case 'INIT':    this.onWsInit(msg);   break;
      case 'UPDATE':  this.onWsUpdate(msg); break;
      case 'FIN':     this.onWsFin(msg);    break;
      case 'STOPPED': break;

      case 'BUSCANDO_COLAPSO':
        this.mensajeProgreso = msg.mensaje ?? 'Analizando datos para estimar fecha de colapso...';
        this.cdr.detectChanges();
        break;

      case 'INICIO_COLAPSO': {
        this.fechaColapsoEstimadaMs = msg.fechaColapsoEstimadaMs as number;
        this.totalCiclos = msg.maxCiclos ?? 12;
        const fcEst   = new Date(this.fechaColapsoEstimadaMs);
        const fcIni   = new Date(msg.fechaInicioSimMs as number);
        this.mensajeProgreso =
          `Colapso estimado: ${fcEst.toLocaleDateString('es-PE', { timeZone: 'UTC' })} · simulando desde ${fcIni.toLocaleDateString('es-PE', { timeZone: 'UTC' })}...`;
        this.cdr.detectChanges();
        break;
      }

      case 'COLAPSO_DETECTADO':
        this.colapsoDetectado        = true;
        this.fechaColapsoMs          = msg.tiempoColapsoMs as number;
        this.duracionHastaColapsoMin = msg.duracionSimMinutos as number;
        this.pctNoAsignados          = msg.pctNoAsignados as number;
        this.colapsoMotivo           = msg.motivo ?? `${this.pctNoAsignados}% de maletas sin asignar`;
        this.messageService.add({
          severity: 'error', sticky: true,
          summary:  '⚠️ Colapso logístico confirmado',
          detail:   `Sistema colapsó el ${new Date(this.fechaColapsoMs).toLocaleDateString('es-PE', { timeZone: 'UTC' })} — ${this.colapsoMotivo}`
        });
        this.cdr.detectChanges();
        break;

      case 'ERROR':
        this.estado = 'idle'; this.mensajeProgreso = '';
        this.messageService.add({ severity: 'error', summary: 'Error en simulación', detail: msg.mensaje });
        this.cdr.detectChanges();
        break;
    }
  }

  private onWsInit(msg: any): void {
    const tiempoInicioMs = msg.tiempoSimulacionMs as number;
    this.tiempoInicioMs = tiempoInicioMs;
    this.tiempoActualMs = tiempoInicioMs;
    this.tiempoFinMs    = tiempoInicioMs;
    this.simInicioRealMs = Date.now();

    // En modo colapso el inicio lo fija el backend (no la fecha del formulario):
    // evitar que onWsUpdate lo recalcule desde la UI
    if (this.modoColapso) this.primerosVuelosRecibidos = true;

    // Aviones ya en vuelo al inicio (maletas = 0, se verán vacíos)
    (msg.vuelosEnAire ?? []).forEach((v: any) => {
      const key = v.codigoVuelo;
      if (!this.vueloMap.has(key)) {
        const vuelo: VueloSimulacion = {
          codigoVuelo: key,
          origen: v.origen, destino: v.destino,
          horaSalida:  new Date(v.horaSalidaMs),
          horaLlegada: new Date(v.horaLlegadaMs),
          totalMaletas: 0, envios: []
        };
        this.vueloMap.set(key, vuelo);
        this.vuelos.push(vuelo);
      }
    });

    if (this.vuelos.length > 0) {
      this.tiempoFinMs = this.vuelos.reduce(
        (max, v) => Math.max(max, v.horaLlegada.getTime()), tiempoInicioMs);
      this.primerosVuelosRecibidos = true;
    }

    this.computarArcos();
    this.actualizarEstado();

    // Iniciar animación a velocidad K (AVANCE_H = K=120 ya incorporado)
    if (!this.intervalId) { this.iniciarAutoPlayStreaming(); }

    this.mensajeProgreso = 'Simulación iniciada · primer ciclo ALNS en 10 seg...';
    this.cdr.detectChanges();
  }

  private onWsUpdate(msg: any): void {
    this.ciclosCompletados = msg.ciclo ?? this.ciclosCompletados + 1;
    this.diasRecibidos = this.ciclosCompletados;

    // Extender el búfer de datos planificados hasta el fin de esta ventana
    const finVentana = msg.tiempoSimulacionMs as number;
    if (finVentana && finVentana > this.ventanaFinMs) {
      this.ventanaFinMs = finVentana;
      this.esperandoDatos = false;
    }
    const stats = msg.estadisticas ?? {};
    this.mensajeProgreso =
      `Ciclo ${this.ciclosCompletados}/${stats.ciclosTotales ?? this.totalCiclos} · ${stats.asignados ?? 0} pedidos asignados`;

    (msg.nuevosVuelos ?? []).forEach((v: any) => {
      const key = v.codigoVuelo;
      if (this.vueloMap.has(key)) {
        // Vuelo ya conocido (ej. en vuelo al inicio): acumular maletas
        const existing = this.vueloMap.get(key)!;
        existing.totalMaletas += (v.totalMaletas ?? 0);
        existing.envios = [...existing.envios, ...(v.envios ?? [])];
      } else {
        const vuelo: VueloSimulacion = {
          codigoVuelo: key,
          origen: v.origen, destino: v.destino,
          horaSalida:  new Date(v.horaSalidaMs),
          horaLlegada: new Date(v.horaLlegadaMs),
          totalMaletas: v.totalMaletas ?? 0,
          envios: v.envios ?? []
        };
        this.vueloMap.set(key, vuelo);
        this.vuelos.push(vuelo);
      }
      // Resumen por aeropuerto
      if ((v.totalMaletas ?? 0) > 0) {
        if (!this.resumenesAeropuerto.has(v.origen)) {
          this.resumenesAeropuerto.set(v.origen, { codigoOaci: v.origen, asignados: 0, noAsignados: 0 });
        }
        this.resumenesAeropuerto.get(v.origen)!.asignados += v.totalMaletas ?? 0;
      }
    });

    if (this.vuelos.length > 0) {
      const newFin = this.vuelos.reduce(
        (max, v) => Math.max(max, v.horaLlegada.getTime()), this.tiempoInicioMs);
      if (newFin > this.tiempoFinMs) this.tiempoFinMs = newFin;
      if (!this.primerosVuelosRecibidos) this.primerosVuelosRecibidos = true;
    }

    this.recomputarDisponibilidadAlmacen();
    this.computarArcos();
    this.actualizarEstado();
    this.cdr.detectChanges();
  }

  private onWsFin(msg: any): void {
    this.estado = 'listo';
    this.mensajeProgreso = '';
    this.cerrarWs();

    // Si INIT no fijó tiempoInicioMs (caso borde: sin vuelosEnAire), calcular desde UI
    if (!this.tiempoInicioMs) {
      const fechaStr = this.fechaInicio instanceof Date
        ? this.fechaInicio.toISOString().substring(0, 10)
        : String(this.fechaInicio).substring(0, 10);
      this.tiempoInicioMs = new Date(`${fechaStr}T${this.horaInicio || '00:00'}:00Z`).getTime();
    }
    if (this.tiempoFinMs < this.tiempoInicioMs) this.tiempoFinMs = this.tiempoInicioMs;

    this.computarArcos();
    this.actualizarEstado();
    this.cdr.detectChanges();

    if (!this.modoColapso) {
      this.messageService.add({
        severity: 'success', summary: 'Simulación completa',
        detail: `${this.vuelos.length} vuelos · ${this.ciclosCompletados} ciclos ALNS completados`
      });
    } else if (!this.colapsoDetectado) {
      this.messageService.add({
        severity: 'warn', summary: 'Simulación de colapso finalizada',
        detail: 'No se detectó colapso en el período simulado'
      });
    }

    // Continuar la reproducción desde la posición actual: con el prefetch del
    // backend el FIN llega ANTES de que la animación alcance el final, así que
    // reiniciar aquí saltaría el reloj hacia atrás. iniciar() ya reinicia solo
    // cuando la animación llegó al final (comportamiento de replay).
    this.esperandoDatos = false;
    this.detener();
    this.iniciar();
  }

  detenerTodo(): void {
    this.sesion.limpiar(); // el usuario detuvo: no conservar sesión
    this.detener(); this.cerrarWs();
    this.ventanaFinMs = 0; this.esperandoDatos = false;
    this.estado = 'idle'; this.mostrarConfig = true;
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosCancelados.clear();
    this.vueloParaCancelar = null;
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.codigoVueloCancelado = '';
    this.busquedaGestion = '';
    this.cancelando = false;
    this.cdr.detectChanges();
  }

  private procesarEventosDia(data: { dia: number; fecha: string; eventos: EventoSimulacion[] }): void {
    (data.eventos ?? []).forEach(evento => {
      // ── Actualizar resumen por aeropuerto (todos los eventos) ──
      const keyAero = evento.origen;
      if (!this.resumenesAeropuerto.has(keyAero)) {
        this.resumenesAeropuerto.set(keyAero, { codigoOaci: keyAero, asignados: 0, noAsignados: 0 });
      }
      const stats = this.resumenesAeropuerto.get(keyAero)!;
      if (evento.estado === 'ASIGNADO') { stats.asignados++; } else { stats.noAsignados++; }

      // ── Construir rutas de vuelo (solo ASIGNADO con tramos) ──
      if (evento.estado !== 'ASIGNADO' || !evento.tramos?.length) return;
      evento.tramos.forEach(tramo => {
        const key = tramo.codigoVuelo;
        if (!this.vueloMap.has(key)) {
          const v: VueloSimulacion = {
            codigoVuelo: key,
            origen: tramo.origen, destino: tramo.destino,
            horaSalida:  new Date(tramo.horaSalida),
            horaLlegada: new Date(tramo.horaLlegada),
            totalMaletas: 0, envios: []
          };
          this.vueloMap.set(key, v);
          this.vuelos.push(v);
        }
        const v = this.vueloMap.get(key)!;
        v.totalMaletas += evento.cantidad;
        v.envios.push({ idEnvio: evento.idEnvio, cantidad: evento.cantidad, cumpleSla: evento.cumpleSla });
      });
    });

    // ── Auto-play: arrancar desde fechaInicio (aeropuertos vacíos al inicio) ──
    if (!this.primerosVuelosRecibidos && this.vuelos.length > 0) {
      this.primerosVuelosRecibidos = true;
      // Inicio = fecha elegida por el usuario (sin importar a qué hora sale el primer vuelo)
      const fechaStr = this.fechaInicio instanceof Date
        ? this.fechaInicio.toISOString().substring(0, 10)
        : String(this.fechaInicio).substring(0, 10);
      this.tiempoInicioMs = new Date(`${fechaStr}T${this.horaInicio || '00:00'}:00Z`).getTime();
      this.tiempoFinMs    = this.vuelos.reduce((max, v) => Math.max(max, v.horaLlegada.getTime()), this.tiempoInicioMs);
      this.tiempoActualMs = this.tiempoInicioMs;
      this.recomputarDisponibilidadAlmacen();
      this.computarArcos();
      this.actualizarEstado();
      this.iniciarAutoPlayStreaming();
    } else if (this.primerosVuelosRecibidos && this.vuelos.length > 0) {
      const newFin = this.vuelos.reduce((max, v) => Math.max(max, v.horaLlegada.getTime()), this.tiempoInicioMs);
      if (newFin > this.tiempoFinMs) { this.tiempoFinMs = newFin; }
      this.recomputarDisponibilidadAlmacen();
      this.computarArcos();
      this.actualizarEstado();
    }
  }

  /**
   * Recalcula `disponibleDesde` para todos los envíos conocidos.
   * Agrupa los tramos de cada envío ordenados por hora de salida: el tramo 1
   * está disponible en su origen desde el registro; cada escala, desde la
   * llegada del tramo anterior. O(vuelos × envíos), solo al llegar datos.
   */
  private recomputarDisponibilidadAlmacen(): void {
    const tramosPorEnvio = new Map<number, { vuelo: VueloSimulacion; regMs?: number }[]>();
    this.vuelos.forEach(v => {
      v.envios.forEach(e => {
        if (!tramosPorEnvio.has(e.idEnvio)) tramosPorEnvio.set(e.idEnvio, []);
        tramosPorEnvio.get(e.idEnvio)!.push({ vuelo: v, regMs: e.fechaRegistroMs });
      });
    });
    this.disponibleDesde.clear();
    tramosPorEnvio.forEach((tramos, idEnvio) => {
      tramos.sort((a, b) => a.vuelo.horaSalida.getTime() - b.vuelo.horaSalida.getTime());
      let desde = tramos[0].regMs ?? tramos[0].vuelo.horaSalida.getTime() - 3 * this.HORA_MS;
      tramos.forEach(t => {
        this.disponibleDesde.set(`${idEnvio}|${t.vuelo.codigoVuelo}`, desde);
        desde = t.vuelo.horaLlegada.getTime(); // la escala ocupa el siguiente almacén al aterrizar
      });
    });
  }

  private iniciarAutoPlayStreaming(): void {
    if (this.intervalId) return;
    this.reproduciendo = true;
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        const next = this.tiempoActualMs + this.HORA_MS * this.AVANCE_H;

        // Anti-micropausa: si el reloj alcanzó el fin del búfer planificado,
        // se retiene hasta que el backend envíe la siguiente ventana (UPDATE).
        // Con el prefetch del backend esto casi nunca ocurre; es la red de seguridad.
        if (this.estado === 'streaming' && this.ventanaFinMs > 0 && next > this.ventanaFinMs) {
          this.esperandoDatos = true;
        } else {
          this.esperandoDatos = false;
          if (this.tiempoActualMs < this.tiempoFinMs) {
            this.tiempoActualMs = Math.min(next, this.tiempoFinMs);
          }
        }
        // Tick ligero a 4 fps (posiciones); pesado 1 vez por segundo (paneles/estado)
        this.actualizarPosiciones();
        if (++this.tickCount % this.TICKS_PESADO === 0) this.actualizarEstadoPesado();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  private cerrarWs(): void {
    if (this.ws) {
      this.ws.onopen = null; this.ws.onmessage = null;
      this.ws.onerror = null; this.ws.onclose = null;
      this.ws.close(); this.ws = null;
    }
  }

  // ── CONTROL DE TIEMPO ──────────────────────────────────────

  togglePlay(): void { this.reproduciendo ? this.detener() : this.iniciar(); }

  iniciar(): void {
    if (this.tiempoActualMs >= this.tiempoFinMs) this.tiempoActualMs = this.tiempoInicioMs;
    this.reproduciendo = true;
    this.startTimeReal = Date.now();
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        // Avanza AVANCE_H horas por cada tick de TICK_MS ms
        this.tiempoActualMs += this.HORA_MS * this.AVANCE_H;
        if (this.tiempoActualMs >= this.tiempoFinMs) {
          this.tiempoActualMs = this.tiempoFinMs;
          this.detener();
        }
        // Tick ligero a 4 fps (posiciones); pesado 1 vez por segundo (paneles/estado)
        this.actualizarPosiciones();
        if (++this.tickCount % this.TICKS_PESADO === 0 || !this.reproduciendo) this.actualizarEstadoPesado();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  detener(): void {
    this.reproduciendo = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  onSliderChange(event: Event): void {
    this.tiempoActualMs = +(event.target as HTMLInputElement).value;
    this.actualizarEstado();
  }

  get tiempoLabel(): string {
    return new Date(this.tiempoActualMs).toLocaleString('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'UTC'
    });
  }

  get diaActualLabel(): string {
    if (!this.tiempoInicioMs || !this.tiempoActualMs) return '';
    const diffMs  = this.tiempoActualMs - this.tiempoInicioMs;
    const dia     = Math.max(1, Math.floor(diffMs / (24 * this.HORA_MS)) + 1);
    const hora    = new Date(this.tiempoActualMs).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    return `Día ${dia} · ${hora}`;
  }

  /** Arcos en tránsito; respeta filtros de aeropuerto, vuelo y barra */
  get arcosVisibles(): ArcoVuelo[] {
    let arcos = this.arcosVuelo.filter(a => a.estado === 'EN_VUELO');
    if (this.filtroVueloMapa) {
      arcos = arcos.filter(a => a.vuelo.codigoVuelo === this.filtroVueloMapa);
    } else {
      if (this.aeropuertoFiltroMapa) {
        const c = this.aeropuertoFiltroMapa;
        arcos = arcos.filter(a => a.vuelo.origen === c || a.vuelo.destino === c);
      }
      if (this.hayFiltrosBarra) {
        arcos = arcos.filter(a => this.vueloPassaFiltrosBarra(a.vuelo));
      }
    }
    return arcos;
  }

  /** Aviones visibles en el mapa (respeta filtros de aeropuerto, vuelo y barra) */
  get planosVisibles(): PlanoEnMapa[] {
    let planes = this.planosEnMapa;
    if (this.filtroVueloMapa) {
      planes = planes.filter(p => p.vuelo.codigoVuelo === this.filtroVueloMapa);
    } else {
      if (this.aeropuertoFiltroMapa) {
        const c = this.aeropuertoFiltroMapa;
        planes = planes.filter(p => p.vuelo.origen === c || p.vuelo.destino === c);
      }
      if (this.hayFiltrosBarra) {
        planes = planes.filter(p => this.vueloPassaFiltrosBarra(p.vuelo));
      }
    }
    return planes;
  }

  get progresoSlider(): number {
    if (this.tiempoFinMs === this.tiempoInicioMs) return 0;
    return Math.round(((this.tiempoActualMs - this.tiempoInicioMs) /
      (this.tiempoFinMs - this.tiempoInicioMs)) * 100);
  }

  // ── CÓMPUTOS ──────────────────────────────────────────────

  private computarTiempos(): void {
    if (!this.vuelos.length) return;
    this.tiempoInicioMs = this.vuelos.reduce((min, v) => Math.min(min, v.horaSalida.getTime()), Infinity);
    this.tiempoFinMs    = this.vuelos.reduce((max, v) => Math.max(max, v.horaLlegada.getTime()), 0);
    this.tiempoActualMs = this.tiempoInicioMs;
  }

  private computarArcos(): void {
    this.arcosVuelo = this.vuelos
      .map(v => {
        const o = this.aeropuertoMap.get(v.origen);
        const d = this.aeropuertoMap.get(v.destino);
        if (!o || !d) return null;
        const fullPath = this.calcArco(o.x, o.y, d.x, d.y);
        const arco: ArcoVuelo = { d: fullPath, dRemaining: fullPath, estado: 'PENDIENTE', vuelo: v };
        return arco;
      })
      .filter((x): x is ArcoVuelo => x !== null);
  }

  /** Actualización completa: posiciones + estado pesado (para eventos discretos) */
  private actualizarEstado(): void {
    this.actualizarPosiciones();
    this.actualizarEstadoPesado();
  }

  /**
   * Parte LIGERA del tick (corre a 4 fps): solo posiciones de aviones y
   * borrado de estela. Mantiene la animación fluida sin recalcular paneles.
   */
  private actualizarPosiciones(): void {
    const now = this.tiempoActualMs;

    // ── Aviones en el aire ──
    this.planosEnMapa = this.vuelos
      .filter(v => now >= v.horaSalida.getTime() && now < v.horaLlegada.getTime())
      .map(v => {
        const t = (now - v.horaSalida.getTime()) / (v.horaLlegada.getTime() - v.horaSalida.getTime());
        const o = this.aeropuertoMap.get(v.origen);
        const d = this.aeropuertoMap.get(v.destino);
        if (!o || !d) return null;
        const cp  = this.ctrlPoint(o.x, o.y, d.x, d.y);
        const pos = this.bezierPt(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        const tan = this.bezierTan(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        return { vuelo: v, x: pos.x, y: pos.y,
          angulo: Math.atan2(tan.dy, tan.dx) * 180 / Math.PI + 90, progreso: t };
      })
      .filter((x): x is PlanoEnMapa => x !== null);

    // ── Actualizar arco restante para aviones en vuelo ──
    const planoByVuelo = new Map(this.planosEnMapa.map(p => [p.vuelo.codigoVuelo, p]));
    this.arcosVuelo.forEach(arco => {
      if (arco.estado === 'EN_VUELO') {
        const plano = planoByVuelo.get(arco.vuelo.codigoVuelo);
        if (plano && plano.progreso > 0.002) {
          arco.dRemaining = this.calcArcoRemaining(arco.vuelo, plano.progreso);
        }
      }
    });
  }

  /**
   * Parte PESADA del tick (corre 1 vez por segundo): transiciones de estado,
   * eventos, ocupación de almacenes, cancelaciones y refresco de paneles.
   */
  private actualizarEstadoPesado(): void {
    const now = this.tiempoActualMs;

    // Cancelaciones de 1 día: reactivar vuelos cuyo día simulado ya pasó
    this.reactivarCanceladosExpirados();

    // ── Estado arcos + detección de eventos de transición ──
    this.arcosVuelo.forEach(arco => {
      const s = arco.vuelo.horaSalida.getTime();
      const l = arco.vuelo.horaLlegada.getTime();
      const nuevo: 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO' =
        now >= l ? 'ATERRIZADO' : now >= s ? 'EN_VUELO' : 'PENDIENTE';
      const anterior = this.estadosAnteriores.get(arco.vuelo.codigoVuelo) ?? 'PENDIENTE';
      if (anterior !== nuevo) {
        if (nuevo === 'EN_VUELO')
          this.agregarEvento(
            `Vuelo ${arco.vuelo.codigoVuelo}: ${arco.vuelo.origen} → ${arco.vuelo.destino} despegó`, 'despegue');
        else if (nuevo === 'ATERRIZADO')
          this.agregarEvento(
            `Vuelo ${arco.vuelo.codigoVuelo}: aterrizó en ${arco.vuelo.destino}`, 'aterrizaje');
        this.estadosAnteriores.set(arco.vuelo.codigoVuelo, nuevo);
      }
      arco.estado = nuevo;
    });

    // ── Maletas en aeropuerto ──
    // Una maleta ocupa el almacén de origen solo desde que EXISTE ahí a la hora
    // simulada: desde su registro (tramo 1) o desde que aterrizó su tramo anterior
    // (escalas), y hasta que su vuelo despega. Así los almacenes empiezan vacíos
    // y se llenan progresivamente, aunque el planificador trabaje por bloques.
    this.maletasEnAeropuerto.clear();
    this.vuelos.forEach(v => {
      if (now >= v.horaSalida.getTime()) return;
      let enAlmacen = 0;
      v.envios.forEach(e => {
        const desde = this.disponibleDesde.get(`${e.idEnvio}|${v.codigoVuelo}`)
          ?? e.fechaRegistroMs
          ?? v.horaSalida.getTime() - 3 * this.HORA_MS; // sin dato: aparece 3 h antes del despegue
        if (desde <= now) enAlmacen += e.cantidad;
      });
      if (enAlmacen > 0) {
        this.maletasEnAeropuerto.set(v.origen, (this.maletasEnAeropuerto.get(v.origen) ?? 0) + enAlmacen);
      }
    });

    // Limpiar marcadores de cancelación expirados (vuelo ya habría aterrizado)
    this.cancelacionesEnMapa.forEach((data, key) => {
      if (this.tiempoActualMs >= data.horaLlegadaMs) {
        this.cancelacionesEnMapa.delete(key);
      }
    });

    // Refrescar los paneles memoizados (listas/indicadores del panel derecho)
    this.bumpUi();
  }

  private agregarEvento(mensaje: string, tipo: 'despegue' | 'aterrizaje'): void {
    this.eventosRecientes.unshift({ mensaje, hora: new Date(this.tiempoActualMs), tipo });
    if (this.eventosRecientes.length > 60) this.eventosRecientes.pop();
  }

  // ── PROYECCIÓN SVG ─────────────────────────────────────────
  // world.svg es equirectangular: lon -180→+180 = x 0→2000 | lat 84°N→-70.3°S = y 0→857

  lonToX(lon: number): number { return ((lon + 180) / 360) * this.SVG_W; }
  latToY(lat: number): number {
    return ((this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN)) * this.SVG_H;
  }

  private ctrlPoint(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const dx = x2-x1,     dy = y2-y1;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const c = Math.min(len * 0.22, 120);
    return { x: mx + (-dy/len)*c, y: my + (dx/len)*c };
  }

  private calcArco(x1: number, y1: number, x2: number, y2: number): string {
    const cp = this.ctrlPoint(x1, y1, x2, y2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  private bezierPt(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1-t;
    return { x: u*u*x1 + 2*u*t*cx + t*t*x2, y: u*u*y1 + 2*u*t*cy + t*t*y2 };
  }

  private bezierTan(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1-t;
    return { dx: 2*u*(cx-x1) + 2*t*(x2-cx), dy: 2*u*(cy-y1) + 2*t*(y2-cy) };
  }

  // ── HELPERS ────────────────────────────────────────────────

  getEstadoVuelo(v: VueloSimulacion): 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO' {
    const now = this.tiempoActualMs;
    if (now >= v.horaLlegada.getTime()) return 'ATERRIZADO';
    if (now >= v.horaSalida.getTime())  return 'EN_VUELO';
    return 'PENDIENTE';
  }

  getProgresoVuelo(v: VueloSimulacion): number {
    const now = this.tiempoActualMs;
    const s = v.horaSalida.getTime(), l = v.horaLlegada.getTime();
    return Math.max(0, Math.min(100, ((now-s)/(l-s))*100));
  }

  getBagsEnAeropuerto(codigo: string): number {
    return this.maletasEnAeropuerto.get(codigo) ?? 0;
  }

  getAeroColorClass(codigo: string): string {
    const aero = this.aeropuertoMap.get(codigo);
    if (!aero) return 'aero-vacio';
    const bags = this.getBagsEnAeropuerto(codigo);
    if (bags === 0) return 'aero-vacio';
    const pct = (bags / aero.capacidad) * 100;
    if (pct < this.UMBRAL_AMBAR) return 'aero-libre';
    if (pct < this.UMBRAL_ROJO)  return 'aero-medio';
    return 'aero-critico';
  }

  getVuelosActivos():    number { return this.planosEnMapa.length; }
  getVuelosCompletados(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now).length;
  }
  getPaquetesTotales(): number { return this.vuelos.reduce((s,v) => s+v.totalMaletas, 0); }

  getMaletasEnVuelo(): number {
    return this.planosEnMapa.reduce((s,p) => s+p.vuelo.totalMaletas, 0);
  }
  getMaletasEntregadas(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now)
      .reduce((s,v) => s+v.totalMaletas, 0);
  }
  getMaletasRetrasadas(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now)
      .reduce((s,v) => s + v.envios.filter(e => e.cumpleSla === false).length, 0);
  }

  // ── SEMÁFORO (basado en cumpleSla) ─────────────────────────
  // Verde: 0% sin SLA | Ámbar: <50% sin SLA | Rojo: ≥50% sin SLA

  getVuelosAtiempo(): number {
    return this.planosEnMapa.filter(p => p.vuelo.envios.every(e => e.cumpleSla !== false)).length;
  }
  getVuelosRetrasadoLeve(): number {
    return this.planosEnMapa.filter(p => {
      const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
      const total = p.vuelo.envios.length;
      return fails > 0 && total > 0 && fails / total < 0.5;
    }).length;
  }
  getVuelosRetrasadoCritico(): number {
    return this.planosEnMapa.filter(p => {
      const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
      const total = p.vuelo.envios.length;
      return total > 0 && fails / total >= 0.5;
    }).length;
  }
  getVuelosAterrizando(): number {
    const now = this.tiempoActualMs;
    const ventana = 30 * 60 * 1000; // 30 min en ms de simulación
    return this.vuelos.filter(v => {
      const l = v.horaLlegada.getTime();
      return l <= now && l > now - ventana;
    }).length;
  }

  // ── BÚSQUEDA ───────────────────────────────────────────────

  onBuscar(event: Event): void {
    this.busqueda = (event.target as HTMLInputElement).value.toLowerCase().trim();
    if (!this.busqueda) { this.vuelosBuscados = []; return; }
    this.vuelosBuscados = this.vuelos.filter(v =>
      v.codigoVuelo.toLowerCase().includes(this.busqueda) ||
      v.origen.toLowerCase().includes(this.busqueda) ||
      v.destino.toLowerCase().includes(this.busqueda) ||
      v.envios.some(e => String(e.idEnvio).includes(this.busqueda))
    ).slice(0, 8);
  }

  limpiarBusqueda(): void { this.busqueda = ''; this.vuelosBuscados = []; }

  // ── RESUMEN POR AEROPUERTO ─────────────────────────────────

  get resumenesAeropuertoFiltrados(): ResumenAeropuertoItem[] {
    const lista = Array.from(this.resumenesAeropuerto.values())
      .sort((a, b) => (b.asignados + b.noAsignados) - (a.asignados + a.noAsignados));
    if (!this.busquedaAeropuerto) return lista;
    return lista.filter(r => r.codigoOaci.toUpperCase().includes(this.busquedaAeropuerto));
  }

  onBuscarAeropuerto(event: Event): void {
    this.busquedaAeropuerto = (event.target as HTMLInputElement).value.toUpperCase().trim();
  }

  limpiarBusquedaAeropuerto(): void { this.busquedaAeropuerto = ''; }

  // ── GESTIÓN DE VUELOS ──────────────────────────────────────

  get vuelosGestionFiltrados(): VueloSimulacion[] {
    const q = this.busquedaGestion.toUpperCase().trim();
    const lista = this.vuelos
      .filter(v => this.getEstadoVuelo(v) !== 'EN_VUELO')
      .slice()
      .sort((a, b) =>
      (a.codigoVuelo ?? '').localeCompare(b.codigoVuelo ?? ''));
    if (!q) return lista;
    return lista.filter(v =>
      (v.codigoVuelo ?? '').toUpperCase().includes(q) ||
      (v.origen ?? '').toUpperCase().includes(q) ||
      (v.destino ?? '').toUpperCase().includes(q)
    );
  }

  onBuscarGestion(event: Event): void {
    this.busquedaGestion = (event.target as HTMLInputElement).value;
  }

  limpiarBusquedaGestion(): void { this.busquedaGestion = ''; }

  /** Un vuelo PENDIENTE solo es cancelable hasta 1 h antes del despegue (hora simulada).
   *  EN_VUELO / ATERRIZADO siempre son "cancelables" pero con efecto al día siguiente. */
  puedeCancelar(v: VueloSimulacion): boolean {
    if (this.getEstadoVuelo(v) !== 'PENDIENTE') return true;
    return v.horaSalida.getTime() - this.tiempoActualMs > 3_600_000;
  }

  getCancelTitle(item: any): string {
    if (item.estadoVuelo === 'PENDIENTE') {
      return this.puedeCancelar(item.vuelo)
        ? 'Cancelar este vuelo (solo hoy)'
        : 'No cancelable: falta menos de 1 hora para el despegue';
    }
    return 'Cancelar vuelo del día siguiente';
  }

  pedirCancelarVuelo(v: VueloSimulacion): void {
    const estado = this.getEstadoVuelo(v);
    if (estado === 'PENDIENTE' && !this.puedeCancelar(v)) {
      this.messageService.add({
        severity: 'warn', summary: 'No cancelable',
        detail: 'Solo se puede cancelar hasta 1 hora antes del despegue (hora simulada).'
      });
      return;
    }
    this.vueloParaCancelar = v;
    this.vueloYaEnVuelo = estado !== 'PENDIENTE';
    this.mostrarConfirmCancelar = true;
  }

  seleccionarAeropuerto(codigo: string): void {
    this.aeropuertoFiltroMapa = this.aeropuertoFiltroMapa === codigo ? null : codigo;
    this.bumpUi();
  }

  limpiarFiltroMapa(): void {
    this.aeropuertoFiltroMapa = null;
    this.bumpUi();
  }

  toggleEventos(): void {
    this.eventosExpanded = !this.eventosExpanded;
  }

  confirmarCancelar(): void {
    if (!this.vueloParaCancelar) return;
    const codigo = this.vueloParaCancelar.codigoVuelo;
    this.cancelando = true;
    this.replanificando = true;
    this.simulacionService.cancelarVuelo(codigo).subscribe({
      next: () => {
        this.replanificando = false;
        this.vuelosCancelados.add(codigo);
        const vuelo = this.vueloParaCancelar!;
        const o = this.aeropuertoMap.get(vuelo.origen);
        const d = this.aeropuertoMap.get(vuelo.destino);
        if (o && d) {
          this.cancelacionesEnMapa.set(codigo, {
            d: this.calcArco(o.x, o.y, d.x, d.y),
            ox: o.x, oy: o.y,
            horaLlegadaMs: vuelo.horaLlegada.getTime()
          });
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Vuelo cancelado',
          detail: `${codigo} cancelado (solo por hoy) · rutas de maletas replanificadas.`
        });
        this.cerrarDialogoCancelacion();
      },
      error: (err: any) => {
        this.cancelando = false;
        this.replanificando = false;
        const detalle = err.error?.message ?? 'No se pudo cancelar el vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al cancelar', detail: detalle });
        this.cdr.detectChanges();
      }
    });
  }

  /** Las cancelaciones duran 1 día: al pasar el día simulado del vuelo, se reactiva solo. */
  private reactivarCanceladosExpirados(): void {
    if (this.vuelosCancelados.size === 0) return;
    const now = this.tiempoActualMs;
    Array.from(this.vuelosCancelados).forEach(codigo => {
      const v = this.vueloMap.get(codigo);
      if (!v) return;
      const finDia = new Date(v.horaSalida.getTime());
      finDia.setUTCHours(23, 59, 59, 999);
      if (now > finDia.getTime()) {
        this.vuelosCancelados.delete(codigo);
        this.simulacionService.reactivarVuelo(codigo).subscribe({ next: () => {}, error: () => {} });
      }
    });
  }

  cerrarDialogoCancelacion(): void {
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.vueloParaCancelar = null;
    this.codigoVueloCancelado = '';
  }

  reprogramarEnvios(): void {
    const codigo = this.codigoVueloCancelado;
    this.cerrarDialogoCancelacion();

    this.detener();
    this.cerrarWs();
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.diasRecibidos = 0; this.diasEsperados = this.dias;
    this.ciclosCompletados = 0;
    this.tiempoInicioMs = 0; this.tiempoFinMs = 0; this.tiempoActualMs = 0;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosBuscados = []; this.busqueda = '';
    this.resumenesAeropuerto.clear();
    this.busquedaAeropuerto = '';
    this.primerosVuelosRecibidos = false;
    this.vuelosCancelados.clear();
    this.busquedaGestion = '';
    this.cancelando = false;

    this.mostrarConfig = false;
    this.mensajeProgreso = `Re-enrutando envíos (vuelo ${codigo} excluido)...`;
    this.cdr.detectChanges();
    this.conectarWebSocket();
  }

  reactivarVuelo(v: VueloSimulacion): void {
    this.simulacionService.reactivarVuelo(v.codigoVuelo).subscribe({
      next: () => {
        this.vuelosCancelados.delete(v.codigoVuelo);
        this.messageService.add({
          severity: 'success', summary: 'Vuelo reactivado',
          detail: `${v.codigoVuelo} vuelto a PROGRAMADO.`
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        const detalle = err.error?.message ?? 'No se pudo reactivar el vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al reactivar', detail: detalle });
        this.cdr.detectChanges();
      }
    });
  }

  seleccionarVuelo(v: VueloSimulacion): void {
    this.vueloSeleccionado = this.vueloSeleccionado?.codigoVuelo === v.codigoVuelo ? null : v;
    this.bumpUi();
  }

  seleccionarVueloConFiltro(v: VueloSimulacion): void {
    if (this.filtroVueloMapa === v.codigoVuelo) {
      this.filtroVueloMapa = null;
      this.vueloSeleccionado = null;
    } else {
      this.filtroVueloMapa = v.codigoVuelo;
      this.aeropuertoFiltroMapa = null;
      this.seleccionarVuelo(v);
    }
    this.bumpUi();
    this.cdr.detectChanges();
  }

  // ── TOOLTIP ────────────────────────────────────────────────

  onAirportHover(event: MouseEvent, a: AeropuertoPosicion): void {
    const bags = this.getBagsEnAeropuerto(a.codigoOaci);
    const pct  = a.capacidad > 0 ? Math.round(bags / a.capacidad * 100) : 0;
    const sem  = pct >= 85 ? '🔴 Almacén crítico (>85%)'
               : pct >= 60 ? '🟡 Capacidad media (>60%)'
               : '🟢 Espacio disponible';
    const rect = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX = rect ? event.clientX - rect.left : event.offsetX;
    const relY = rect ? event.clientY - rect.top  : event.offsetY;
    const flip = rect ? relX > rect.width - 250 : false;
    this.tooltip = {
      visible: true,
      x: flip ? relX - 250 : relX + 14,
      y: relY + 14,
      lines: [
        `${a.codigoOaci} – ${a.ciudad}`,
        `Capacidad total: ${a.capacidad} maletas`,
        `En almacén: ${bags} maletas (${pct}%)`,
        sem
      ]
    };
  }

  onPlaneHover(event: MouseEvent, p: PlanoEnMapa): void {
    const rect  = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX  = rect ? event.clientX - rect.left : event.offsetX;
    const relY  = rect ? event.clientY - rect.top  : event.offsetY;
    const flip  = rect ? relX > rect.width - 250 : false;
    const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
    const slaLbl = fails === 0 ? '✅ Todos cumplen SLA' : `⚠️ ${fails} envío(s) sin SLA`;
    const envLines = p.vuelo.envios.slice(0, 5).map(e =>
      `  #${e.idEnvio}: ${e.cantidad} maletas${e.cumpleSla === false ? ' ⚠' : ''}`
    );
    const extra = p.vuelo.envios.length > 5 ? [`  ...y ${p.vuelo.envios.length-5} más`] : [];
    this.tooltip = {
      visible: true,
      x: flip ? relX - 250 : relX + 14,
      y: relY + 14,
      lines: [
        `✈ Vuelo ${p.vuelo.codigoVuelo}`,
        `${p.vuelo.origen} → ${p.vuelo.destino}`,
        `Total: ${p.vuelo.totalMaletas} maletas · ${p.vuelo.envios.length} envíos`,
        slaLbl,
        ...envLines,
        ...extra
      ]
    };
  }

  onHoverEnd(): void { this.tooltip.visible = false; }

  // ── TRACK ──────────────────────────────────────────────────

  trackPlano(_: number, p: PlanoEnMapa): string   { return p.vuelo.codigoVuelo; }
  trackAero (_: number, a: AeropuertoPosicion): string { return a.codigoOaci; }
  trackArco (_: number, a: ArcoVuelo): string     { return a.vuelo.codigoVuelo; }

  get progresoStreaming(): number {
    return Math.round((this.ciclosCompletados / 12) * 100);
  }

  // ── PARSERS ────────────────────────────────────────────────
  // Regex permisiva (igual a mapa.component.ts) + fallback a decimal puro

  parseDMS(dms: string): number {
    if (!dms) return 0;
    const s = dms.trim();
    // "12.021S" or "77.114W" — decimal degrees with direction suffix
    const decDir = s.match(/^([\d.]+)\s*([NSEWnsew])$/i);
    if (decDir) {
      let v = parseFloat(decDir[1]);
      if (/[SW]/i.test(decDir[2])) v = -v;
      return v;
    }
    // Standard DMS: "12°02'08S" or "12 02 08 S"
    const match = s.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return parseFloat(s) || 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir.toUpperCase() === 'S' || dir.toUpperCase() === 'W') decimal = -decimal;
    return decimal;
  }

  private formatFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── PANEL DATOS (memoizado) ────────────────────────────────
  // Los getters de panel se re-evalúan en CADA ciclo de change detection de
  // Angular (incluidos los provocados por eventos de mouse). Reconstruir y
  // ordenar miles de filas por ciclo congelaba la interacción con el mapa.
  // Solución: computar una vez por "versión de UI" (tick pesado de 1 s o
  // interacción del usuario vía bumpUi()) y servir el arreglo cacheado.

  private uiVersion = 0;
  private cacheVersion = -1;
  private cPanelVuelos: any[] = [];
  private cPanelAlmacenes: any[] = [];
  private cPanelEnvios: any[] = [];
  private cIndicadores: any = { enVuelo: 0, total: 0, semFlota: 'VACIO', pctAlmacenes: 0, semAlmacenes: 'VACIO' };

  /** Invalida los paneles memoizados (llamar tras cambiar filtros/orden/datos) */
  bumpUi(): void { this.uiVersion++; }

  private refrescarCachesSiHaceFalta(): void {
    if (this.cacheVersion === this.uiVersion) return;
    this.cacheVersion = this.uiVersion;
    this.cPanelAlmacenes = this.computarPanelAlmacenes();
    this.cPanelVuelos    = this.computarPanelVuelos();
    this.cPanelEnvios    = this.computarPanelEnvios();
    this.cIndicadores    = this.computarIndicadores();
  }

  get panelVuelosFiltrados(): any[] {
    this.refrescarCachesSiHaceFalta();
    return this.cPanelVuelos;
  }

  get panelAlmacenesFiltrados(): any[] {
    this.refrescarCachesSiHaceFalta();
    return this.cPanelAlmacenes;
  }

  get panelEnviosFiltrados(): any[] {
    this.refrescarCachesSiHaceFalta();
    return this.cPanelEnvios;
  }

  get simIndicadores(): { enVuelo: number; total: number; semFlota: string; pctAlmacenes: number; semAlmacenes: string } {
    this.refrescarCachesSiHaceFalta();
    return this.cIndicadores;
  }

  private computarPanelVuelos(): any[] {
    let lista = this.vuelos.map(v => {
      const cancelado = this.vuelosCancelados.has(v.codigoVuelo);
      const estado = cancelado ? 'CANCELADO' : this.getEstadoVuelo(v);
      const fails = v.envios.filter((e: any) => e.cumpleSla === false).length;
      const total = v.envios.length;
      const failRatio = total > 0 ? fails / total : 0;
      const failPct = failRatio * 100;
      // Umbrales: Libre <30%, Medio 30-65%, Crítico >65%
      const sem = total === 0 ? 'VACIO'
        : failPct < 30 ? 'VERDE'
        : failPct <= 65 ? 'AMARILLO'
        : 'ROJO';
      const semLabel = total === 0 ? '' : failPct < 30 ? 'LIBRE' : failPct <= 65 ? 'MEDIO' : 'CRITICO';
      return { vuelo: v, estadoVuelo: estado, cancelado, semaforo: sem, semLabel, slaFailPct: Math.round(failPct) };
    });
    if (this.filtroSemVuelo) lista = lista.filter(item => item.semLabel === this.filtroSemVuelo);
    if (this.filtroVueloCodigo) {
      const q = this.filtroVueloCodigo.toLowerCase();
      lista = lista.filter(item =>
        item.vuelo.codigoVuelo.toLowerCase().includes(q) ||
        item.vuelo.origen.toLowerCase().includes(q) ||
        item.vuelo.destino.toLowerCase().includes(q)
      );
    }
    if (this.aeropuertoFiltroMapa) {
      const c = this.aeropuertoFiltroMapa;
      lista = lista.filter(item => item.vuelo.origen === c || item.vuelo.destino === c);
    }
    if (this.hayFiltrosBarra) {
      lista = lista.filter(item => this.vueloPassaFiltrosBarra(item.vuelo));
    }
    // Vistas: Todos (lista estable) · Salida (pendientes por despegar) · Llegada (en vuelo por aterrizar)
    if (this.vistaVuelo === 'salida') {
      lista = lista.filter(item => item.estadoVuelo === 'PENDIENTE');
      lista.sort((a, b) => a.vuelo.horaSalida.getTime() - b.vuelo.horaSalida.getTime());
    } else if (this.vistaVuelo === 'llegada') {
      lista = lista.filter(item => item.estadoVuelo === 'EN_VUELO');
      lista.sort((a, b) => a.vuelo.horaLlegada.getTime() - b.vuelo.horaLlegada.getTime());
    } else {
      // Orden estable por código: la lista no se reordena con el tiempo simulado
      lista.sort((a, b) => a.vuelo.codigoVuelo.localeCompare(b.vuelo.codigoVuelo));
    }
    return lista.slice(0, 60);
  }

  private computarPanelAlmacenes(): any[] {
    const now = this.tiempoActualMs;
    const salen  = new Map<string, number>();
    const entran = new Map<string, number>();
    this.vuelos.forEach(v => {
      if (now < v.horaSalida.getTime())  salen.set(v.origen,  (salen.get(v.origen)   ?? 0) + 1);
      if (now < v.horaLlegada.getTime()) entran.set(v.destino, (entran.get(v.destino) ?? 0) + 1);
    });
    let lista = this.aeropuertos.map(a => {
      const ocupacion = this.maletasEnAeropuerto.get(a.codigoOaci) ?? 0;
      const pct = a.capacidad > 0 ? (ocupacion / a.capacidad) * 100 : 0;
      const sem = pct >= this.UMBRAL_ROJO ? 'ROJO' : pct >= this.UMBRAL_AMBAR ? 'AMARILLO' : ocupacion > 0 ? 'VERDE' : 'VACIO';
      return {
        codigo: a.codigoOaci, ciudad: a.ciudad, capacidad: a.capacidad,
        ocupacion, pct, semaforo: sem,
        salen: salen.get(a.codigoOaci) ?? 0, entran: entran.get(a.codigoOaci) ?? 0
      };
    });
    if (this.semaforoAlmacenFiltro) lista = lista.filter(a => a.semaforo === this.semaforoAlmacenFiltro);
    if (this.filtroAlmacenCodigo) {
      const q = this.filtroAlmacenCodigo.toLowerCase();
      lista = lista.filter(a => a.codigo.toLowerCase().includes(q) || a.ciudad.toLowerCase().includes(q));
    }
    if (this.sortAlmacen === 'ocupacion') lista.sort((a, b) => b.pct - a.pct);
    else lista.sort((a, b) => a.codigo.localeCompare(b.codigo));
    return lista;
  }

  private computarPanelEnvios(): any[] {
    // Si hay vuelo seleccionado, mostrar solo sus envíos
    if (this.vueloSeleccionado) {
      return this.vueloSeleccionado.envios.map(e => ({
        id: e.idEnvio, cantidad: e.cantidad,
        origen: this.vueloSeleccionado!.origen,
        destino: this.vueloSeleccionado!.destino,
        vuelo: this.vueloSeleccionado!.codigoVuelo,
        cumpleSla: e.cumpleSla,
        fechaRegistroMs: e.fechaRegistroMs
      }));
    }
    // Envíos que van llegando al sistema conforme se REGISTRAN (hora simulada).
    // Un envío con escalas viaja en varios vuelos: se agrupa en una sola fila
    // con la ruta punta a punta y el conteo de tramos.
    const now = this.tiempoActualMs;
    const porEnvio = new Map<number, any>();
    this.vuelos.forEach(v => {
      v.envios.forEach(e => {
        // Sin fechaRegistroMs (backend antiguo): usar la salida del vuelo como aproximación
        const regMs = e.fechaRegistroMs ?? v.horaSalida.getTime();
        if (regMs > now) return; // aún no se registra a la hora simulada
        const cur = porEnvio.get(e.idEnvio);
        if (!cur) {
          porEnvio.set(e.idEnvio, {
            id: e.idEnvio, cantidad: e.cantidad,
            origen: v.origen, destino: v.destino,
            vuelo: v.codigoVuelo, tramos: 1,
            cumpleSla: e.cumpleSla, fechaRegistroMs: e.fechaRegistroMs, regMs,
            primeraSalidaMs: v.horaSalida.getTime(),
            ultimaLlegadaMs: v.horaLlegada.getTime(),
            _vuelo: v
          });
        } else {
          cur.tramos++;
          if (v.horaSalida.getTime() < cur.primeraSalidaMs) {
            cur.primeraSalidaMs = v.horaSalida.getTime();
            cur.origen = v.origen; cur.vuelo = v.codigoVuelo; cur._vuelo = v;
          }
          if (v.horaLlegada.getTime() > cur.ultimaLlegadaMs) {
            cur.ultimaLlegadaMs = v.horaLlegada.getTime();
            cur.destino = v.destino;
          }
          if (e.cumpleSla === false) cur.cumpleSla = false;
        }
      });
    });
    let lista = Array.from(porEnvio.values());
    // Búsqueda por ID de envío/maleta
    if (this.busquedaEnvio) {
      const q = this.busquedaEnvio.trim();
      lista = lista.filter(e => String(e.id).includes(q));
    }
    // Aplicar filtro de aeropuerto del mapa
    if (this.aeropuertoFiltroMapa) {
      const c = this.aeropuertoFiltroMapa;
      lista = lista.filter(e => e.origen === c || e.destino === c);
    }
    // Aplicar filtros de barra superior
    if (this.hayFiltrosBarra) {
      lista = lista.filter(e => this.vueloPassaFiltrosBarra(e._vuelo));
    }
    // Aplicar filtro de código del panel de vuelos
    if (this.filtroVueloCodigo) {
      const q = this.filtroVueloCodigo.toLowerCase();
      lista = lista.filter(e => e.vuelo.toLowerCase().includes(q) || e.origen.toLowerCase().includes(q) || e.destino.toLowerCase().includes(q));
    }
    if (this.filtroEnvioOrigen)  { const q = this.filtroEnvioOrigen.toLowerCase();  lista = lista.filter(e => e.origen.toLowerCase().includes(q)); }
    if (this.filtroEnvioDestino) { const q = this.filtroEnvioDestino.toLowerCase(); lista = lista.filter(e => e.destino.toLowerCase().includes(q)); }
    // Ordenamiento: por defecto registros más recientes primero (se ven "insertándose" arriba)
    if (this.sortEnvio === 'carga')         lista.sort((a, b) => b.cantidad - a.cantidad);
    else if (this.sortEnvio === 'antiguos') lista.sort((a, b) => a.regMs - b.regMs);
    else                                     lista.sort((a, b) => b.regMs - a.regMs);
    return lista.slice(0, 80);
  }

  // ── TRACKING DE ENVÍOS ─────────────────────────────────────

  toggleEnvioTracking(id: number): void {
    if (this.envioSeleccionadoId === id) {
      this.envioSeleccionadoId = null;
      this.trackingSel = null;
    } else {
      this.envioSeleccionadoId = id;
      this.trackingSel = this.buildTrackingEnvio(id);
    }
    this.bumpUi();
  }

  /** Reconstruye la ruta completa de un envío a partir de los vuelos que lo transportan. */
  private buildTrackingEnvio(id: number): any {
    const tramos: any[] = [];
    let fechaRegistroMs: number | undefined;
    let fechaLimiteMs: number | undefined;
    let cantidad = 0;
    let cumpleSla: boolean | undefined;
    this.vuelos.forEach(v => {
      const e = v.envios.find(en => en.idEnvio === id);
      if (e) {
        tramos.push({ vuelo: v.codigoVuelo, origen: v.origen, destino: v.destino, salida: v.horaSalida, llegada: v.horaLlegada });
        if (e.fechaRegistroMs) fechaRegistroMs = e.fechaRegistroMs;
        if (e.fechaLimiteMs)   fechaLimiteMs   = e.fechaLimiteMs;
        cantidad = e.cantidad;
        if (e.cumpleSla !== undefined) cumpleSla = e.cumpleSla;
      }
    });
    tramos.sort((a, b) => a.salida.getTime() - b.salida.getTime());

    // Estado actual según hora simulada
    const now = this.tiempoActualMs;
    let estado = tramos.length > 0 ? `En espera en ${tramos[0].origen}` : 'Sin ruta asignada';
    let completados = 0;
    for (const t of tramos) {
      if (now >= t.llegada.getTime()) { estado = `En ${t.destino}`; completados++; }
      else if (now >= t.salida.getTime()) { estado = `En vuelo ${t.vuelo} (${t.origen} → ${t.destino})`; break; }
      else break;
    }
    if (tramos.length > 0 && completados >= tramos.length) {
      estado = `Entregado en ${tramos[tramos.length - 1].destino}`;
    }

    const inicioMs = fechaRegistroMs ?? (tramos.length ? tramos[0].salida.getTime() : 0);
    const finMs    = tramos.length ? tramos[tramos.length - 1].llegada.getTime() : 0;
    const duracionMin = finMs > inicioMs ? Math.round((finMs - inicioMs) / 60000) : 0;

    return {
      id, cantidad, cumpleSla, fechaRegistroMs, fechaLimiteMs, tramos,
      escalas: Math.max(0, tramos.length - 1),
      duracionMin, estado
    };
  }

  formatDuracion(min: number): string {
    if (min <= 0) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }

  get cancelacionesArray(): { key: string; d: string; ox: number; oy: number }[] {
    return Array.from(this.cancelacionesEnMapa.entries()).map(([key, val]) => ({ key, d: val.d, ox: val.ox, oy: val.oy }));
  }

  getSemaforoClass(sem: string): string {
    return sem === 'VERDE' ? 'sem-verde' : sem === 'AMARILLO' ? 'sem-amarillo' : sem === 'ROJO' ? 'sem-rojo' : 'sem-vacio';
  }

  getEstadoVueloLabel(estado: string): string {
    return estado === 'EN_VUELO' ? '✈' : estado === 'ATERRIZADO' ? '✓' : estado === 'CANCELADO' ? '✕' : '⏱';
  }

  getEstadoVueloClass(estado: string): string {
    return estado === 'EN_VUELO' ? 'ev-badge-vuelo' : estado === 'ATERRIZADO' ? 'ev-badge-aterrizado' : estado === 'CANCELADO' ? 'ev-badge-cancelado' : 'ev-badge-pendiente';
  }

  setSortVuelo(sort: string): void    { this.sortVuelo = sort; this.bumpUi(); }
  setVistaVuelo(v: 'todos' | 'salida' | 'llegada'): void { this.vistaVuelo = v; this.bumpUi(); }
  setSortAlmacen(sort: string): void  { this.sortAlmacen = sort; this.bumpUi(); }
  setFiltroEstadoVuelo(e: string): void         { this.filtroEstadoVuelo = e; this.bumpUi(); }
  filtrarPorSemaforoAlmacen(s: string | null): void { this.semaforoAlmacenFiltro = s; this.bumpUi(); }
  limpiarFiltrosEnvios(): void { this.filtroEnvioOrigen = ''; this.filtroEnvioDestino = ''; this.bumpUi(); }

  trackPanelVuelo(_: number, item: any): string  { return item.vuelo.codigoVuelo; }
  trackPanelAlmacen(_: number, item: any): string { return item.codigo; }
  trackPanelEnvio(_: number, item: any): any     { return `${item.id}-${item.vuelo ?? ''}`; }
  trackCancelacion(_: number, item: any): string  { return item.key; }

  toggleFullscreen(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // ── ZOOM / PAN ─────────────────────────────────────────────

  get transformStyle(): string {
    if (this.zoomLevel === 1 && this.panX === 0 && this.panY === 0) return 'none';
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }

  get cursorStyle(): string {
    if (this.zoomLevel <= 1) return 'default';
    return this.isDragging ? 'grabbing' : 'grab';
  }

  zoomIn():    void { this.zoomLevel = Math.min(6, this.zoomLevel + 0.5); this.clampPan(); this.cdr.detectChanges(); }
  zoomOut():   void { this.zoomLevel = Math.max(1, this.zoomLevel - 0.5); if (this.zoomLevel <= 1) { this.panX = 0; this.panY = 0; } else this.clampPan(); this.cdr.detectChanges(); }
  resetZoom(): void { this.zoomLevel = 1; this.panX = 0; this.panY = 0; this.cdr.detectChanges(); }

  onMapMouseDown(event: MouseEvent): void {
    if (this.zoomLevel <= 1) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.panX;
    this.dragStartY = event.clientY - this.panY;
    event.preventDefault();
  }

  onMapMouseUp(): void { this.isDragging = false; }

  private clampPan(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const maxX = (w / 2) * (this.zoomLevel - 1);
    const maxY = (h / 2) * (this.zoomLevel - 1);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  // ── INDICADORES GLOBALES ────────────────────────────────────

  private computarIndicadores(): { enVuelo: number; total: number; semFlota: string; pctAlmacenes: number; semAlmacenes: string } {
    const enVuelo = this.planosEnMapa.length;
    const total = this.vuelos.length;
    const pctFlota = total > 0 ? (enVuelo / total) * 100 : 0;
    const semFlota = pctFlota >= 20 ? 'VERDE' : pctFlota > 0 ? 'AMARILLO' : 'VACIO';
    const almList = this.cPanelAlmacenes;
    const pctAlmacenes = almList.length > 0
      ? almList.reduce((s: number, a: any) => s + (a.pct as number), 0) / almList.length
      : 0;
    const semAlmacenes = pctAlmacenes >= this.UMBRAL_ROJO ? 'ROJO' : pctAlmacenes >= this.UMBRAL_AMBAR ? 'AMARILLO' : pctAlmacenes > 0 ? 'VERDE' : 'VACIO';
    return { enVuelo, total, semFlota, pctAlmacenes, semAlmacenes };
  }

  // ── DIMMING DE AEROPUERTOS EN MAPA (filtro por semáforo) ────

  getSemaforoAeropuerto(codigo: string): string {
    const aero = this.aeropuertoMap.get(codigo);
    if (!aero) return 'VACIO';
    const bags = this.maletasEnAeropuerto.get(codigo) ?? 0;
    const pct = aero.capacidad > 0 ? (bags / aero.capacidad) * 100 : 0;
    if (pct >= this.UMBRAL_ROJO)  return 'ROJO';
    if (pct >= this.UMBRAL_AMBAR) return 'AMARILLO';
    if (bags > 0) return 'VERDE';
    return 'VACIO';
  }

  esAeropuertoDimmed(codigo: string): boolean {
    if (this.aeropuertoFiltroMapa !== null) return this.aeropuertoFiltroMapa !== codigo;
    if (this.semaforoAlmacenFiltro !== null) return this.getSemaforoAeropuerto(codigo) !== this.semaforoAlmacenFiltro;
    return false;
  }

  simularColapso(): void {
    this.detener();
    this.cerrarWs();
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.disponibleDesde.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.diasRecibidos = 0; this.diasEsperados = 5;
    this.ciclosCompletados = 0;
    this.tiempoInicioMs = 0; this.tiempoFinMs = 0; this.tiempoActualMs = 0;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosBuscados = []; this.busqueda = '';
    this.resumenesAeropuerto.clear();
    this.busquedaAeropuerto = '';
    this.primerosVuelosRecibidos = false;
    this.vuelosCancelados.clear();
    this.vueloParaCancelar = null;
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.codigoVueloCancelado = '';
    this.busquedaGestion = '';
    this.cancelando = false;

    // Estado colapso
    this.modoColapso             = true;
    this.colapsoDetectado        = false;
    this.fechaColapsoMs          = 0;
    this.fechaColapsoEstimadaMs  = 0;
    this.duracionHastaColapsoMin = 0;
    this.pctNoAsignados          = 0;
    this.colapsoMotivo           = '';
    this.totalCiclos             = 12;
    this.ventanaFinMs            = 0;
    this.esperandoDatos          = false;

    this.estado = 'cargando';
    this.mostrarConfig = false;
    this.mensajeProgreso = 'Analizando datos 2026-2029 para estimar fecha de colapso...';
    this.cdr.detectChanges();

    this.conectarWebSocketColapso();
  }

  private conectarWebSocketColapso(): void {
    this.cerrarWs();
    const wsUrl = this.simulacionService.getWsUrl();

    this.ngZone.runOutsideAngular(() => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ type: 'START_COLAPSO', K: 120 }));
        this.ngZone.run(() => {
          this.estado = 'streaming';
          this.mensajeProgreso = 'Buscando fecha de colapso en los datos...';
          this.cdr.detectChanges();
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.ngZone.run(() => {
          try {
            const msg = JSON.parse(event.data);
            this.manejarMensajeWs(msg);
          } catch (e) {
            console.error('Error parsing WS colapso', e);
          }
        });
      };

      this.ws.onerror = () => {
        this.ngZone.run(() => {
          if (this.estado !== 'listo' && this.estado !== 'idle') {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.messageService.add({
              severity: 'error', summary: 'Error WebSocket',
              detail: 'La conexión con el servidor se interrumpió.'
            });
            this.cdr.detectChanges();
          }
        });
      };

      this.ws.onclose = () => {
        this.ngZone.run(() => {
          if (this.estado === 'streaming' || this.estado === 'cargando') {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.cdr.detectChanges();
          }
        });
      };
    });
  }

  get fechaRealDisplay(): string {
    const now = new Date();
    const d = now.getDate().toString().padStart(2, '0');
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const y = now.getFullYear();
    const h = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  }

  get fechaSimDisplay(): string {
    // El tiempo simulado es época UTC (el backend serializa LocalDateTime con ZoneOffset.UTC):
    // usar getters UTC evita el corrimiento de -5 h de la zona local (Perú)
    const simDate = new Date(this.tiempoActualMs);
    const d = simDate.getUTCDate().toString().padStart(2, '0');
    const m = (simDate.getUTCMonth() + 1).toString().padStart(2, '0');
    const y = simDate.getUTCFullYear();
    const h = simDate.getUTCHours().toString().padStart(2, '0');
    const min = simDate.getUTCMinutes().toString().padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  }

  // ── FILTROS BARRA SUPERIOR ─────────────────────────────────

  get hayFiltrosBarra(): boolean {
    return !!(this.filtroBarraCodigo || this.filtroBarraOrigen || this.filtroBarraDestino ||
              this.filtroBarraContinente || this.filtroBarraPais);
  }

  limpiarBarraFiltros(): void {
    this.filtroBarraCodigo = '';
    this.filtroBarraOrigen = '';
    this.filtroBarraDestino = '';
    this.filtroBarraContinente = '';
    this.filtroBarraPais = '';
    this.bumpUi();
  }

  vueloPassaFiltrosBarra(vuelo: VueloSimulacion): boolean {
    if (this.filtroBarraCodigo) {
      if (!vuelo.codigoVuelo.toLowerCase().includes(this.filtroBarraCodigo.toLowerCase())) return false;
    }
    if (this.filtroBarraOrigen) {
      if (!vuelo.origen.toUpperCase().includes(this.filtroBarraOrigen.toUpperCase())) return false;
    }
    if (this.filtroBarraDestino) {
      if (!vuelo.destino.toUpperCase().includes(this.filtroBarraDestino.toUpperCase())) return false;
    }
    if (this.filtroBarraContinente || this.filtroBarraPais) {
      const aO = this.aeropuertoMap.get(vuelo.origen);
      const aD = this.aeropuertoMap.get(vuelo.destino);
      if (this.filtroBarraContinente) {
        const q = this.filtroBarraContinente.toUpperCase();
        const match = (aO?.continente?.toUpperCase().includes(q) ?? false) ||
                      (aD?.continente?.toUpperCase().includes(q) ?? false);
        if (!match) return false;
      }
      if (this.filtroBarraPais) {
        const q = this.filtroBarraPais.toLowerCase();
        const match = (aO?.pais?.toLowerCase().includes(q) ?? false) ||
                      (aD?.pais?.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
    }
    return true;
  }

  // ── COLOR SEMÁFORO AVIÓN ───────────────────────────────────

  getAvionColorClass(plano: PlanoEnMapa): string {
    const v = plano.vuelo;
    if (v.totalMaletas === 0 || v.envios.length === 0) return 'avion-gris';
    const fails = v.envios.filter(e => e.cumpleSla === false).length;
    const ratio = fails / v.envios.length;
    if (ratio >= 0.5) return 'avion-rojo';
    if (ratio > 0)    return 'avion-amarillo';
    return 'avion-verde';
  }

  // ── ARCO RESTANTE (borra trail mientras avanza) ────────────

  private calcArcoRemaining(v: VueloSimulacion, t: number): string {
    const o = this.aeropuertoMap.get(v.origen);
    const d = this.aeropuertoMap.get(v.destino);
    if (!o || !d) return '';
    const cp  = this.ctrlPoint(o.x, o.y, d.x, d.y);
    const Q1x = (1 - t) * cp.x + t * d.x;
    const Q1y = (1 - t) * cp.y + t * d.y;
    const pos = this.bezierPt(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
    return `M ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} Q ${Q1x.toFixed(1)} ${Q1y.toFixed(1)} ${d.x.toFixed(1)} ${d.y.toFixed(1)}`;
  }

  // ── STOP / PAUSA DE SIMULACIÓN ─────────────────────────────

  toggleStop(): void {
    this.simulacionPausada = !this.simulacionPausada;
    if (this.simulacionPausada) {
      this.detener();
    } else {
      this.iniciar();
    }
  }

  // ── HEADER AUTO-OCULTAR ────────────────────────────────────

  // ── DRAG DEL HEADER ────────────────────────────────────────

  onHeaderDragStart(ev: MouseEvent): void {
    const header = (ev.currentTarget as HTMLElement).closest('.sim-header') as HTMLElement | null;
    if (!header) return;
    const parent = (header.offsetParent as HTMLElement) ?? header.parentElement!;
    const parentRect = parent.getBoundingClientRect();
    const rect = header.getBoundingClientRect();
    this.dragOffX = ev.clientX - rect.left;
    this.dragOffY = ev.clientY - rect.top;
    // Fijar posición actual como punto de partida (quita el centrado por CSS)
    this.headerX = rect.left - parentRect.left;
    this.headerY = rect.top - parentRect.top;
    this.draggingHeader = true;
    ev.preventDefault();
    ev.stopPropagation();
  }

  /**
   * Listeners de mouse registrados FUERA de NgZone.
   *
   * Un binding (mousemove) de template dispara un ciclo completo de change
   * detection de Angular por cada pixel recorrido — con miles de vuelos eso
   * congelaba la interacción. Aquí los gestos (pan del mapa, arrastre del
   * header) mutan el DOM directamente y solo se sincroniza el estado Angular
   * al soltar el mouse (un único detectChanges por gesto).
   */
  ngAfterViewInit(): void {
    const host = this.hostEl.nativeElement as HTMLElement;
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.docMouseMove, { passive: true });
      document.addEventListener('mouseup', this.docMouseUp, { passive: true });
      host.addEventListener('wheel', this.hostWheel, { passive: false });
    });
  }

  private readonly docMouseMove = (ev: MouseEvent): void => {
    // 1. Arrastre del header flotante → posición directa al DOM
    if (this.draggingHeader) {
      const header = this.hostEl.nativeElement.querySelector('.sim-header') as HTMLElement | null;
      const parent = header?.offsetParent as HTMLElement | null;
      if (header && parent) {
        const parentRect = parent.getBoundingClientRect();
        this.headerX = Math.max(0, Math.min(parentRect.width - 60, ev.clientX - parentRect.left - this.dragOffX));
        this.headerY = Math.max(0, Math.min(parentRect.height - 40, ev.clientY - parentRect.top - this.dragOffY));
        header.style.left = this.headerX + 'px';
        header.style.top = this.headerY + 'px';
        header.style.transform = 'none';
      }
      return;
    }
    // 2. Pan del mapa → transform directo al DOM (sin change detection)
    if (this.isDragging) {
      this.panX = ev.clientX - this.dragStartX;
      this.panY = ev.clientY - this.dragStartY;
      this.clampPan();
      this.aplicarTransformDirecto();
      return;
    }
    // 3. Auto-mostrar header al acercar el mouse arriba (solo si cambia el estado)
    if (this.simHeaderOculto && ev.clientY < 150) {
      this.ngZone.run(() => {
        this.simHeaderOculto = false;
        if (this.headerHideTimer) { clearTimeout(this.headerHideTimer); this.headerHideTimer = null; }
        this.cdr.detectChanges();
      });
    }
  };

  private readonly docMouseUp = (): void => {
    const habiaGesto = this.draggingHeader || this.isDragging;
    this.draggingHeader = false;
    this.isDragging = false;
    if (habiaGesto) {
      // Sincronizar el estado Angular una sola vez al terminar el gesto
      this.ngZone.run(() => this.cdr.detectChanges());
    }
  };

  private readonly hostWheel = (ev: WheelEvent): void => {
    const enMapa = (ev.target as HTMLElement)?.closest?.('.map-container');
    if (!enMapa) return;
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -0.2 : 0.2;
    this.zoomLevel = Math.max(1, Math.min(6, this.zoomLevel + delta));
    if (this.zoomLevel <= 1) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    else this.clampPan();
    this.aplicarTransformDirecto();
    this.programarOcultarHeader();
  };

  /** Aplica el transform de zoom/pan directamente al layer (sin pasar por Angular) */
  private aplicarTransformDirecto(): void {
    const layer = this.hostEl.nativeElement.querySelector('.map-transform-layer') as HTMLElement | null;
    if (layer) layer.style.transform = this.transformStyle;
  }

  private programarOcultarHeader(): void {
    if (this.headerHideTimer) clearTimeout(this.headerHideTimer);
    this.headerHideTimer = setTimeout(() => {
      this.simHeaderOculto = true;
      this.headerHideTimer = null;
      this.cdr.detectChanges();
    }, 1500);
  }

  // ── OPCIONES ÚNICAS PARA FILTROS ──────────────────────────

  // Cacheadas por cantidad de vuelos/aeropuertos (solo cambian al llegar datos)
  private cUniqueKey = -1;
  private cUniqueOrigenes: string[] = [];
  private cUniqueDestinos: string[] = [];
  private cUniqueContinentes: string[] = [];
  private cUniquePaises: string[] = [];

  private refrescarUniquesSiHaceFalta(): void {
    const key = this.vuelos.length * 100000 + this.aeropuertos.length;
    if (key === this.cUniqueKey) return;
    this.cUniqueKey = key;
    this.cUniqueOrigenes    = Array.from(new Set(this.vuelos.map(v => v.origen))).sort();
    this.cUniqueDestinos    = Array.from(new Set(this.vuelos.map(v => v.destino))).sort();
    this.cUniqueContinentes = Array.from(new Set(this.aeropuertos.map(a => a.continente).filter(Boolean))).sort();
    this.cUniquePaises      = Array.from(new Set(this.aeropuertos.map(a => a.pais).filter(Boolean))).sort();
  }

  get uniqueOrigenes(): string[]    { this.refrescarUniquesSiHaceFalta(); return this.cUniqueOrigenes; }
  get uniqueDestinos(): string[]    { this.refrescarUniquesSiHaceFalta(); return this.cUniqueDestinos; }
  get uniqueContinentes(): string[] { this.refrescarUniquesSiHaceFalta(); return this.cUniqueContinentes; }
  get uniquePaises(): string[]      { this.refrescarUniquesSiHaceFalta(); return this.cUniquePaises; }
}

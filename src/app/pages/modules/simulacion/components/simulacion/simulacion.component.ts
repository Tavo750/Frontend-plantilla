import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone,
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
  envios: { idEnvio: number; cantidad: number; cumpleSla?: boolean }[];
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
export class SimulacionComponent implements OnInit, OnDestroy {

  // ── Formulario ─────────────────────────────────────────────
  fechaInicio: Date = new Date('2026-01-02');
  fechaMinima: Date = new Date('2026-01-02');
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

  /** Milisegundos entre ticks de animación (1 s real = fluido y ligero) */
  private readonly TICK_MS  = 1000;
  private readonly HORA_MS  = 3_600_000;
  /** Horas de simulación por tick — K=120 a 1fps: 120×1s/3600 */
  private readonly AVANCE_H = 0.03333;

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
    private readonly renderer: Renderer2
  ) {}

  ngOnInit(): void  {
    this.renderer.addClass(document.body, 'sim-fullscreen');
    this.cargarAeropuertos();
    this.cargarFechaMinima();
  }
  ngOnDestroy(): void {
    this.renderer.removeClass(document.body, 'sim-fullscreen');
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
        duracionHastaColapsoMin: this.duracionHastaColapsoMin,
        pctNoAsignados: this.pctNoAsignados,
        simulacionPausada: this.simulacionPausada,
      });
    }
    this.detener();
    this.cerrarWs();
  }

  private cargarFechaMinima(): void {
    this.simulacionService.obtenerFechaMinima().subscribe({
      next: (fecha) => {
        this.fechaMinima = fecha;
        this.fechaInicio = new Date(fecha);
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
    this.duracionHastaColapsoMin = snap.duracionHastaColapsoMin ?? 0;
    this.pctNoAsignados = snap.pctNoAsignados ?? 0;
    this.simulacionPausada = snap.simulacionPausada ?? false;
    this.estado = 'listo';
    this.mostrarConfig = false;
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
          maxMaletasSC: 1500
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
          `Colapso estimado: ${fcEst.toLocaleDateString('es-PE')} · simulando desde ${fcIni.toLocaleDateString('es-PE')}...`;
        this.cdr.detectChanges();
        break;
      }

      case 'COLAPSO_DETECTADO':
        this.colapsoDetectado        = true;
        this.fechaColapsoMs          = msg.tiempoColapsoMs as number;
        this.duracionHastaColapsoMin = msg.duracionSimMinutos as number;
        this.pctNoAsignados          = msg.pctNoAsignados as number;
        this.messageService.add({
          severity: 'error', sticky: true,
          summary:  '⚠️ Colapso logístico confirmado',
          detail:   `Sistema colapsó el ${new Date(this.fechaColapsoMs).toLocaleDateString('es-PE')} — ${this.pctNoAsignados}% de maletas sin asignar`
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

    this.computarArcos();
    this.actualizarEstado();
    this.cdr.detectChanges();
  }

  private onWsFin(msg: any): void {
    this.estado = 'listo';
    this.mensajeProgreso = '';
    this.cerrarWs();

    // Si INIT no fijó tiempoInicioMs (caso borde: sin vuelosEnAire), calcular desde UI
    // Se agrega 'Z' para interpretar como UTC, igual que el backend (ZoneOffset.UTC)
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

    // Reiniciar reproducción desde el inicio
    this.detener();
    this.tiempoActualMs = this.tiempoInicioMs;
    this.iniciar();
  }

  detenerTodo(): void {
    this.sesion.limpiar(); // el usuario detuvo: no conservar sesión
    this.detener(); this.cerrarWs();
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
      // Se agrega 'Z' para interpretar como UTC, igual que el backend (ZoneOffset.UTC)
      const fechaStr = this.fechaInicio instanceof Date
        ? this.fechaInicio.toISOString().substring(0, 10)
        : String(this.fechaInicio).substring(0, 10);
      this.tiempoInicioMs = new Date(`${fechaStr}T${this.horaInicio || '00:00'}:00Z`).getTime();
      this.tiempoFinMs    = this.vuelos.reduce((max, v) => Math.max(max, v.horaLlegada.getTime()), this.tiempoInicioMs);
      this.tiempoActualMs = this.tiempoInicioMs;
      this.computarArcos();
      this.actualizarEstado();
      this.iniciarAutoPlayStreaming();
    } else if (this.primerosVuelosRecibidos && this.vuelos.length > 0) {
      const newFin = this.vuelos.reduce((max, v) => Math.max(max, v.horaLlegada.getTime()), this.tiempoInicioMs);
      if (newFin > this.tiempoFinMs) { this.tiempoFinMs = newFin; }
      this.computarArcos();
      this.actualizarEstado();
    }
  }

  private iniciarAutoPlayStreaming(): void {
    if (this.intervalId) return;
    this.reproduciendo = true;
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        if (this.tiempoActualMs < this.tiempoFinMs) {
          this.tiempoActualMs += this.HORA_MS * this.AVANCE_H;
          if (this.tiempoActualMs > this.tiempoFinMs) { this.tiempoActualMs = this.tiempoFinMs; }
        }
        // No llama detener() — sigue avanzando mientras llegan más días vía SSE
        this.actualizarEstado();
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
        this.actualizarEstado();
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
    // Usar timeZone UTC porque el backend genera timestamps en ZoneOffset.UTC
    return new Date(this.tiempoActualMs).toLocaleString('es-PE', {
      timeZone: 'UTC',
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  get diaActualLabel(): string {
    if (!this.tiempoInicioMs || !this.tiempoActualMs) return '';
    const diffMs  = this.tiempoActualMs - this.tiempoInicioMs;
    const dia     = Math.max(1, Math.floor(diffMs / (24 * this.HORA_MS)) + 1);
    // Usar timeZone UTC porque el backend genera timestamps en ZoneOffset.UTC
    const hora    = new Date(this.tiempoActualMs).toLocaleTimeString('es-PE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
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

  private actualizarEstado(): void {
    const now = this.tiempoActualMs;

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

    // ── Maletas en aeropuerto (aún no han salido) ──
    this.maletasEnAeropuerto.clear();
    this.vuelos.forEach(v => {
      if (now < v.horaSalida.getTime()) {
        const cur = this.maletasEnAeropuerto.get(v.origen) ?? 0;
        this.maletasEnAeropuerto.set(v.origen, cur + v.totalMaletas);
      }
    });

    // Limpiar marcadores de cancelación expirados (vuelo ya habría aterrizado)
    this.cancelacionesEnMapa.forEach((data, key) => {
      if (this.tiempoActualMs >= data.horaLlegadaMs) {
        this.cancelacionesEnMapa.delete(key);
      }
    });
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

  pedirCancelarVuelo(v: VueloSimulacion): void {
    this.vueloParaCancelar = v;
    this.vueloYaEnVuelo = this.getEstadoVuelo(v) === 'EN_VUELO';
    this.mostrarConfirmCancelar = true;
  }

  seleccionarAeropuerto(codigo: string): void {
    this.aeropuertoFiltroMapa = this.aeropuertoFiltroMapa === codigo ? null : codigo;
  }

  limpiarFiltroMapa(): void {
    this.aeropuertoFiltroMapa = null;
  }

  toggleEventos(): void {
    this.eventosExpanded = !this.eventosExpanded;
  }

  confirmarCancelar(): void {
    if (!this.vueloParaCancelar) return;
    const codigo = this.vueloParaCancelar.codigoVuelo;
    this.cancelando = true;
    this.simulacionService.cancelarVuelo(codigo).subscribe({
      next: () => {
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
          detail: `${codigo} ha sido cancelado y los envíos serán reprogramados automáticamente.`
        });
        this.cerrarDialogoCancelacion();
      },
      error: (err: any) => {
        this.cancelando = false;
        const detalle = err.error?.message ?? 'No se pudo cancelar el vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al cancelar', detail: detalle });
        this.cdr.detectChanges();
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

  // ── PANEL DATOS ────────────────────────────────────────────

  get panelVuelosFiltrados(): any[] {
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
    const now = this.tiempoActualMs;
    if (this.sortVuelo === 'maletas')         lista.sort((a, b) => b.vuelo.totalMaletas - a.vuelo.totalMaletas);
    else if (this.sortVuelo === 'proxSalida') lista.sort((a, b) => Math.abs(a.vuelo.horaSalida.getTime() - now) - Math.abs(b.vuelo.horaSalida.getTime() - now));
    else                                       lista.sort((a, b) => Math.abs(a.vuelo.horaLlegada.getTime() - now) - Math.abs(b.vuelo.horaLlegada.getTime() - now));
    return lista.slice(0, 60);
  }

  get panelAlmacenesFiltrados(): any[] {
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

  get panelEnviosFiltrados(): any[] {
    // Si hay vuelo seleccionado, mostrar solo sus envíos
    if (this.vueloSeleccionado) {
      return this.vueloSeleccionado.envios.map(e => ({
        id: e.idEnvio, cantidad: e.cantidad,
        origen: this.vueloSeleccionado!.origen,
        destino: this.vueloSeleccionado!.destino,
        vuelo: this.vueloSeleccionado!.codigoVuelo,
        cumpleSla: e.cumpleSla
      }));
    }
    const todos: any[] = [];
    this.vuelos.slice(0, 200).forEach(v => {
      v.envios.forEach(e => {
        todos.push({ id: e.idEnvio, cantidad: e.cantidad, origen: v.origen, destino: v.destino, vuelo: v.codigoVuelo, cumpleSla: e.cumpleSla, _vuelo: v });
      });
    });
    let lista = todos;
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
    return lista.slice(0, 80);
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

  setSortVuelo(sort: string): void    { this.sortVuelo = sort; }
  setSortAlmacen(sort: string): void  { this.sortAlmacen = sort; }
  setFiltroEstadoVuelo(e: string): void         { this.filtroEstadoVuelo = e; }
  filtrarPorSemaforoAlmacen(s: string | null): void { this.semaforoAlmacenFiltro = s; }
  limpiarFiltrosEnvios(): void { this.filtroEnvioOrigen = ''; this.filtroEnvioDestino = ''; }

  trackPanelVuelo(_: number, item: any): string  { return item.vuelo.codigoVuelo; }
  trackPanelAlmacen(_: number, item: any): string { return item.codigo; }
  trackPanelEnvio(_: number, item: any): any     { return item.id; }
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

  onMapWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.2 : 0.2;
    this.zoomLevel = Math.max(1, Math.min(6, this.zoomLevel + delta));
    if (this.zoomLevel <= 1) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    else this.clampPan();
    this.programarOcultarHeader();
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

  get simIndicadores(): { enVuelo: number; total: number; semFlota: string; pctAlmacenes: number; semAlmacenes: string } {
    const enVuelo = this.planosEnMapa.length;
    const total = this.vuelos.length;
    const pctFlota = total > 0 ? (enVuelo / total) * 100 : 0;
    const semFlota = pctFlota >= 20 ? 'VERDE' : pctFlota > 0 ? 'AMARILLO' : 'VACIO';
    const almList = this.panelAlmacenesFiltrados;
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
    this.totalCiclos             = 12;

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
    // El backend genera los timestamps usando ZoneOffset.UTC, por eso
    // se deben usar los métodos UTC para evitar el desfase horario local.
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

  onSimWrapMouseMove(event: MouseEvent): void {
    if (this.simHeaderOculto && event.clientY < 150) {
      this.simHeaderOculto = false;
      if (this.headerHideTimer) { clearTimeout(this.headerHideTimer); this.headerHideTimer = null; }
      this.cdr.detectChanges();
    }
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

  get uniqueOrigenes(): string[] {
    return Array.from(new Set(this.vuelos.map(v => v.origen))).sort();
  }
  get uniqueDestinos(): string[] {
    return Array.from(new Set(this.vuelos.map(v => v.destino))).sort();
  }
  get uniqueContinentes(): string[] {
    return Array.from(new Set(this.aeropuertos.map(a => a.continente).filter(Boolean))).sort();
  }
  get uniquePaises(): string[] {
    return Array.from(new Set(this.aeropuertos.map(a => a.pais).filter(Boolean))).sort();
  }
}
